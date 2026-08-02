from sqlmodel import Session, select

from app.core.auth import user_permission_keys, user_role_keys
from app.modules.identity import permissions
from app.modules.identity.models import Permission, Role, RolePermission, User, UserRole
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
from app.modules.identity.services.user_helpers import normalize_role_key
from app.modules.tenants.models import Tenant


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
    data.pop("permissions", None)
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
    data["permissions"] = user_permission_keys(session, user)
    return UserRead(**data)


def user_reads(session: Session, users: list[User]) -> list[UserRead]:
    """Build a tenant user list with a bounded number of related-data queries.

    The single-user serializer intentionally uses the auth helpers because it
    is also used by write responses and authentication. Calling it in a list,
    however, performs role and permission resolution once per user. This read
    model preserves the same canonical-role semantics while batching tenant,
    role and permission data for the whole result set.
    """
    if not users:
        return []

    user_ids = [user.id for user in users]
    assigned_rows = session.exec(
        select(UserRole.user_id, Role)
        .join(Role, Role.id == UserRole.role_id)
        .where(UserRole.user_id.in_(user_ids), Role.is_active == True)  # noqa: E712
        .order_by(UserRole.user_id, Role.key)
    ).all()

    assigned_roles_by_user: dict[str, list[Role]] = {
        user_id: [] for user_id in user_ids
    }
    assigned_roles: list[Role] = []
    for user_id, role in assigned_rows:
        assigned_roles_by_user.setdefault(user_id, []).append(role)
        assigned_roles.append(role)

    tenant_ids = {role.tenant_id for role in assigned_roles if role.tenant_id}
    role_names = {role.name for role in assigned_roles}
    canonical_candidates = (
        session.exec(
            select(Role).where(
                Role.tenant_id.in_(tenant_ids),
                Role.name.in_(role_names),
                Role.is_active == True,  # noqa: E712
            )
        ).all()
        if tenant_ids and role_names
        else []
    )
    canonical_by_tenant_name = {
        (role.tenant_id, role.name): role
        for role in canonical_candidates
        if role.key == normalize_role_key(role.name)
    }

    resolved_roles_by_user: dict[str, list[Role]] = {}
    resolved_role_ids: set[str] = set()
    for user_id, roles in assigned_roles_by_user.items():
        resolved: list[Role] = []
        seen_role_ids: set[str] = set()
        for role in roles:
            canonical = canonical_by_tenant_name.get((role.tenant_id, role.name), role)
            if canonical.id in seen_role_ids:
                continue
            seen_role_ids.add(canonical.id)
            resolved_role_ids.add(canonical.id)
            resolved.append(canonical)
        resolved_roles_by_user[user_id] = resolved

    permission_rows = (
        session.exec(
            select(RolePermission.role_id, Permission.key)
            .join(Permission, Permission.id == RolePermission.permission_id)
            .where(RolePermission.role_id.in_(resolved_role_ids))
        ).all()
        if resolved_role_ids
        else []
    )
    permissions_by_role: dict[str, set[str]] = {}
    for role_id, permission_key in permission_rows:
        permissions_by_role.setdefault(role_id, set()).add(permission_key)

    user_tenant_ids = {user.tenant_id for user in users if user.tenant_id}
    tenant_names = {
        tenant.id: tenant.name
        for tenant in (
            session.exec(select(Tenant).where(Tenant.id.in_(user_tenant_ids))).all()
            if user_tenant_ids
            else []
        )
    }

    rows: list[UserRead] = []
    for user in users:
        data = UserRead.model_validate(user, from_attributes=True).model_dump()
        data["email"] = original_user_email(user)
        data["tenant_name"] = tenant_names.get(user.tenant_id)
        if user.is_super_admin:
            data["roles"] = ["super_admin"]
            data["permissions"] = ["*"]
        else:
            resolved_roles = resolved_roles_by_user.get(user.id, [])
            data["roles"] = list(dict.fromkeys(role.key for role in resolved_roles))
            data["permissions"] = sorted(
                {
                    permission_key
                    for role in resolved_roles
                    for permission_key in permissions_by_role.get(role.id, set())
                }
            )
        rows.append(UserRead(**data))
    return rows


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
