from fastapi import HTTPException, status
from sqlmodel import Session

from app.modules.identity.models import User
from app.modules.subscriptions.service import enforce_module_enabled
from app.modules.tenants.models import Branch


def enforce_entitlement(session: Session, tenant_id: str, module_key: str) -> None:
    enforce_module_enabled(session, tenant_id, module_key)


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
