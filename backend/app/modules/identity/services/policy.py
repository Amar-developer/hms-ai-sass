from fastapi import HTTPException, status
from sqlmodel import Session

from app.core.auth import user_permission_keys, user_role_keys
from app.modules.identity import permissions
from app.modules.identity.models import Role, User
from app.modules.tenants.models import Tenant


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
    if has_tenant_admin_access(session, current_user):
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
    if target_user.is_super_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=("Super admin accounts can be managed only from Platform Admins"),
        )
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
    session: Session,
    role: Role,
    current_user: User,
    *,
    allow_template_permission_override: bool = False,
) -> None:
    if current_user.is_super_admin:
        return
    if role.is_template_locked or role.source_template_role_id:
        if allow_template_permission_override and has_tenant_admin_access(
            session, current_user
        ):
            return
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                "This role is assigned from a MedizinHub HMS global template; "
                "tenant admins may change its permissions but not its name, key, "
                "status, or template linkage"
            ),
        )


def assert_grantable_permission_keys(
    session: Session,
    current_user: User,
    tenant_id: str,
    permission_keys: list[str],
) -> None:
    """Reject unknown keys and keep platform permissions on the primary tenant."""
    catalog = set(permissions.PERMISSION_CATALOG)
    target_tenant = session.get(Tenant, tenant_id)
    disallowed = sorted(
        {
            key
            for key in permission_keys
            if key not in catalog
            or (
                key.startswith("platform.")
                and (
                    not current_user.is_super_admin
                    or not (target_tenant and target_tenant.is_primary)
                )
            )
        }
    )
    if disallowed:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Cannot grant these permissions: {', '.join(disallowed)}",
        )
    if current_user.is_super_admin:
        return
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
