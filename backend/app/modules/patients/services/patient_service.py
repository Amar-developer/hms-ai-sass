from datetime import date, datetime
import re

from fastapi import HTTPException, UploadFile, status
from sqlalchemy import and_, or_
from sqlmodel import Session, select

from app.core.list_filters import ListFilter, ListFilterOption, ListSort
from app.core.access_control import (
    current_doctor_practitioner_id,
    enforce_entitlement,
    require_branch_in_tenant,
)
from app.core.pagination import Page
from app.core.auth import user_permission_keys
from app.core.uploads import UPLOADS_DIR, save_upload
from app.modules.audit.service import diff_changes, record_audit_event
from app.modules.files.service import record_file_document
from app.modules.identity import permissions
from app.modules.identity.models import User
from app.modules.appointments.models import Appointment
from app.modules.billing.models import CreditNote, Invoice
from app.modules.consultations.models import Consultation
from app.modules.lab.models import LabOrder
from app.modules.notifications.models import (
    NotificationEvent,
    NotificationProvider,
)
from app.modules.notifications.service import queue_sms_template_if_allowed
from app.modules.patient_intelligence.models import PatientEngagementAction
from app.modules.patients.models import (
    AlertSeverity,
    AlertType,
    Patient,
    PatientAlert,
    PatientFamilyRelationship,
    PatientStatus,
    PatientVital,
)
from app.modules.patients.repositories import (
    PatientAlertRepository,
    PatientFamilyRelationshipRepository,
    PatientRepository,
    PatientVitalRepository,
)
from app.modules.patients.schemas import (
    PatientAlertCreate,
    PatientAlertRead,
    PatientCommunicationRead,
    PatientCreate,
    PatientDuplicateCandidate,
    PatientFamilyRelationshipCreate,
    PatientFamilyRelationshipRead,
    PatientRead,
    PatientSearchResult,
    PatientSummary,
    PatientUpdate,
    PatientVitalCreate,
    PatientVitalRead,
)
from app.modules.patients.services.duplicates import PatientDuplicateService
from app.modules.patients.services.mappers import normalize_mobile
from app.modules.patients.services.search import PatientSearchService
from app.modules.settings.numbering import next_document_number
from app.modules.subscriptions.service import enforce_patient_limit
from app.modules.tenants.models import Tenant, now_utc


class PatientService:
    def __init__(self, session: Session):
        self.session = session
        self.patients = PatientRepository(session)
        self.alerts = PatientAlertRepository(session)
        self.family = PatientFamilyRelationshipRepository(session)
        self.vitals = PatientVitalRepository(session)

    def _get_or_404(self, tenant_id: str, patient_id: str) -> Patient:
        patient = self.patients.get_for_tenant(tenant_id, patient_id)
        if not patient:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Patient not found"
            )
        return patient

    def _validate_mobile_numbers(
        self,
        *,
        tenant_id: str,
        mobile: str | None,
        alternate_mobile: str | None,
        guardian_mobile: str | None = None,
        exclude_patient_id: str | None = None,
    ) -> None:
        normalized_mobile = normalize_mobile(mobile)
        normalized_alternate = normalize_mobile(alternate_mobile)
        normalized_guardian = normalize_mobile(guardian_mobile)
        if not any([normalized_mobile, normalized_alternate, normalized_guardian]):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=(
                    "At least one contact number is required: primary mobile, "
                    "secondary mobile, or guardian mobile."
                ),
            )
        if normalized_mobile and normalized_mobile == normalized_alternate:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=(
                    "Primary mobile number and secondary mobile number must be "
                    "different."
                ),
            )
        if not normalized_mobile:
            return
        active_duplicate = None
        for existing in self.patients.patients_with_primary_mobile(tenant_id=tenant_id):
            if existing.id == exclude_patient_id:
                continue
            if normalize_mobile(existing.mobile) == normalized_mobile:
                active_duplicate = existing
                break
        if active_duplicate:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=(
                    "Mobile number is already used as the primary mobile "
                    "number for another active patient. Use Secondary Mobile "
                    "Number only when this is the patient's own secondary "
                    "contact number."
                ),
            )

    @staticmethod
    def _clear_monthly_tracking_if_disabled(values: dict) -> dict:
        if values.get("monthly_tracking_enabled") is False:
            values["monthly_refill_on"] = None
            values["monthly_refill_notes"] = None
            values["monthly_lab_on"] = None
            values["monthly_lab_test_name"] = None
            values["monthly_lab_notes"] = None
        return values

    @staticmethod
    def _masked_recipient(value: str | None) -> str:
        digits = re.sub(r"\D", "", value or "")
        return f"••••{digits[-4:]}" if digits else "Unavailable"

    def register_patient(
        self, *, tenant_id: str, payload: PatientCreate, actor: User
    ) -> Patient:
        enforce_entitlement(self.session, tenant_id, "patients")
        tenant = self.session.get(Tenant, tenant_id)
        if not tenant:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Tenant not found"
            )
        enforce_patient_limit(self.session, tenant_id)
        require_branch_in_tenant(self.session, tenant_id, payload.branch_id)

        self._validate_mobile_numbers(
            tenant_id=tenant_id,
            mobile=payload.mobile,
            alternate_mobile=payload.alternate_mobile,
            guardian_mobile=payload.guardian_mobile,
        )

        duplicates = PatientDuplicateService(self.session).candidates(
            tenant_id=tenant_id, payload=payload
        )
        if any(candidate.confidence == "high" for candidate in duplicates):
            record_audit_event(
                self.session,
                tenant_id=tenant_id,
                branch_id=payload.branch_id,
                actor_user_id=actor.id,
                action="patient.duplicate_blocked",
                resource_type="patient",
                resource_id="duplicate",
                purpose="registration_duplicate_prevention",
                metadata_json=f'{{"candidate_count": {len(duplicates)}}}',
            )
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Possible duplicate patient found. Search and select existing patient instead.",
            )

        patient_number = payload.patient_number or next_document_number(
            self.session,
            tenant_id=tenant_id,
            branch_id=payload.branch_id,
            entity="patient",
        )
        patient_payload = self._clear_monthly_tracking_if_disabled(payload.model_dump())
        for field in ("mobile", "alternate_mobile", "guardian_mobile"):
            patient_payload[field] = normalize_mobile(patient_payload[field]) or None
        patient = Patient.model_validate(
            patient_payload,
            update={
                "tenant_id": tenant_id,
                "patient_number": patient_number,
                "created_by_user_id": actor.id,
                "updated_by_user_id": actor.id,
                "whatsapp_consent_updated_at": (
                    now_utc()
                    if payload.whatsapp_consent_status.value != "not_recorded"
                    else None
                ),
                "sms_consent_updated_at": (
                    now_utc()
                    if payload.sms_consent_status.value != "not_recorded"
                    else None
                ),
            },
        )
        if (
            patient.whatsapp_consent_status.value != "not_recorded"
            and not patient.whatsapp_consent_source
        ):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Consent source is required when WhatsApp consent is recorded",
            )
        if (
            patient.sms_consent_status.value != "not_recorded"
            and not patient.sms_consent_source
        ):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Consent source is required when SMS consent is recorded",
            )
        self.patients.add(patient)
        self.session.commit()
        self.session.refresh(patient)
        record_audit_event(
            self.session,
            tenant_id=tenant_id,
            branch_id=patient.branch_id,
            actor_user_id=actor.id,
            action="patient.created",
            resource_type="patient",
            resource_id=patient.id,
            purpose="registration",
        )
        queue_sms_template_if_allowed(
            self.session,
            tenant_id=tenant_id,
            branch_id=patient.branch_id,
            flow_key="patient_registered_patient",
            patient=patient,
            resource_type="patient",
            resource_id=patient.id,
            dedupe_key=f"sms:patient:{patient.id}:registered",
            variables={
                **patient.model_dump(mode="json"),
                "patient_name": patient.full_name,
            },
            queued_by_user_id=actor.id,
        )
        return patient

    def detect_duplicates(
        self, *, tenant_id: str, payload: PatientCreate, actor: User
    ) -> list[PatientDuplicateCandidate]:
        enforce_entitlement(self.session, tenant_id, "patients")
        require_branch_in_tenant(self.session, tenant_id, payload.branch_id)
        candidates = PatientDuplicateService(self.session).candidates(
            tenant_id=tenant_id, payload=payload
        )
        record_audit_event(
            self.session,
            tenant_id=tenant_id,
            branch_id=payload.branch_id,
            actor_user_id=actor.id,
            action="patient.duplicate_check",
            resource_type="patient",
            resource_id="duplicate_check",
            purpose="registration_duplicate_prevention",
            metadata_json=f'{{"candidate_count": {len(candidates)}}}',
        )
        return candidates

    def search_patients(
        self,
        *,
        tenant_id: str,
        q: str | None,
        branch_id: str | None,
        active_only: bool,
        limit: int,
    ) -> list[PatientSearchResult]:
        enforce_entitlement(self.session, tenant_id, "patients")
        # Patients are tenant-global for read: a patient can be seen at any branch,
        # so any branch user must be able to look them up. An explicit branch_id is
        # an optional filter, not a scope restriction.
        if branch_id:
            require_branch_in_tenant(self.session, tenant_id, branch_id)
        return PatientSearchService(self.session).search(
            tenant_id=tenant_id,
            q=q,
            branch_id=branch_id,
            active_only=active_only,
            limit=limit,
        )

    def search_patient_page(
        self,
        *,
        tenant_id: str,
        q: str | None,
        branch_id: str | None,
        active_only: bool,
        status: PatientStatus | None,
        gender: str | None,
        from_date: date | None,
        to_date: date | None,
        list_filters: list[ListFilter],
        list_sort: ListSort | None,
        offset: int,
        limit: int,
    ) -> Page[PatientSearchResult]:
        enforce_entitlement(self.session, tenant_id, "patients")
        if branch_id:
            require_branch_in_tenant(self.session, tenant_id, branch_id)
        return PatientSearchService(self.session).search_page(
            tenant_id=tenant_id,
            q=q,
            branch_id=branch_id,
            active_only=active_only,
            status=status,
            gender=gender,
            from_date=from_date,
            to_date=to_date,
            list_filters=list_filters,
            list_sort=list_sort,
            offset=offset,
            limit=limit,
        )

    def patient_filter_options(
        self,
        *,
        tenant_id: str,
        branch_id: str | None = None,
    ) -> dict[str, list[ListFilterOption]]:
        enforce_entitlement(self.session, tenant_id, "patients")
        if branch_id:
            require_branch_in_tenant(self.session, tenant_id, branch_id)
        return self.patients.filter_options(tenant_id=tenant_id, branch_id=branch_id)

    def patient_references(
        self, *, tenant_id: str, patient_ids: list[str]
    ) -> list[PatientSearchResult]:
        enforce_entitlement(self.session, tenant_id, "patients")
        return PatientSearchService(self.session).references(
            tenant_id=tenant_id, patient_ids=patient_ids
        )

    def patient_count(
        self,
        *,
        tenant_id: str,
        from_date: date | None = None,
        to_date: date | None = None,
    ) -> int:
        enforce_entitlement(self.session, tenant_id, "patients")
        return self.patients.count(
            tenant_id=tenant_id,
            from_date=from_date,
            to_date=to_date,
        )

    def patient_communications(
        self, *, tenant_id: str, patient_id: str, limit: int = 50
    ) -> list[PatientCommunicationRead]:
        enforce_entitlement(self.session, tenant_id, "patients")
        patient = self._get_or_404(tenant_id, patient_id)
        appointment_ids = select(Appointment.id).where(
            Appointment.tenant_id == tenant_id,
            Appointment.patient_id == patient.id,
        )
        invoice_ids = select(Invoice.id).where(
            Invoice.tenant_id == tenant_id,
            Invoice.patient_id == patient.id,
        )
        credit_note_ids = select(CreditNote.id).where(
            CreditNote.tenant_id == tenant_id,
            CreditNote.invoice_id.in_(invoice_ids),
        )
        lab_order_ids = select(LabOrder.id).where(
            LabOrder.tenant_id == tenant_id,
            LabOrder.patient_id == patient.id,
        )
        consultation_ids = select(Consultation.id).where(
            Consultation.tenant_id == tenant_id,
            Consultation.patient_id == patient.id,
        )
        engagement_action_ids = select(PatientEngagementAction.id).where(
            PatientEngagementAction.tenant_id == tenant_id,
            PatientEngagementAction.patient_id == patient.id,
        )
        matches = [
            and_(
                NotificationEvent.resource_type == "appointment",
                NotificationEvent.resource_id.in_(appointment_ids),
            ),
            and_(
                NotificationEvent.resource_type == "invoice",
                NotificationEvent.resource_id.in_(invoice_ids),
            ),
            and_(
                NotificationEvent.resource_type == "credit_note",
                NotificationEvent.resource_id.in_(credit_note_ids),
            ),
            and_(
                NotificationEvent.resource_type == "lab_order",
                NotificationEvent.resource_id.in_(lab_order_ids),
            ),
            and_(
                NotificationEvent.resource_type == "consultation",
                NotificationEvent.resource_id.in_(consultation_ids),
            ),
            and_(
                NotificationEvent.resource_type == "patient_engagement_action",
                NotificationEvent.resource_id.in_(engagement_action_ids),
            ),
            and_(
                NotificationEvent.resource_type == "patient",
                NotificationEvent.resource_id == patient.id,
            ),
        ]
        rows = self.session.exec(
            select(NotificationEvent)
            .where(
                NotificationEvent.tenant_id == tenant_id,
                NotificationEvent.provider == NotificationProvider.WHATSAPP,
                NotificationEvent.template_key.is_not(None),
                or_(*matches),
            )
            .order_by(NotificationEvent.created_at.desc())
            .limit(limit)
        ).all()
        return [
            PatientCommunicationRead(
                id=row.id,
                channel=row.provider.value,
                template_key=row.template_key,
                status=row.status.value,
                recipient_masked=self._masked_recipient(row.recipient),
                resource_type=row.resource_type,
                resource_id=row.resource_id,
                created_at=row.created_at,
                sent_at=row.sent_at,
                failure_reason=row.failure_reason,
            )
            for row in rows
        ]

    def get_patient(
        self, *, tenant_id: str, patient_id: str, actor: User
    ) -> PatientRead:
        enforce_entitlement(self.session, tenant_id, "patients")
        patient = self._get_or_404(tenant_id, patient_id)
        # Patients are tenant-global for read (see search_patients): a branch user
        # can open any patient in the tenant. Branch confinement applies to
        # branch-owned records (appointments/queue/lab/pharmacy), not the patient
        # master.
        user_permissions = set(user_permission_keys(self.session, actor))
        has_patient_read = (
            actor.is_super_admin or permissions.PATIENTS_READ in user_permissions
        )
        if not has_patient_read:
            doctor_practitioner_id = current_doctor_practitioner_id(
                self.session, tenant_id, actor
            )
            if not doctor_practitioner_id:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN, detail="Permission denied"
                )
            if not self.patients.doctor_has_patient_appointment(
                tenant_id=tenant_id,
                patient_id=patient.id,
                practitioner_id=doctor_practitioner_id,
            ):
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Doctor patient access denied",
                )
        record_audit_event(
            self.session,
            tenant_id=tenant_id,
            branch_id=patient.branch_id,
            action="patient.record.viewed",
            resource_type="patient",
            resource_id=patient.id,
            purpose="treatment",
        )
        reference = PatientSearchService(self.session).references(
            tenant_id=tenant_id,
            patient_ids=[patient.id],
        )
        enriched = reference[0] if reference else None
        data = PatientRead.model_validate(patient, from_attributes=True).model_dump()
        data.update(
            {
                "subscription_plan_name": enriched.subscription_plan_name
                if enriched
                else None,
                "subscription_status": enriched.subscription_status
                if enriched
                else None,
                "intelligence_flags": enriched.intelligence_flags if enriched else [],
            }
        )
        return PatientRead(**data)

    def update_patient(
        self, *, tenant_id: str, patient_id: str, payload: PatientUpdate, actor: User
    ) -> Patient:
        enforce_entitlement(self.session, tenant_id, "patients")
        patient = self._get_or_404(tenant_id, patient_id)
        updates = payload.model_dump(exclude_unset=True)
        if "whatsapp_consent_status" in updates:
            consent_status = updates["whatsapp_consent_status"]
            if consent_status.value == "not_recorded":
                updates["whatsapp_consent_source"] = None
                updates["whatsapp_consent_updated_at"] = None
            else:
                if not updates.get("whatsapp_consent_source"):
                    raise HTTPException(
                        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                        detail=(
                            "Consent source is required when WhatsApp consent "
                            "is recorded"
                        ),
                    )
                updates["whatsapp_consent_updated_at"] = now_utc()
        elif "whatsapp_consent_source" in updates:
            updates["whatsapp_consent_updated_at"] = now_utc()
        if "sms_consent_status" in updates:
            consent_status = updates["sms_consent_status"]
            if consent_status.value == "not_recorded":
                updates["sms_consent_source"] = None
                updates["sms_consent_updated_at"] = None
            else:
                if not updates.get("sms_consent_source"):
                    raise HTTPException(
                        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                        detail="Consent source is required when SMS consent is recorded",
                    )
                updates["sms_consent_updated_at"] = now_utc()
        elif "sms_consent_source" in updates:
            updates["sms_consent_updated_at"] = now_utc()
        updates = self._clear_monthly_tracking_if_disabled(updates)
        for field in ("mobile", "alternate_mobile", "guardian_mobile"):
            if field in updates:
                updates[field] = normalize_mobile(updates[field]) or None
        if "branch_id" in updates:
            require_branch_in_tenant(self.session, tenant_id, updates["branch_id"])
        next_status = updates.get("status", patient.status)
        if next_status == PatientStatus.ACTIVE:
            self._validate_mobile_numbers(
                tenant_id=tenant_id,
                mobile=updates.get("mobile", patient.mobile),
                alternate_mobile=updates.get(
                    "alternate_mobile", patient.alternate_mobile
                ),
                guardian_mobile=updates.get("guardian_mobile", patient.guardian_mobile),
                exclude_patient_id=patient.id,
            )
        before = {key: getattr(patient, key) for key in updates}
        for key, value in updates.items():
            setattr(patient, key, value)
        patient.updated_by_user_id = actor.id
        patient.updated_at = now_utc()
        self.session.add(patient)
        self.session.commit()
        self.session.refresh(patient)
        record_audit_event(
            self.session,
            tenant_id=tenant_id,
            branch_id=patient.branch_id,
            actor_user_id=actor.id,
            action="patient.updated",
            resource_type="patient",
            resource_id=patient.id,
            purpose="patient_management",
            changes=diff_changes(before, updates),
        )
        return patient

    def deactivate_patient(
        self, *, tenant_id: str, patient_id: str, actor: User
    ) -> dict[str, bool | str]:
        enforce_entitlement(self.session, tenant_id, "patients")
        patient = self._get_or_404(tenant_id, patient_id)
        patient.status = PatientStatus.INACTIVE
        patient.updated_by_user_id = actor.id
        patient.updated_at = now_utc()
        self.session.add(patient)
        self.session.commit()
        record_audit_event(
            self.session,
            tenant_id=tenant_id,
            branch_id=patient.branch_id,
            actor_user_id=actor.id,
            action="patient.deleted",
            resource_type="patient",
            resource_id=patient.id,
            purpose="patient_management",
        )
        return {"deleted": True, "mode": "deactivated", "patient_id": patient.id}

    def create_alert(
        self,
        *,
        tenant_id: str,
        patient_id: str,
        payload: PatientAlertCreate,
        actor: User,
    ) -> PatientAlert:
        enforce_entitlement(self.session, tenant_id, "patients")
        patient = self._get_or_404(tenant_id, patient_id)
        alert = PatientAlert.model_validate(
            payload,
            update={
                "tenant_id": tenant_id,
                "patient_id": patient_id,
                "created_by_user_id": actor.id,
            },
        )
        self.alerts.add(alert)
        self.session.commit()
        self.session.refresh(alert)
        record_audit_event(
            self.session,
            tenant_id=tenant_id,
            branch_id=patient.branch_id,
            actor_user_id=actor.id,
            action="patient.alert.created",
            resource_type="patient_alert",
            resource_id=alert.id,
            purpose="treatment_safety",
        )
        return alert

    def list_alerts(self, *, tenant_id: str, patient_id: str) -> list[PatientAlert]:
        enforce_entitlement(self.session, tenant_id, "patients")
        self._get_or_404(tenant_id, patient_id)
        return self.alerts.active_for_patient(
            tenant_id=tenant_id, patient_id=patient_id
        )

    def _read_family_relationship(
        self, row: PatientFamilyRelationship, owner_patient_id: str
    ) -> PatientFamilyRelationshipRead:
        related_patient_id = (
            row.related_patient_id
            if row.patient_id == owner_patient_id
            else row.patient_id
        )
        related = self.patients.get_for_tenant(row.tenant_id, related_patient_id)
        return PatientFamilyRelationshipRead(
            id=row.id,
            tenant_id=row.tenant_id,
            patient_id=owner_patient_id,
            related_patient_id=related_patient_id,
            related_patient_name=related.full_name if related else None,
            related_patient_number=related.patient_number if related else None,
            relationship=row.relationship,
            notes=row.notes,
            is_active=row.is_active,
            created_by_user_id=row.created_by_user_id,
            created_at=row.created_at,
            updated_at=row.updated_at,
        )

    def list_family_relationships(
        self, *, tenant_id: str, patient_id: str
    ) -> list[PatientFamilyRelationshipRead]:
        enforce_entitlement(self.session, tenant_id, "patients")
        self._get_or_404(tenant_id, patient_id)
        return [
            self._read_family_relationship(row, patient_id)
            for row in self.family.active_for_patient(
                tenant_id=tenant_id, patient_id=patient_id
            )
        ]

    def create_family_relationship(
        self,
        *,
        tenant_id: str,
        patient_id: str,
        payload: PatientFamilyRelationshipCreate,
        actor: User,
    ) -> PatientFamilyRelationshipRead:
        enforce_entitlement(self.session, tenant_id, "patients")
        patient = self._get_or_404(tenant_id, patient_id)
        related = self._get_or_404(tenant_id, payload.related_patient_id)
        if patient.id == related.id:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="A patient cannot be linked as their own family member",
            )
        existing = self.family.existing_pair(
            tenant_id=tenant_id,
            patient_id=patient.id,
            related_patient_id=related.id,
        ) or self.family.existing_pair(
            tenant_id=tenant_id,
            patient_id=related.id,
            related_patient_id=patient.id,
        )
        if existing:
            if not existing.is_active:
                existing.is_active = True
                existing.relationship = payload.relationship
                existing.notes = payload.notes
                existing.updated_at = now_utc()
                self.session.add(existing)
                row = existing
            else:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Family relationship already exists",
                )
        else:
            row = PatientFamilyRelationship.model_validate(
                payload,
                update={
                    "tenant_id": tenant_id,
                    "patient_id": patient.id,
                    "related_patient_id": related.id,
                    "created_by_user_id": actor.id,
                },
            )
            self.family.add(row)
        self.session.commit()
        self.session.refresh(row)
        record_audit_event(
            self.session,
            tenant_id=tenant_id,
            branch_id=patient.branch_id,
            actor_user_id=actor.id,
            action="patient.family_relationship.created",
            resource_type="patient_family_relationship",
            resource_id=row.id,
            purpose="patient_family_membership_sharing",
        )
        return self._read_family_relationship(row, patient.id)

    def delete_family_relationship(
        self,
        *,
        tenant_id: str,
        patient_id: str,
        relationship_id: str,
        actor: User,
    ) -> dict[str, bool | str]:
        enforce_entitlement(self.session, tenant_id, "patients")
        patient = self._get_or_404(tenant_id, patient_id)
        row = self.family.get_for_tenant(tenant_id, relationship_id)
        if (
            not row
            or not row.is_active
            or patient.id not in {row.patient_id, row.related_patient_id}
        ):
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Family relationship not found",
            )
        row.is_active = False
        row.updated_at = now_utc()
        self.session.add(row)
        self.session.commit()
        record_audit_event(
            self.session,
            tenant_id=tenant_id,
            branch_id=patient.branch_id,
            actor_user_id=actor.id,
            action="patient.family_relationship.deleted",
            resource_type="patient_family_relationship",
            resource_id=row.id,
            purpose="patient_family_membership_sharing",
        )
        return {"deleted": True, "relationship_id": row.id}

    def create_vital(
        self,
        *,
        tenant_id: str,
        patient_id: str,
        payload: PatientVitalCreate,
        actor: User,
    ) -> PatientVitalRead:
        enforce_entitlement(self.session, tenant_id, "patients")
        patient = self._get_or_404(tenant_id, patient_id)
        vital = PatientVital.model_validate(
            payload,
            update={
                "tenant_id": tenant_id,
                "patient_id": patient_id,
                "recorded_at": payload.recorded_at or now_utc(),
                "created_by_user_id": actor.id,
            },
        )
        self.vitals.add(vital)
        self.session.commit()
        self.session.refresh(vital)
        record_audit_event(
            self.session,
            tenant_id=tenant_id,
            branch_id=patient.branch_id,
            actor_user_id=actor.id,
            action="patient.vital.created",
            resource_type="patient_vital",
            resource_id=vital.id,
            purpose="patient_health_tracking",
        )
        return PatientVitalRead.model_validate(vital, from_attributes=True)

    def list_vitals(
        self,
        *,
        tenant_id: str,
        patient_id: str,
        from_date: datetime | None = None,
        to_date: datetime | None = None,
    ) -> list[PatientVitalRead]:
        enforce_entitlement(self.session, tenant_id, "patients")
        self._get_or_404(tenant_id, patient_id)
        rows = self.vitals.for_patient(
            tenant_id=tenant_id,
            patient_id=patient_id,
            from_date=from_date,
            to_date=to_date,
        )
        return [
            PatientVitalRead.model_validate(row, from_attributes=True) for row in rows
        ]

    def get_summary(self, *, tenant_id: str, patient_id: str) -> PatientSummary:
        enforce_entitlement(self.session, tenant_id, "patients")
        patient = self._get_or_404(tenant_id, patient_id)
        alerts = self.alerts.active_for_patient(
            tenant_id=tenant_id, patient_id=patient_id
        )
        alert_reads = [
            PatientAlertRead.model_validate(alert, from_attributes=True)
            for alert in alerts
        ]
        record_audit_event(
            self.session,
            tenant_id=tenant_id,
            branch_id=patient.branch_id,
            action="patient.summary.viewed",
            resource_type="patient",
            resource_id=patient.id,
            purpose="treatment",
        )
        return PatientSummary(
            patient=PatientRead.model_validate(patient, from_attributes=True),
            critical_alerts=[
                a for a in alert_reads if a.severity == AlertSeverity.CRITICAL
            ],
            allergies=[a for a in alert_reads if a.alert_type == AlertType.ALLERGY],
            chronic_conditions=[
                a for a in alert_reads if a.alert_type == AlertType.CHRONIC_CONDITION
            ],
            risk_alerts=[a for a in alert_reads if a.alert_type == AlertType.RISK],
            notes=[a for a in alert_reads if a.alert_type == AlertType.NOTE],
            timeline=[
                {
                    "type": "registration",
                    "title": "Patient registered",
                    "recorded_at": patient.created_at.isoformat(),
                }
            ],
        )

    async def upload_photo(
        self, *, tenant_id: str, patient_id: str, file: UploadFile, actor: User
    ) -> Patient:
        enforce_entitlement(self.session, tenant_id, "patients")
        patient = self._get_or_404(tenant_id, patient_id)
        _filename, url_path, verified_content_type = await save_upload(
            file, f"patient_{patient_id[:12]}"
        )
        if not verified_content_type.startswith("image/"):
            (UPLOADS_DIR / _filename).unlink(missing_ok=True)
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Patient photo must be a PNG, JPEG, GIF, or WEBP image",
            )
        patient.photo_url = url_path
        patient.photo_file_name = file.filename or _filename
        patient.updated_at = now_utc()
        self.session.add(patient)
        record_file_document(
            self.session,
            tenant_id=tenant_id,
            branch_id=patient.branch_id,
            patient_id=patient.id,
            file_name=patient.photo_file_name or _filename,
            file_url=url_path,
            content_type=verified_content_type,
            category="patient_photo",
            source_module="patients",
            attached_to_doctype="Patient",
            attached_to_name=patient.id,
            attached_to_field="photo_url",
            attached_to_label="Patient Photo",
            uploaded_by_user_id=actor.id,
        )
        self.session.commit()
        self.session.refresh(patient)
        record_audit_event(
            self.session,
            tenant_id=tenant_id,
            branch_id=patient.branch_id,
            actor_user_id=actor.id,
            action="patient.photo.uploaded",
            resource_type="patient",
            resource_id=patient.id,
            purpose="patient_management",
        )
        return patient
