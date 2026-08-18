import logging
from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session

from app.core.access_control import (
    enforce_entitlement,
    require_doctor_practitioner_access,
    require_user_branch_access,
)
from app.modules.appointments.models import AppointmentStatus
from app.modules.audit.service import diff_changes, record_audit_event
from app.modules.consultations.models import (
    Consultation,
    ConsultationAddendum,
    ConsultationStatus,
)
from app.modules.consultations.repositories import (
    ConsultationDetailRepository,
    ConsultationReferenceRepository,
    ConsultationRepository,
)
from app.modules.consultations.schemas import (
    ConsultationAddendumCreate,
    ConsultationCreate,
    ConsultationSignRequest,
    ConsultationUpdate,
)
from app.modules.consultations.services.billing_service import (
    ConsultationBillingService,
)
from app.modules.consultations.services.detail_builder import (
    STRUCTURED_FIELD_NAMES,
    StructuredRowWriter,
)
from app.modules.identity.models import User
from app.modules.notifications.models import NotificationEventType, NotificationProvider
from app.modules.notifications.service import (
    queue_notification_if_allowed,
    queue_sms_template_if_allowed,
    queue_whatsapp_template_if_allowed,
    whatsapp_template_integration_enabled,
)

logger = logging.getLogger(__name__)


class ConsultationRecordService:
    """Manages the consultation note lifecycle: creation, updates, signing, and
    addendums."""

    def __init__(self, session: Session):
        self.session = session
        self.consultations = ConsultationRepository(session)
        self.details = ConsultationDetailRepository(session)
        self.references = ConsultationReferenceRepository(session)
        self.structured_rows = StructuredRowWriter(session)
        self.billing = ConsultationBillingService(session)

    def _get_or_404(self, tenant_id: str, consultation_id: str) -> Consultation:
        consultation = self.consultations.get_for_tenant(tenant_id, consultation_id)
        if not consultation:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Consultation not found"
            )
        return consultation

    def _medicine_audit_text(self, consultation_id: str) -> str | None:
        rows = self.details.list_medicines(consultation_id)
        text = "; ".join(
            " | ".join(
                part.strip()
                for part in (
                    row.medicine_name,
                    row.dosage,
                    row.frequency,
                    row.duration,
                    row.instructions,
                )
                if part and part.strip()
            )
            for row in rows
        )
        return text or None

    def _lab_service_audit_text(self, consultation_id: str) -> str | None:
        rows = self.details.list_referrals(consultation_id)
        text = "; ".join(
            " | ".join(
                part.strip()
                for part in (row.item_name, row.priority, row.instructions)
                if part and part.strip()
            )
            for row in rows
            if row.referral_type.lower() == "lab"
        )
        return text or None

    def _require_sign_ready(self, consultation: Consultation) -> None:
        missing: list[str] = []
        if not consultation.treatment_type or not consultation.treatment_type.strip():
            missing.append("treatment_type")
        complaints = self.details.list_complaints(consultation.id)
        if not consultation.chief_complaint or not consultation.chief_complaint.strip():
            has_complaint_text = False
        else:
            has_complaint_text = True
        if not has_complaint_text and not complaints:
            missing.append("complaints")
        diagnoses = self.details.list_diagnoses(consultation.id)
        if not consultation.diagnosis or not consultation.diagnosis.strip():
            has_diagnosis_text = False
        else:
            has_diagnosis_text = True
        if not has_diagnosis_text and not diagnoses:
            missing.append("diagnosis")
        if not consultation.clinical_notes or not consultation.clinical_notes.strip():
            missing.append("clinical_notes")
        medicines = self.details.list_medicines(consultation.id)
        incomplete_medicines = [
            row.medicine_name
            for row in medicines
            if (
                not row.dosage
                or not row.dosage.strip()
                or not row.frequency
                or not row.frequency.strip()
            )
        ]
        if incomplete_medicines:
            missing.append("medicine_dosage_frequency")
        if missing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Consultation is not ready to sign. Missing: {', '.join(missing)}",
            )

    def create_consultation(
        self, *, tenant_id: str, payload: ConsultationCreate, actor: User
    ) -> Consultation:
        enforce_entitlement(self.session, tenant_id, "consultations")
        appointment = self.references.get_appointment_for_tenant(
            tenant_id, payload.appointment_id
        )
        if not appointment:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid appointment"
            )
        require_user_branch_access(actor, appointment.branch_id)
        require_doctor_practitioner_access(
            self.session, tenant_id, actor, appointment.practitioner_id
        )
        patient = self.references.get_patient_for_tenant(
            tenant_id, appointment.patient_id
        )
        if not patient:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid patient"
            )

        consultation = Consultation.model_validate(
            payload,
            update={
                "tenant_id": tenant_id,
                "branch_id": appointment.branch_id,
                "patient_id": appointment.patient_id,
                "practitioner_id": appointment.practitioner_id,
                "status": ConsultationStatus.DRAFT,
                "created_by_user_id": payload.created_by_user_id or actor.id,
                "updated_by_user_id": payload.created_by_user_id or actor.id,
            },
        )
        appointment.status = AppointmentStatus.IN_CONSULTATION
        appointment.updated_by_user_id = actor.id
        self.consultations.add(consultation)
        self.references.add_appointment(appointment)
        try:
            self.session.commit()
        except IntegrityError as exc:
            self.session.rollback()
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Consultation already exists for this appointment",
            ) from exc
        self.session.refresh(consultation)
        self.session.refresh(appointment)
        self.structured_rows.replace_from_payload(consultation, payload)
        self.session.commit()
        record_audit_event(
            self.session,
            tenant_id=tenant_id,
            branch_id=consultation.branch_id,
            actor_user_id=actor.id,
            action="consultation.created",
            resource_type="consultation",
            resource_id=consultation.id,
            purpose="treatment",
        )
        return consultation

    def update_consultation(
        self,
        *,
        tenant_id: str,
        consultation_id: str,
        payload: ConsultationUpdate,
        actor: User,
    ) -> Consultation:
        enforce_entitlement(self.session, tenant_id, "consultations")
        consultation = self._get_or_404(tenant_id, consultation_id)
        require_user_branch_access(actor, consultation.branch_id)
        require_doctor_practitioner_access(
            self.session, tenant_id, actor, consultation.practitioner_id
        )
        if consultation.status == ConsultationStatus.SIGNED:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Signed consultation records are immutable",
            )

        update_fields = payload.model_dump(exclude_unset=True)
        audit_keys = {key for key in update_fields if key not in STRUCTURED_FIELD_NAMES}
        audit_keys.add("status")
        if "medicines" in update_fields:
            audit_keys.discard("prescription_text")
        if "referrals" in update_fields:
            audit_keys.discard("lab_referral_text")
        before = {key: getattr(consultation, key) for key in audit_keys}
        if "medicines" in update_fields:
            before["medicines"] = self._medicine_audit_text(consultation.id)
        if "referrals" in update_fields:
            before["lab_services"] = self._lab_service_audit_text(consultation.id)
        for key, value in update_fields.items():
            if key in STRUCTURED_FIELD_NAMES:
                continue
            setattr(consultation, key, value)
        now = datetime.now(timezone.utc)
        consultation.status = ConsultationStatus.IN_PROGRESS
        consultation.updated_at = now
        consultation.updated_by_user_id = actor.id
        self.consultations.add(consultation)
        self.structured_rows.replace_from_payload(consultation, payload)
        self.session.commit()
        self.session.refresh(consultation)
        after = {key: getattr(consultation, key) for key in audit_keys}
        if "medicines" in update_fields:
            after["medicines"] = self._medicine_audit_text(consultation.id)
        if "referrals" in update_fields:
            after["lab_services"] = self._lab_service_audit_text(consultation.id)
        record_audit_event(
            self.session,
            tenant_id=tenant_id,
            branch_id=consultation.branch_id,
            actor_user_id=actor.id,
            action="consultation.updated",
            resource_type="consultation",
            resource_id=consultation.id,
            purpose="treatment",
            changes=diff_changes(
                before,
                after,
                labels={
                    "medicines": "Medicines",
                    "lab_services": "Lab & Services",
                },
            ),
        )
        return consultation

    def sign_consultation(
        self,
        *,
        tenant_id: str,
        consultation_id: str,
        payload: ConsultationSignRequest,
        actor: User,
    ) -> Consultation:
        enforce_entitlement(self.session, tenant_id, "consultations")
        consultation = self._get_or_404(tenant_id, consultation_id)
        require_user_branch_access(actor, consultation.branch_id)
        require_doctor_practitioner_access(
            self.session, tenant_id, actor, consultation.practitioner_id
        )
        if consultation.status == ConsultationStatus.SIGNED:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Consultation already signed",
            )
        self._require_sign_ready(consultation)

        before = {
            "status": consultation.status,
            "signed_by_user_id": consultation.signed_by_user_id,
            "signed_at": consultation.signed_at,
        }
        now = datetime.now(timezone.utc)
        consultation.status = ConsultationStatus.SIGNED
        consultation.signed_by_user_id = actor.id
        consultation.updated_by_user_id = actor.id
        consultation.signed_at = now
        consultation.updated_at = now

        appointment = self.references.get_appointment_for_tenant(
            tenant_id, consultation.appointment_id
        )
        if appointment:
            appointment.status = AppointmentStatus.CONSULTATION_COMPLETED
            appointment.updated_at = now
            appointment.updated_by_user_id = actor.id
            self.references.add_appointment(appointment)

        queue_entry = self.references.get_queue_entry_for_appointment(
            tenant_id, consultation.appointment_id
        )
        if queue_entry:
            queue_entry.status = AppointmentStatus.CONSULTATION_COMPLETED
            queue_entry.completed_at = now
            queue_entry.updated_at = now
            self.references.add_queue_entry(queue_entry)

        self.consultations.add(consultation)
        self.session.commit()
        self.session.refresh(consultation)
        after = {
            "status": consultation.status,
            "signed_by_user_id": consultation.signed_by_user_id,
            "signed_at": consultation.signed_at,
        }
        record_audit_event(
            self.session,
            tenant_id=tenant_id,
            branch_id=consultation.branch_id,
            actor_user_id=actor.id,
            action="consultation.signed",
            resource_type="consultation",
            resource_id=consultation.id,
            purpose="treatment",
            changes=diff_changes(before, after),
        )
        # Free (membership-covered) consultations otherwise never get a billing
        # entry. Signing is already committed above, so never let an invoicing
        # error fail the sign — log and continue.
        try:
            self.billing.auto_invoice_membership_consultation(
                tenant_id=tenant_id,
                consultation=consultation,
                appointment=appointment,
                actor_user_id=actor.id,
            )
        except Exception:
            logger.warning(
                "Auto-invoice for membership consultation %s failed",
                consultation.id,
                exc_info=True,
            )
            self.session.rollback()
        patient = self.references.get_patient_for_tenant(
            tenant_id, consultation.patient_id
        )
        if consultation.follow_up_advice and patient:
            # The clinician's free-text advice cannot go into a DLT-registered
            # SMS body, which only substitutes pre-approved variable slots. SMS
            # gets a generic "a follow-up is due" alert; the specific advice
            # stays on WhatsApp and in-app, which are not DLT-restricted.
            queue_sms_template_if_allowed(
                self.session,
                tenant_id=tenant_id,
                branch_id=consultation.branch_id,
                flow_key="follow_up_reminder_patient",
                patient=patient,
                resource_type="consultation",
                resource_id=consultation.id,
                dedupe_key=f"sms:consultation:{consultation.id}:follow-up",
                variables={"patient_name": patient.full_name},
                queued_by_user_id=actor.id,
            )
            template_event = queue_whatsapp_template_if_allowed(
                self.session,
                tenant_id=tenant_id,
                branch_id=consultation.branch_id,
                flow_key="follow_up_advice_patient",
                recipient=patient.mobile,
                resource_type="consultation",
                resource_id=consultation.id,
                dedupe_key=f"whatsapp:consultation:{consultation.id}:follow-up-advice",
                queued_by_user_id=actor.id,
            )
            if not template_event and not whatsapp_template_integration_enabled(
                self.session, tenant_id
            ):
                queue_notification_if_allowed(
                    self.session,
                    tenant_id=tenant_id,
                    branch_id=consultation.branch_id,
                    provider=NotificationProvider.WHATSAPP,
                    event_type=NotificationEventType.FOLLOW_UP_REMINDER,
                    recipient=patient.mobile,
                    subject="Follow-up reminder",
                    message=consultation.follow_up_advice,
                    resource_type="consultation",
                    resource_id=consultation.id,
                    queued_by_user_id=actor.id,
                )
        if consultation.prescription_text and patient:
            queue_whatsapp_template_if_allowed(
                self.session,
                tenant_id=tenant_id,
                branch_id=consultation.branch_id,
                flow_key="prescription_ready_patient",
                recipient=patient.mobile,
                resource_type="consultation",
                resource_id=consultation.id,
                dedupe_key=f"whatsapp:consultation:{consultation.id}:prescription-ready",
                queued_by_user_id=actor.id,
            )
            # As with follow_up_reminder_patient, the prescription text itself
            # cannot go into a DLT-registered body - only a generic ready alert.
            queue_sms_template_if_allowed(
                self.session,
                tenant_id=tenant_id,
                branch_id=consultation.branch_id,
                flow_key="document_ready_patient",
                patient=patient,
                resource_type="consultation",
                resource_id=consultation.id,
                dedupe_key=f"sms:consultation:{consultation.id}:document-ready",
                variables={"patient_name": patient.full_name},
                queued_by_user_id=actor.id,
            )
        return consultation

    def create_addendum(
        self,
        *,
        tenant_id: str,
        consultation_id: str,
        payload: ConsultationAddendumCreate,
        actor: User,
    ) -> ConsultationAddendum:
        enforce_entitlement(self.session, tenant_id, "consultations")
        consultation = self._get_or_404(tenant_id, consultation_id)
        require_user_branch_access(actor, consultation.branch_id)
        require_doctor_practitioner_access(
            self.session, tenant_id, actor, consultation.practitioner_id
        )
        if consultation.status != ConsultationStatus.SIGNED:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Addendums are only allowed after consultation is signed",
            )

        addendum = ConsultationAddendum(
            tenant_id=tenant_id,
            consultation_id=consultation.id,
            note=payload.note,
            created_by_user_id=actor.id,
        )
        self.consultations.add_addendum(addendum)
        self.session.commit()
        self.session.refresh(addendum)
        record_audit_event(
            self.session,
            tenant_id=tenant_id,
            branch_id=consultation.branch_id,
            actor_user_id=actor.id,
            action="consultation.addendum.created",
            resource_type="consultation_addendum",
            resource_id=addendum.id,
            purpose="clinical_correction",
        )
        return addendum
