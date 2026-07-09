import json
from datetime import date

from fastapi import HTTPException, UploadFile, status
from sqlmodel import Session

from app.core.access_control import (
    require_branch_in_tenant,
    require_user_branch_access,
    scoped_branch_id,
)
from app.core.uploads import save_upload
from app.modules.audit.service import diff_changes, record_audit_event
from app.modules.files.service import record_file_document
from app.modules.identity.models import User
from app.modules.physiotherapy.models import PhysiotherapyCase
from app.modules.physiotherapy.repositories import (
    PhysiotherapyCaseRepository,
    PhysiotherapyReferenceRepository,
)
from app.modules.physiotherapy.schemas import (
    PhysiotherapyCaseCreate,
    PhysiotherapyCaseUpdate,
)
from app.modules.physiotherapy.services.case_lookup import PhysiotherapyCaseLookup
from app.modules.settings.numbering import next_document_number
from app.modules.subscriptions.service import enforce_module_enabled
from app.modules.tenants.models import now_utc


class PhysiotherapyCaseService:
    """Manages the physiotherapy case lifecycle: creation (with appointment/IP
    admission linkage), updates, and consent uploads."""

    def __init__(self, session: Session):
        self.session = session
        self.cases = PhysiotherapyCaseRepository(session)
        self.references = PhysiotherapyReferenceRepository(session)
        self.lookup = PhysiotherapyCaseLookup(session)

    def list_cases(
        self,
        *,
        tenant_id: str,
        branch_id: str | None,
        patient_id: str | None,
        care_context: str | None,
        actor: User,
    ) -> list[PhysiotherapyCase]:
        enforce_module_enabled(self.session, tenant_id, "physiotherapy")
        branch_scope = scoped_branch_id(actor, branch_id)
        return self.cases.list_for_tenant(
            tenant_id=tenant_id,
            branch_id=branch_scope,
            patient_id=patient_id,
            care_context=care_context,
        )

    def create_case(
        self, *, tenant_id: str, payload: PhysiotherapyCaseCreate, actor: User
    ) -> PhysiotherapyCase:
        enforce_module_enabled(self.session, tenant_id, "physiotherapy")
        require_branch_in_tenant(self.session, tenant_id, payload.branch_id)
        require_user_branch_access(actor, payload.branch_id)
        patient = self.references.get_patient_for_tenant(tenant_id, payload.patient_id)
        if not patient:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Patient not found"
            )
        if payload.source_appointment_id:
            appointment = self.references.get_appointment_for_tenant(
                tenant_id, payload.source_appointment_id
            )
            if not appointment:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Appointment not found",
                )
        if payload.ip_admission_id:
            admission = self.references.get_ip_admission_for_tenant(
                tenant_id, payload.ip_admission_id
            )
            if not admission:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="IP admission not found",
                )
        if payload.physiotherapist_id:
            practitioner = self.references.get_physiotherapist_for_tenant(
                tenant_id, payload.physiotherapist_id
            )
            if not practitioner:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Invalid physiotherapist",
                )
        case = PhysiotherapyCase.model_validate(
            payload,
            update={
                "tenant_id": tenant_id,
                "case_number": next_document_number(
                    self.session,
                    tenant_id=tenant_id,
                    branch_id=payload.branch_id,
                    entity="physiotherapy_case",
                ),
                "assessment_date": payload.assessment_date or date.today(),
                "care_context": payload.care_context.lower(),
                "created_by_user_id": actor.id,
                "updated_by_user_id": actor.id,
            },
        )
        self.cases.add(case)
        self.session.commit()
        self.session.refresh(case)
        record_audit_event(
            self.session,
            tenant_id=tenant_id,
            branch_id=case.branch_id,
            actor_user_id=actor.id,
            action="physiotherapy_case.created",
            resource_type="physiotherapy_case",
            resource_id=case.id,
            purpose="physiotherapy",
        )
        return case

    def update_case(
        self,
        *,
        tenant_id: str,
        case_id: str,
        payload: PhysiotherapyCaseUpdate,
        actor: User,
    ) -> PhysiotherapyCase:
        enforce_module_enabled(self.session, tenant_id, "physiotherapy")
        case = self.lookup.get_or_404(tenant_id, case_id, actor)
        if case.status in {"completed", "paid"}:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Billed physiotherapy cases are immutable",
            )
        case_updates = payload.model_dump(exclude_unset=True)
        before = {key: getattr(case, key) for key in case_updates}
        for key, value in case_updates.items():
            setattr(case, key, value)
        case.updated_at = now_utc()
        case.updated_by_user_id = actor.id
        self.cases.add(case)
        self.session.commit()
        self.session.refresh(case)
        record_audit_event(
            self.session,
            tenant_id=tenant_id,
            branch_id=case.branch_id,
            actor_user_id=actor.id,
            action="physiotherapy_case.updated",
            resource_type="physiotherapy_case",
            resource_id=case.id,
            purpose="physiotherapy",
            changes=diff_changes(before, case_updates),
        )
        return case

    async def upload_consent_form(
        self,
        *,
        tenant_id: str,
        case_id: str,
        files: list[UploadFile],
        notes: str | None,
        actor: User,
    ) -> PhysiotherapyCase:
        enforce_module_enabled(self.session, tenant_id, "physiotherapy")
        case = self.lookup.get_or_404(tenant_id, case_id, actor)
        if not files:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Upload at least one consent file",
            )
        try:
            existing_files = json.loads(case.consent_files_json or "[]")
            if not isinstance(existing_files, list):
                existing_files = []
        except json.JSONDecodeError:
            existing_files = []
        uploaded_files = []
        for upload_file in files:
            saved_filename, url_path, _ct = await save_upload(
                upload_file, f"physio_consent_{case_id[:12]}"
            )
            record_file_document(
                self.session,
                tenant_id=tenant_id,
                branch_id=case.branch_id,
                patient_id=case.patient_id,
                file_name=upload_file.filename or saved_filename,
                file_url=url_path,
                content_type=upload_file.content_type,
                category="consent",
                source_module="physiotherapy",
                attached_to_doctype="PhysiotherapyCase",
                attached_to_name=case.id,
                attached_to_field="consent_files_json",
                attached_to_label="Physiotherapy Consent",
                uploaded_by_user_id=actor.id,
            )
            uploaded_files.append(
                {
                    "url": url_path,
                    "name": upload_file.filename or saved_filename,
                    "uploaded_at": now_utc().isoformat(),
                }
            )
        consent_fields = ["consent_form_url", "consent_form_name", "consent_notes"]
        before = {key: getattr(case, key) for key in consent_fields}
        all_files = [*existing_files, *uploaded_files]
        primary = all_files[-1]
        case.consent_form_url = primary["url"]
        case.consent_form_name = primary["name"]
        case.consent_files_json = json.dumps(all_files)
        case.consent_notes = notes or None
        case.consent_submitted_at = now_utc()
        case.updated_at = now_utc()
        case.updated_by_user_id = actor.id
        self.cases.add(case)
        self.session.commit()
        self.session.refresh(case)
        record_audit_event(
            self.session,
            tenant_id=tenant_id,
            branch_id=case.branch_id,
            actor_user_id=actor.id,
            action="physiotherapy_consent.uploaded",
            resource_type="physiotherapy_case",
            resource_id=case.id,
            purpose="physiotherapy",
            changes=diff_changes(
                before, {key: getattr(case, key) for key in consent_fields}
            ),
        )
        return case
