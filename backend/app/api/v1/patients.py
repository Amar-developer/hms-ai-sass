from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from sqlmodel import Session

from app.core.access_control import (
    current_doctor_practitioner_id,
    enforce_entitlement,
    require_branch_in_tenant,
)
from app.core.uploads import save_upload
from app.core.auth import (
    require_any_permission,
    require_permission,
    user_permission_keys,
)
from app.core.database import get_session
from app.core.tenant_context import require_tenant_id
from app.modules.identity import permissions
from app.modules.identity.models import User
from app.modules.audit.service import record_audit_event
from app.modules.files.service import record_file_document
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
from app.modules.patients.services.search import PatientSearchService
from app.modules.subscriptions.service import enforce_patient_limit
from app.modules.settings.numbering import next_document_number
from app.modules.tenants.models import Tenant, now_utc

router = APIRouter(prefix="/patients")


def _next_patient_number(
    session: Session, tenant_id: str, branch_id: str | None = None
) -> str:
    return next_document_number(
        session, tenant_id=tenant_id, branch_id=branch_id, entity="patient"
    )


def _get_patient_or_404(session: Session, tenant_id: str, patient_id: str) -> Patient:
    patient = PatientRepository(session).get_for_tenant(tenant_id, patient_id)
    if not patient:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Patient not found"
        )
    return patient


def _active_alerts(
    session: Session, tenant_id: str, patient_id: str
) -> list[PatientAlert]:
    return PatientAlertRepository(session).active_for_patient(
        tenant_id=tenant_id,
        patient_id=patient_id,
    )


def _duplicate_candidates(
    session: Session, tenant_id: str, payload: PatientCreate
) -> list[PatientDuplicateCandidate]:
    return PatientDuplicateService(session).candidates(
        tenant_id=tenant_id,
        payload=payload,
    )


@router.post(
    "",
    response_model=PatientRead,
    status_code=status.HTTP_201_CREATED,
    dependencies=[
        Depends(
            require_any_permission(
                permissions.PATIENTS_WRITE,
                permissions.PATIENTS_CREATE,
            )
        )
    ],
)
def create_patient(
    payload: PatientCreate,
    tenant_id: str = Depends(require_tenant_id),
    current_user: User = Depends(
        require_any_permission(
            permissions.PATIENTS_WRITE,
            permissions.PATIENTS_CREATE,
        )
    ),
    session: Session = Depends(get_session),
) -> Patient:
    enforce_entitlement(session, tenant_id, "patients")
    tenant = session.get(Tenant, tenant_id)
    if not tenant:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Tenant not found"
        )
    enforce_patient_limit(session, tenant_id)
    require_branch_in_tenant(session, tenant_id, payload.branch_id)
    duplicates = _duplicate_candidates(session, tenant_id, payload)
    if any(candidate.confidence == "high" for candidate in duplicates):
        record_audit_event(
            session,
            tenant_id=tenant_id,
            branch_id=payload.branch_id,
            actor_user_id=current_user.id,
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

    patient_number = payload.patient_number or _next_patient_number(
        session, tenant_id, payload.branch_id
    )
    patient = Patient.model_validate(
        payload,
        update={
            "tenant_id": tenant_id,
            "patient_number": patient_number,
        },
    )
    PatientRepository(session).add(patient)
    session.commit()
    session.refresh(patient)
    record_audit_event(
        session,
        tenant_id=tenant_id,
        branch_id=patient.branch_id,
        actor_user_id=current_user.id,
        action="patient.created",
        resource_type="patient",
        resource_id=patient.id,
        purpose="registration",
    )
    return patient


@router.post(
    "/duplicates",
    response_model=list[PatientDuplicateCandidate],
    dependencies=[Depends(require_permission(permissions.PATIENTS_READ))],
)
def detect_duplicate_patients(
    payload: PatientCreate,
    tenant_id: str = Depends(require_tenant_id),
    current_user: User = Depends(require_permission(permissions.PATIENTS_READ)),
    session: Session = Depends(get_session),
) -> list[PatientDuplicateCandidate]:
    enforce_entitlement(session, tenant_id, "patients")
    require_branch_in_tenant(session, tenant_id, payload.branch_id)
    candidates = _duplicate_candidates(session, tenant_id, payload)
    record_audit_event(
        session,
        tenant_id=tenant_id,
        branch_id=payload.branch_id,
        actor_user_id=current_user.id,
        action="patient.duplicate_check",
        resource_type="patient",
        resource_id="duplicate_check",
        purpose="registration_duplicate_prevention",
        metadata_json=f'{{"candidate_count": {len(candidates)}}}',
    )
    return candidates


@router.get(
    "",
    response_model=list[PatientSearchResult],
    dependencies=[Depends(require_permission(permissions.PATIENTS_READ))],
)
def search_patients(
    tenant_id: str = Depends(require_tenant_id),
    q: str | None = Query(default=None, max_length=120),
    branch_id: str | None = Query(default=None),
    active_only: bool = Query(default=True),
    limit: int = Query(default=25, ge=1, le=100),
    current_user: User = Depends(require_permission(permissions.PATIENTS_READ)),
    session: Session = Depends(get_session),
) -> list[PatientSearchResult]:
    enforce_entitlement(session, tenant_id, "patients")
    # Patients are tenant-global for read: a patient can be seen at any branch,
    # so any branch user must be able to look them up. An explicit branch_id is
    # an optional filter, not a scope restriction.
    if branch_id:
        require_branch_in_tenant(session, tenant_id, branch_id)
    results = PatientSearchService(session).search(
        tenant_id=tenant_id,
        q=q,
        branch_id=branch_id,
        active_only=active_only,
        limit=limit,
    )

    record_audit_event(
        session,
        tenant_id=tenant_id,
        action="patient.search.performed",
        resource_type="patient",
        resource_id="search",
        purpose="treatment_or_registration",
        metadata_json=f'{{"query_present": {str(bool(q)).lower()}, "result_count": {len(results)}}}',
    )

    return results


@router.get(
    "/{patient_id}",
    response_model=PatientRead,
)
def get_patient(
    patient_id: str,
    tenant_id: str = Depends(require_tenant_id),
    current_user: User = Depends(
        require_any_permission(
            permissions.PATIENTS_READ,
            permissions.CONSULTATIONS_READ,
            permissions.APPOINTMENTS_READ,
            permissions.APPOINTMENTS_MANAGE,
        )
    ),
    session: Session = Depends(get_session),
) -> Patient:
    enforce_entitlement(session, tenant_id, "patients")
    patient = _get_patient_or_404(session, tenant_id, patient_id)
    # Patients are tenant-global for read (see search_patients): a branch user
    # can open any patient in the tenant. Branch confinement applies to
    # branch-owned records (appointments/queue/lab/pharmacy), not the patient
    # master.
    user_permissions = set(user_permission_keys(session, current_user))
    has_patient_read = (
        current_user.is_super_admin or permissions.PATIENTS_READ in user_permissions
    )
    if not has_patient_read:
        doctor_practitioner_id = current_doctor_practitioner_id(
            session, tenant_id, current_user
        )
        if not doctor_practitioner_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN, detail="Permission denied"
            )
        if not PatientRepository(session).doctor_has_patient_appointment(
            tenant_id=tenant_id,
            patient_id=patient.id,
            practitioner_id=doctor_practitioner_id,
        ):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Doctor patient access denied",
            )
    record_audit_event(
        session,
        tenant_id=tenant_id,
        branch_id=patient.branch_id,
        action="patient.record.viewed",
        resource_type="patient",
        resource_id=patient.id,
        purpose="treatment",
    )
    return patient


@router.patch(
    "/{patient_id}",
    response_model=PatientRead,
    dependencies=[Depends(require_permission(permissions.PATIENTS_EDIT))],
)
def update_patient(
    patient_id: str,
    payload: PatientUpdate,
    tenant_id: str = Depends(require_tenant_id),
    current_user: User = Depends(require_permission(permissions.PATIENTS_EDIT)),
    session: Session = Depends(get_session),
) -> Patient:
    enforce_entitlement(session, tenant_id, "patients")
    patient = _get_patient_or_404(session, tenant_id, patient_id)
    updates = payload.model_dump(exclude_unset=True)
    if "branch_id" in updates:
        require_branch_in_tenant(session, tenant_id, updates["branch_id"])
    for key, value in updates.items():
        setattr(patient, key, value)
    patient.updated_at = now_utc()
    session.add(patient)
    session.commit()
    session.refresh(patient)
    record_audit_event(
        session,
        tenant_id=tenant_id,
        branch_id=patient.branch_id,
        actor_user_id=current_user.id,
        action="patient.updated",
        resource_type="patient",
        resource_id=patient.id,
        purpose="patient_management",
    )
    return patient


@router.delete(
    "/{patient_id}",
    dependencies=[Depends(require_permission(permissions.PATIENTS_DELETE))],
)
def delete_patient(
    patient_id: str,
    tenant_id: str = Depends(require_tenant_id),
    current_user: User = Depends(require_permission(permissions.PATIENTS_DELETE)),
    session: Session = Depends(get_session),
) -> dict[str, bool | str]:
    enforce_entitlement(session, tenant_id, "patients")
    patient = _get_patient_or_404(session, tenant_id, patient_id)
    patient.status = PatientStatus.INACTIVE
    patient.updated_at = now_utc()
    session.add(patient)
    session.commit()
    record_audit_event(
        session,
        tenant_id=tenant_id,
        branch_id=patient.branch_id,
        actor_user_id=current_user.id,
        action="patient.deleted",
        resource_type="patient",
        resource_id=patient.id,
        purpose="patient_management",
    )
    return {"deleted": True, "mode": "deactivated", "patient_id": patient.id}


@router.post(
    "/{patient_id}/alerts",
    response_model=PatientAlertRead,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_permission(permissions.PATIENTS_WRITE))],
)
def create_patient_alert(
    patient_id: str,
    payload: PatientAlertCreate,
    tenant_id: str = Depends(require_tenant_id),
    current_user: User = Depends(require_permission(permissions.PATIENTS_WRITE)),
    session: Session = Depends(get_session),
) -> PatientAlert:
    enforce_entitlement(session, tenant_id, "patients")
    patient = _get_patient_or_404(session, tenant_id, patient_id)
    alert = PatientAlert.model_validate(
        payload,
        update={
            "tenant_id": tenant_id,
            "patient_id": patient_id,
            "created_by_user_id": current_user.id,
        },
    )
    PatientAlertRepository(session).add(alert)
    session.commit()
    session.refresh(alert)
    record_audit_event(
        session,
        tenant_id=tenant_id,
        branch_id=patient.branch_id,
        actor_user_id=current_user.id,
        action="patient.alert.created",
        resource_type="patient_alert",
        resource_id=alert.id,
        purpose="treatment_safety",
    )
    return alert


@router.get(
    "/{patient_id}/alerts",
    response_model=list[PatientAlertRead],
    dependencies=[Depends(require_permission(permissions.PATIENTS_READ))],
)
def list_patient_alerts(
    patient_id: str,
    tenant_id: str = Depends(require_tenant_id),
    current_user: User = Depends(require_permission(permissions.PATIENTS_READ)),
    session: Session = Depends(get_session),
) -> list[PatientAlert]:
    enforce_entitlement(session, tenant_id, "patients")
    _get_patient_or_404(session, tenant_id, patient_id)
    return _active_alerts(session, tenant_id, patient_id)


@router.get(
    "/{patient_id}/summary",
    response_model=PatientSummary,
    dependencies=[Depends(require_permission(permissions.PATIENTS_READ))],
)
def get_patient_summary(
    patient_id: str,
    tenant_id: str = Depends(require_tenant_id),
    current_user: User = Depends(require_permission(permissions.PATIENTS_READ)),
    session: Session = Depends(get_session),
) -> PatientSummary:
    enforce_entitlement(session, tenant_id, "patients")
    patient = _get_patient_or_404(session, tenant_id, patient_id)
    alerts = _active_alerts(session, tenant_id, patient_id)
    alert_reads = [
        PatientAlertRead.model_validate(alert, from_attributes=True) for alert in alerts
    ]
    record_audit_event(
        session,
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


@router.post("/{patient_id}/photo", response_model=PatientRead)
async def upload_patient_photo(
    patient_id: str,
    file: UploadFile = File(...),
    tenant_id: str = Depends(require_tenant_id),
    current_user: User = Depends(require_permission(permissions.PATIENTS_EDIT)),
    session: Session = Depends(get_session),
) -> Patient:
    enforce_entitlement(session, tenant_id, "patients")
    patient = _get_patient_or_404(session, tenant_id, patient_id)
    _filename, url_path, _ct = await save_upload(file, f"patient_{patient_id[:12]}")
    patient.photo_url = url_path
    patient.photo_file_name = file.filename or _filename
    patient.updated_at = now_utc()
    session.add(patient)
    record_file_document(
        session,
        tenant_id=tenant_id,
        branch_id=patient.branch_id,
        patient_id=patient.id,
        file_name=patient.photo_file_name or _filename,
        file_url=url_path,
        content_type=file.content_type,
        category="patient_photo",
        source_module="patients",
        attached_to_doctype="Patient",
        attached_to_name=patient.id,
        attached_to_field="photo_url",
        attached_to_label="Patient Photo",
        uploaded_by_user_id=current_user.id,
    )
    session.commit()
    session.refresh(patient)
    record_audit_event(
        session,
        tenant_id=tenant_id,
        branch_id=patient.branch_id,
        actor_user_id=current_user.id,
        action="patient.photo.uploaded",
        resource_type="patient",
        resource_id=patient.id,
        purpose="patient_management",
    )
    return patient
