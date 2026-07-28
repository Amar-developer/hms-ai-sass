from datetime import date

from fastapi import APIRouter, Depends, File, Query, UploadFile, status
from sqlmodel import Session

from app.core.auth import require_any_permission, require_permission
from app.core.database import get_session
from app.core.tenant_context import require_tenant_id
from app.modules.identity import permissions
from app.modules.identity.models import User
from app.modules.patients.models import Patient, PatientAlert
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
from app.modules.patients.services.patient_service import PatientService

router = APIRouter(prefix="/patients")


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
    return PatientService(session).register_patient(
        tenant_id=tenant_id, payload=payload, actor=current_user
    )


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
    return PatientService(session).detect_duplicates(
        tenant_id=tenant_id, payload=payload, actor=current_user
    )


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
    return PatientService(session).search_patients(
        tenant_id=tenant_id,
        q=q,
        branch_id=branch_id,
        active_only=active_only,
        limit=limit,
    )


@router.get(
    "/references",
    response_model=list[PatientSearchResult],
    dependencies=[Depends(require_permission(permissions.PATIENTS_READ))],
)
def patient_references(
    ids: list[str] = Query(default=[], max_length=100),
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
) -> list[PatientSearchResult]:
    unique_ids = list(dict.fromkeys(ids))[:100]
    return PatientService(session).patient_references(
        tenant_id=tenant_id, patient_ids=unique_ids
    )


@router.get(
    "/count",
    response_model=dict[str, int],
    dependencies=[Depends(require_permission(permissions.PATIENTS_READ))],
)
def patient_count(
    tenant_id: str = Depends(require_tenant_id),
    from_date: date | None = None,
    to_date: date | None = None,
    session: Session = Depends(get_session),
) -> dict[str, int]:
    return {
        "total": PatientService(session).patient_count(
            tenant_id=tenant_id,
            from_date=from_date,
            to_date=to_date,
        )
    }


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
    return PatientService(session).get_patient(
        tenant_id=tenant_id, patient_id=patient_id, actor=current_user
    )


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
    return PatientService(session).update_patient(
        tenant_id=tenant_id,
        patient_id=patient_id,
        payload=payload,
        actor=current_user,
    )


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
    return PatientService(session).deactivate_patient(
        tenant_id=tenant_id, patient_id=patient_id, actor=current_user
    )


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
    return PatientService(session).create_alert(
        tenant_id=tenant_id,
        patient_id=patient_id,
        payload=payload,
        actor=current_user,
    )


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
    return PatientService(session).list_alerts(
        tenant_id=tenant_id, patient_id=patient_id
    )


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
    return PatientService(session).get_summary(
        tenant_id=tenant_id, patient_id=patient_id
    )


@router.post("/{patient_id}/photo", response_model=PatientRead)
async def upload_patient_photo(
    patient_id: str,
    file: UploadFile = File(...),
    tenant_id: str = Depends(require_tenant_id),
    current_user: User = Depends(require_permission(permissions.PATIENTS_EDIT)),
    session: Session = Depends(get_session),
) -> Patient:
    return await PatientService(session).upload_photo(
        tenant_id=tenant_id,
        patient_id=patient_id,
        file=file,
        actor=current_user,
    )
