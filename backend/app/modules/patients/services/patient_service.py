from fastapi import HTTPException, UploadFile, status
from sqlmodel import Session

from app.core.access_control import (
    current_doctor_practitioner_id,
    enforce_entitlement,
    require_branch_in_tenant,
)
from app.core.auth import user_permission_keys
from app.core.uploads import UPLOADS_DIR, save_upload
from app.modules.audit.service import diff_changes, record_audit_event
from app.modules.files.service import record_file_document
from app.modules.identity import permissions
from app.modules.identity.models import User
from app.modules.patients.models import (
    AlertSeverity,
    AlertType,
    Patient,
    PatientAlert,
    PatientStatus,
)
from app.modules.patients.repositories import PatientAlertRepository, PatientRepository
from app.modules.patients.schemas import (
    PatientAlertCreate,
    PatientAlertRead,
    PatientCreate,
    PatientDuplicateCandidate,
    PatientRead,
    PatientSearchResult,
    PatientSummary,
    PatientUpdate,
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
        exclude_patient_id: str | None = None,
    ) -> None:
        normalized_mobile = normalize_mobile(mobile)
        normalized_alternate = normalize_mobile(alternate_mobile)
        if normalized_mobile and normalized_mobile == normalized_alternate:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=(
                    "Primary mobile number and alternate phone number must be "
                    "different."
                ),
            )
        if not normalized_mobile:
            return
        for existing in self.patients.patients_with_primary_mobile(tenant_id=tenant_id):
            if existing.id == exclude_patient_id:
                continue
            if normalize_mobile(existing.mobile) == normalized_mobile:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=(
                        "Mobile number is already used as the primary mobile "
                        "number for another patient. Use Alternate Phone Number "
                        "for a shared family contact."
                    ),
                )

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
        patient = Patient.model_validate(
            payload,
            update={
                "tenant_id": tenant_id,
                "patient_number": patient_number,
            },
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
        results = PatientSearchService(self.session).search(
            tenant_id=tenant_id,
            q=q,
            branch_id=branch_id,
            active_only=active_only,
            limit=limit,
        )
        record_audit_event(
            self.session,
            tenant_id=tenant_id,
            action="patient.search.performed",
            resource_type="patient",
            resource_id="search",
            purpose="treatment_or_registration",
            metadata_json=f'{{"query_present": {str(bool(q)).lower()}, "result_count": {len(results)}}}',
        )
        return results

    def get_patient(self, *, tenant_id: str, patient_id: str, actor: User) -> Patient:
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
        return patient

    def update_patient(
        self, *, tenant_id: str, patient_id: str, payload: PatientUpdate, actor: User
    ) -> Patient:
        enforce_entitlement(self.session, tenant_id, "patients")
        patient = self._get_or_404(tenant_id, patient_id)
        updates = payload.model_dump(exclude_unset=True)
        if "branch_id" in updates:
            require_branch_in_tenant(self.session, tenant_id, updates["branch_id"])
        self._validate_mobile_numbers(
            tenant_id=tenant_id,
            mobile=updates.get("mobile", patient.mobile),
            alternate_mobile=updates.get("alternate_mobile", patient.alternate_mobile),
            exclude_patient_id=patient.id,
        )
        before = {key: getattr(patient, key) for key in updates}
        for key, value in updates.items():
            setattr(patient, key, value)
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
