from fastapi import HTTPException, status
from sqlmodel import Session, select

from app.modules.identity.models import User
from app.modules.practitioners.models import Practitioner, PractitionerStatus
from app.modules.subscriptions.service import enforce_module_enabled
from app.modules.tenants.models import Branch


DOCTOR_USER_TYPES = {"doctor"}


def enforce_entitlement(session: Session,
    tenant_id: str,
    module_key: str,
    current_user: User | None = None,
) -> None:
    enforce_module_enabled(
        session,
        tenant_id,
        module_key,
        current_user=current_user,
    )

def require_branch_in_tenant(session: Session, tenant_id: str, branch_id: str | None) -> Branch | None:
    if not branch_id:
        return None
    branch = session.get(Branch, branch_id)
    if not branch or branch.tenant_id != tenant_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid branch")
    return branch


def require_user_branch_access(current_user: User, branch_id: str | None) -> None:
    if current_user.is_super_admin or not current_user.branch_id or not branch_id:
        return
    if current_user.branch_id != branch_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Branch access denied")


def scoped_branch_id(current_user: User, branch_id: str | None) -> str | None:
    if current_user.is_super_admin or not current_user.branch_id:
        return branch_id
    if branch_id and current_user.branch_id != branch_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Branch access denied")
    return current_user.branch_id


def current_doctor_practitioner_id(session: Session, tenant_id: str, current_user: User) -> str | None:
    if current_user.is_super_admin or current_user.user_type not in DOCTOR_USER_TYPES:
        return None
    practitioner = session.exec(
        select(Practitioner).where(
            Practitioner.tenant_id == tenant_id,
            Practitioner.user_id == current_user.id,
            Practitioner.status == PractitionerStatus.ACTIVE,
        )
    ).first()
    if not practitioner:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Doctor account is not linked to an active practitioner profile",
        )
    return practitioner.id


def require_doctor_practitioner_access(
    session: Session,
    tenant_id: str,
    current_user: User,
    practitioner_id: str | None,
) -> None:
    scoped_practitioner_id = current_doctor_practitioner_id(session, tenant_id, current_user)
    if scoped_practitioner_id and scoped_practitioner_id != practitioner_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Doctor access denied")
