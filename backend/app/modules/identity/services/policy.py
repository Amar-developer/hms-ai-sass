from fastapi import HTTPException, status
from sqlmodel import Session

from app.core.auth import user_permission_keys, user_role_keys
from app.modules.identity import permissions
from app.modules.identity.models import Role, User


def assert_tenant_admin(session: Session, current_user: User, tenant_id: str) -> None:
    if current_user.is_super_admin:
        return
    if current_user.tenant_id != tenant_id or "tenant_admin" not in user_role_keys(
        session, current_user
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Tenant admin access required"
        )


def assert_tenant_permission(
    session: Session,
    current_user: User,
    tenant_id: str,
    *permission_keys: str,
) -> None:
    if current_user.is_super_admin:
        return
    if current_user.tenant_id != tenant_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Tenant access denied"
        )
    if "tenant_admin" in user_role_keys(session, current_user):
        return
    if not set(permission_keys).intersection(
        user_permission_keys(session, current_user)
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Permission denied"
        )


def has_tenant_admin_access(session: Session, user: User) -> bool:
    return user.user_type == "tenant_admin" or "tenant_admin" in user_role_keys(
        session, user
    )


def assert_can_target_user_for_management(
    session: Session,
    current_user: User,
    target_user: User,
    new_role_keys: list[str] | None = None,
) -> None:
    """Restrict tenant-admin account management to tenant admins or super admins."""
    if current_user.is_super_admin or has_tenant_admin_access(session, current_user):
        return
    if has_tenant_admin_access(session, target_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only a tenant admin can modify another tenant admin account",
        )
    if new_role_keys is not None and "tenant_admin" in new_role_keys:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only a tenant admin can grant the tenant admin role",
        )


def assert_role_editable_by_actor(
    _session: Session, role: Role, current_user: User
) -> None:
    if current_user.is_super_admin:
        return
    if role.is_template_locked or role.source_template_role_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This role is assigned from MedizinHub HMS global template and cannot be changed by tenant admin",
        )


def assert_grantable_permission_keys(
    session: Session, current_user: User, permission_keys: list[str]
) -> None:
    """Prevent tenant admins from minting platform or unknown permissions."""
    if current_user.is_super_admin:
        return
    catalog = set(permissions.PERMISSION_CATALOG)
    disallowed = sorted(
        {
            key
            for key in permission_keys
            if key.startswith("platform.") or key not in catalog
        }
    )
    if disallowed:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Cannot grant these permissions: {', '.join(disallowed)}",
        )
    if has_tenant_admin_access(session, current_user):
        return
    actor_permissions = set(user_permission_keys(session, current_user))
    if permissions.IDENTITY_ROLES_MANAGE in actor_permissions:
        return
    excessive = sorted(set(permission_keys) - actor_permissions)
    if excessive:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Cannot grant permissions you do not hold: {', '.join(excessive)}",
        )
