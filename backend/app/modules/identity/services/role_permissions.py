from fastapi import HTTPException, status
from sqlmodel import Session

from app.modules.identity.models import Permission, Role, RolePermission, User, UserRole
from app.modules.identity.repositories import (
    IdentityPermissionRepository,
    IdentityRolePermissionRepository,
    IdentityRoleRepository,
    IdentityTenantRepository,
    IdentityUserRepository,
    IdentityUserRoleRepository,
)
from app.modules.identity.services.bootstrap import TENANT_ADMIN_DEFAULT_PERMISSION_KEYS


def ensure_permission(session: Session, key: str) -> Permission:
    permissions_repo = IdentityPermissionRepository(session)
    permission = permissions_repo.get_by_key(key)
    if permission:
        return permission
    permission = Permission(key=key, description=key.replace(".", " ").title())
    permissions_repo.add(permission)
    session.commit()
    session.refresh(permission)
    return permission


def ensure_role_permissions(
    session: Session, role: Role, permission_keys: list[str]
) -> None:
    role_permissions = IdentityRolePermissionRepository(session)
    for permission_key in permission_keys:
        permission = ensure_permission(session, permission_key)
        role_permission = role_permissions.get(
            role_id=role.id, permission_id=permission.id
        )
        if not role_permission:
            role_permissions.add(
                RolePermission(role_id=role.id, permission_id=permission.id)
            )


def get_tenant_role_or_404(session: Session, tenant_id: str, role_id: str) -> Role:
    role = IdentityRoleRepository(session).get_for_tenant(tenant_id, role_id)
    if not role:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Role not found"
        )
    return role


def replace_role_permissions(
    session: Session, role: Role, permission_keys: list[str]
) -> None:
    role_permissions = IdentityRolePermissionRepository(session)
    existing = role_permissions.list_for_role(role.id)
    for row in existing:
        role_permissions.delete(row)
    for permission_key in permission_keys:
        permission = ensure_permission(session, permission_key)
        role_permissions.add(
            RolePermission(role_id=role.id, permission_id=permission.id)
        )


def role_permission_keys(session: Session, role: Role) -> list[str]:
    return IdentityRolePermissionRepository(session).permission_keys_for_role(role.id)


def resolve_role_for_user_assignment(
    session: Session,
    tenant_id: str,
    role_key: str,
    current_user: User,
) -> Role | None:
    roles = IdentityRoleRepository(session)
    role = roles.get_by_key_for_tenant(tenant_id, role_key)
    if role or role_key != "tenant_admin" or not current_user.is_super_admin:
        return role

    target_tenant = IdentityTenantRepository(session).get(tenant_id)
    source_role = roles.get_primary_template_by_key("tenant_admin")
    source_permissions = (
        role_permission_keys(session, source_role)
        if source_role
        else TENANT_ADMIN_DEFAULT_PERMISSION_KEYS
    )
    role = Role(
        tenant_id=tenant_id,
        source_template_role_id=source_role.id
        if source_role and source_role.tenant_id != tenant_id
        else None,
        name=source_role.name if source_role else "Tenant Admin",
        key="tenant_admin",
        is_active=True,
        is_global_template=bool(target_tenant and target_tenant.is_primary),
        is_template_locked=bool(
            source_role and target_tenant and not target_tenant.is_primary
        ),
        created_by_user_id=current_user.id,
        updated_by_user_id=current_user.id,
    )
    roles.add(role)
    session.commit()
    session.refresh(role)
    replace_role_permissions(session, role, source_permissions)
    session.commit()
    return role


def get_tenant_user_or_404(session: Session, tenant_id: str, user_id: str) -> User:
    user = IdentityUserRepository(session).get_for_tenant(tenant_id, user_id)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="User not found"
        )
    return user


def replace_user_roles(
    session: Session,
    tenant_id: str,
    user: User,
    role_keys: list[str],
    current_user: User,
) -> None:
    user_roles = IdentityUserRoleRepository(session)
    existing = user_roles.list_for_user(user.id)
    for row in existing:
        user_roles.delete(row)
    normalized_role_keys = list(dict.fromkeys(role_keys))
    for role_key in normalized_role_keys:
        role = resolve_role_for_user_assignment(
            session, tenant_id, role_key, current_user
        )
        if not role:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Unknown role: {role_key}",
            )
        user_roles.add(UserRole(user_id=user.id, role_id=role.id, tenant_id=tenant_id))
