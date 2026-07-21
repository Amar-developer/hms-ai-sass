from sqlmodel import Session

from app.core.auth import user_permission_keys, user_role_keys
from app.modules.identity import permissions
from app.modules.identity.models import Role, User
from app.modules.identity.repositories import (
    IdentityRolePermissionRepository,
    IdentityTenantRepository,
)
from app.modules.identity.schemas import (
    AuthUserRead,
    PermissionRead,
    RoleRead,
    UserRead,
)


def original_user_email(user: User) -> str:
    """Hide the internal soft-delete prefix from user-facing responses."""
    email = str(user.email or "")
    prefix = f"deleted+{user.id}+"
    while email.startswith(prefix):
        email = email[len(prefix) :]
    return email


def auth_user_read(session: Session, user: User) -> AuthUserRead:
    data = UserRead.model_validate(user, from_attributes=True).model_dump()
    if user.tenant_id:
        tenant = IdentityTenantRepository(session).get(user.tenant_id)
        data["tenant_name"] = tenant.name if tenant else None
    data.pop("roles", None)
    return AuthUserRead(
        **data,
        roles=user_role_keys(session, user),
        permissions=user_permission_keys(session, user),
    )


def role_read(session: Session, role: Role) -> RoleRead:
    permission_keys = IdentityRolePermissionRepository(
        session
    ).permission_keys_for_role(role.id)
    data = RoleRead.model_validate(role, from_attributes=True).model_dump()
    data["permission_keys"] = permission_keys
    return RoleRead(**data)


def user_read(session: Session, user: User) -> UserRead:
    data = UserRead.model_validate(user, from_attributes=True).model_dump()
    data["email"] = original_user_email(user)
    if user.tenant_id:
        tenant = IdentityTenantRepository(session).get(user.tenant_id)
        data["tenant_name"] = tenant.name if tenant else None
    data["roles"] = user_role_keys(session, user)
    return UserRead(**data)


def permission_read(key: str) -> PermissionRead:
    parts = key.split(".")
    module = ".".join(parts[:-1]) if len(parts) > 1 else parts[0]
    action = parts[-1] if len(parts) > 1 else "manage"
    module_label = permissions.PERMISSION_MODULE_LABELS.get(
        module, module.replace("_", " ").replace(".", " ").title()
    )
    return PermissionRead(
        key=key,
        module=module,
        module_label=module_label,
        action=action,
        description=f"{module_label} {action.replace('_', ' ').title()}",
    )
