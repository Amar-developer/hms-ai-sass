from datetime import date

from fastapi import HTTPException, status
from sqlmodel import Session

from app.core.access_control import require_user_branch_access
from app.modules.identity.models import User
from app.modules.ip.models import IPAdmission
from app.modules.ip.repositories import IPAdmissionRepository
from app.modules.subscriptions.service import enforce_module_enabled


def assert_ip_enabled(session: Session, tenant_id: str) -> None:
    enforce_module_enabled(session, tenant_id, "ip")


def get_admission(
    session: Session, tenant_id: str, admission_id: str, current_user: User
) -> IPAdmission:
    admission = IPAdmissionRepository(session).get_for_tenant(
        tenant_id=tenant_id,
        admission_id=admission_id,
    )
    if not admission:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="IP admission not found"
        )
    require_user_branch_access(current_user, admission.branch_id)
    return admission


def ensure_admission_open(admission: IPAdmission) -> None:
    if admission.status in {"discharged", "cancelled"}:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="IP admission is closed; no more clinical or billing changes are allowed",
        )


def chargeable_days(start_date: date, end_date: date) -> int:
    if end_date < start_date:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Discharge date cannot be before admission date",
        )
    return max((end_date - start_date).days + 1, 1)


def admission_end_date(session: Session, admission: IPAdmission) -> date:
    summary = IPAdmissionRepository(session).latest_discharge_summary(
        tenant_id=admission.tenant_id,
        admission_id=admission.id,
    )
    return (
        (summary.discharge_date if summary else None)
        or admission.expected_discharge_date
        or date.today()
    )


def _active_admission_statuses() -> set[str]:
    return {"admitted", "under_treatment", "discharge_initiated"}


def _ranges_overlap(start: date, end: date, other_start: date, other_end: date) -> bool:
    return start <= other_end and other_start <= end


def validate_aadhaar_number(value: str | None) -> str | None:
    if value is None:
        return None
    normalized = "".join(ch for ch in value if ch.isdigit())
    if len(normalized) != 12:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Aadhaar number must be exactly 12 digits",
        )
    return normalized
