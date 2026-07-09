import logging
from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session

from app.core.access_control import (
    current_doctor_practitioner_id,
    enforce_entitlement,
    require_doctor_practitioner_access,
    require_user_branch_access,
    scoped_branch_id,
)
from app.modules.appointments.models import AppointmentStatus
from app.modules.audit.service import diff_changes, record_audit_event
from app.modules.consultations.models import (
    Consultation,
    ConsultationAddendum,
    ConsultationStatus,
)
from app.modules.consultations.repositories import (
    ConsultationReferenceRepository,
    ConsultationRepository,
)
from app.modules.consultations.schemas import (
    ConsultationAddendumCreate,
    ConsultationCreate,
    ConsultationDetailRead,
    ConsultationSignRequest,
    ConsultationUpdate,
)
from app.modules.consultations.services.billing_service import (
    ConsultationBillingService,
)
from app.modules.consultations.services.detail_builder import (
    STRUCTURED_FIELD_NAMES,
    ConsultationDetailBuilder,
    StructuredRowWriter,
)
from app.modules.identity.models import User
from app.modules.notifications.models import NotificationEventType, NotificationProvider
from app.modules.notifications.service import queue_notification_if_allowed

logger = logging.getLogger(__name__)


class ConsultationRecordService:
    """Manages the consultation note lifecycle: creation, updates, signing, and
    addendums."""

    def __init__(self, session: Session):
        self.session = session
        self.consultations = ConsultationRepository(session)
        self.references = ConsultationReferenceRepository(session)
        self.structured_rows = StructuredRowWriter(session)
        self.detail_builder = ConsultationDetailBuilder(session)
        self.billing = ConsultationBillingService(session)

    def _get_or_404(self, tenant_id: str, consultation_id: str) -> Consultation:
        consultation = self.consultations.get_for_tenant(tenant_id, consultation_id)
        if not consultation:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Consultation not found"
            )
        return consultation

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
            },
        )
        appointment.status = AppointmentStatus.IN_CONSULTATION
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

    def list_consultations(
        self,
        *,
        tenant_id: str,
        patient_id: str | None,
        appointment_id: str | None,
        branch_id: str | None,
        actor: User,
    ) -> list[Consultation]:
        enforce_entitlement(self.session, tenant_id, "consultations")
        branch_id = scoped_branch_id(actor, branch_id)
        doctor_practitioner_id = current_doctor_practitioner_id(
            self.session, tenant_id, actor
        )
        return self.consultations.list_for_tenant(
            tenant_id=tenant_id,
            branch_id=branch_id,
            practitioner_id=doctor_practitioner_id,
            patient_id=patient_id,
            appointment_id=appointment_id,
        )

    def get_consultation(
        self, *, tenant_id: str, consultation_id: str, actor: User
    ) -> ConsultationDetailRead:
        enforce_entitlement(self.session, tenant_id, "consultations")
        consultation = self._get_or_404(tenant_id, consultation_id)
        require_user_branch_access(actor, consultation.branch_id)
        require_doctor_practitioner_access(
            self.session, tenant_id, actor, consultation.practitioner_id
        )
        record_audit_event(
            self.session,
            tenant_id=tenant_id,
            branch_id=consultation.branch_id,
            action="consultation.viewed",
            resource_type="consultation",
            resource_id=consultation.id,
            purpose="treatment",
        )
        return self.detail_builder.build(consultation)

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
        mutable_keys = {
            key for key in update_fields if key not in STRUCTURED_FIELD_NAMES
        }
        mutable_keys.add("status")
        before = {key: getattr(consultation, key) for key in mutable_keys}
        for key, value in update_fields.items():
            if key in STRUCTURED_FIELD_NAMES:
                continue
            setattr(consultation, key, value)
        consultation.status = ConsultationStatus.IN_PROGRESS
        consultation.updated_at = datetime.now(timezone.utc)
        self.consultations.add(consultation)
        self.structured_rows.replace_from_payload(consultation, payload)
        self.session.commit()
        self.session.refresh(consultation)
        after = {key: getattr(consultation, key) for key in mutable_keys}
        record_audit_event(
            self.session,
            tenant_id=tenant_id,
            branch_id=consultation.branch_id,
            actor_user_id=actor.id,
            action="consultation.updated",
            resource_type="consultation",
            resource_id=consultation.id,
            purpose="treatment",
            changes=diff_changes(before, after),
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

        before = {
            "status": consultation.status,
            "signed_by_user_id": consultation.signed_by_user_id,
            "signed_at": consultation.signed_at,
        }
        now = datetime.now(timezone.utc)
        consultation.status = ConsultationStatus.SIGNED
        consultation.signed_by_user_id = actor.id
        consultation.signed_at = now
        consultation.updated_at = now

        appointment = self.references.get_appointment_for_tenant(
            tenant_id, consultation.appointment_id
        )
        if appointment:
            appointment.status = AppointmentStatus.CONSULTATION_COMPLETED
            appointment.updated_at = now
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
            for provider in (NotificationProvider.WHATSAPP, NotificationProvider.SMS):
                queue_notification_if_allowed(
                    self.session,
                    tenant_id=tenant_id,
                    branch_id=consultation.branch_id,
                    provider=provider,
                    event_type=NotificationEventType.FOLLOW_UP_REMINDER,
                    recipient=patient.mobile,
                    subject="Follow-up reminder",
                    message=consultation.follow_up_advice,
                    resource_type="consultation",
                    resource_id=consultation.id,
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
