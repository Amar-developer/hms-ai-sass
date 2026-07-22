from fastapi import HTTPException, status
from sqlmodel import Session

from app.core.auth import user_role_keys
from app.modules.audit.service import record_audit_event
from app.modules.identity import permissions
from app.modules.identity.models import Role, RolePermission, User
from app.modules.identity.repositories import (
    IdentityRolePermissionRepository,
    IdentityRoleRepository,
    IdentityTenantRepository,
)
from app.modules.identity.schemas import (
    PermissionRead,
    RoleCreate,
    RoleRead,
    RoleUpdate,
)
from app.modules.identity.services.helpers import (
    assert_grantable_permission_keys,
    assert_role_editable_by_actor,
    assert_tenant_permission,
    ensure_permission,
    get_tenant_role_or_404,
    is_primary_tenant,
    normalize_role_key,
    permission_read,
    replace_role_permissions,
    role_read,
)
from app.modules.tenants.models import now_utc


class RoleService:
    def __init__(self, session: Session):
        self.session = session
        self.roles = IdentityRoleRepository(session)
        self.role_permissions = IdentityRolePermissionRepository(session)
        self.tenants = IdentityTenantRepository(session)

    def list_permission_catalog(
        self, *, tenant_id: str, actor: User
    ) -> list[PermissionRead]:
        permission_keys = permissions.PERMISSION_CATALOG
        tenant = self.tenants.get(tenant_id)
        if not actor.is_super_admin or not tenant or not tenant.is_primary:
            permission_keys = [
                key for key in permission_keys if not key.startswith("platform.")
            ]
        return [permission_read(key) for key in sorted(set(permission_keys))]

    def create_role(
        self, *, tenant_id: str, payload: RoleCreate, actor: User
    ) -> RoleRead:
        permission_keys = list(dict.fromkeys(payload.permission_keys))
        assert_tenant_permission(
            self.session,
            actor,
            tenant_id,
            permissions.IDENTITY_ROLES_MANAGE,
            permissions.IDENTITY_ROLES_CREATE,
        )
        assert_grantable_permission_keys(
            self.session, actor, tenant_id, permission_keys
        )
        role = Role(
            tenant_id=tenant_id,
            name=payload.name,
            key=normalize_role_key(payload.key or payload.name),
            is_global_template=actor.is_super_admin
            and is_primary_tenant(self.session, tenant_id),
            is_template_locked=False,
            created_by_user_id=actor.id,
            updated_by_user_id=actor.id,
        )
        self.roles.add(role)
        self.session.commit()
        self.session.refresh(role)
        for permission_key in permission_keys:
            permission = ensure_permission(self.session, permission_key)
            self.role_permissions.add(
                RolePermission(role_id=role.id, permission_id=permission.id)
            )
        self.session.commit()
        record_audit_event(
            self.session,
            tenant_id=tenant_id,
            actor_user_id=actor.id,
            actor_role=",".join(user_role_keys(self.session, actor)),
            action="identity.role_created",
            resource_type="role",
            resource_id=role.id,
            purpose="access_control",
        )
        return role_read(self.session, role)

    def assign_role_to_tenant(
        self, *, role_id: str, target_tenant_id: str, actor: User
    ) -> RoleRead:
        source_role = self.roles.get(role_id)
        target_tenant = self.tenants.get(target_tenant_id)
        if not source_role:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Source role not found"
            )
        if not target_tenant:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Target tenant not found"
            )
        if source_role.tenant_id == target_tenant_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Source and target tenant are the same",
            )
        if source_role.key == "super_admin" and not target_tenant.is_primary:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Super Admin role can only belong to the primary MedizinHub HMS tenant",
            )

        source_permissions = self.role_permissions.permission_keys_for_role(
            source_role.id
        )
        role = self.roles.get_by_key_for_tenant(target_tenant_id, source_role.key)
        should_be_global = target_tenant.is_primary
        should_be_locked = not target_tenant.is_primary
        if role:
            role.name = source_role.name
            role.is_active = source_role.is_active
            role.source_template_role_id = source_role.id
            role.is_template_locked = should_be_locked
            role.is_global_template = should_be_global
        else:
            role = Role(
                tenant_id=target_tenant_id,
                source_template_role_id=source_role.id,
                name=source_role.name,
                key=source_role.key,
                is_active=source_role.is_active,
                is_template_locked=should_be_locked,
                is_global_template=should_be_global,
                created_by_user_id=actor.id,
            )
        role.updated_by_user_id = actor.id
        role.updated_at = now_utc()
        self.roles.add(role)
        self.session.commit()
        self.session.refresh(role)
        replace_role_permissions(self.session, role, source_permissions)
        self.session.commit()
        record_audit_event(
            self.session,
            tenant_id=target_tenant_id,
            actor_user_id=actor.id,
            actor_role="super_admin",
            action="identity.role_assigned_from_template",
            resource_type="role",
            resource_id=role.id,
            purpose=f"source_role:{source_role.id}",
        )
        return role_read(self.session, role)

    def list_roles(self, *, tenant_id: str, actor: User) -> list[RoleRead]:
        assert_tenant_permission(
            self.session,
            actor,
            tenant_id,
            permissions.IDENTITY_ROLES_MANAGE,
            permissions.IDENTITY_ROLES_CREATE,
            permissions.IDENTITY_ROLES_READ,
            permissions.IDENTITY_ROLES_EDIT,
            permissions.IDENTITY_ROLES_DELETE,
            permissions.IDENTITY_USERS_MANAGE,
            permissions.IDENTITY_USERS_CREATE,
            permissions.IDENTITY_USERS_READ,
            permissions.IDENTITY_USERS_EDIT,
        )
        roles = self.roles.list_for_tenant(tenant_id)
        tenant = self.tenants.get(tenant_id)
        roles = [
            role
            for role in roles
            if role.key != "super_admin" or bool(tenant and tenant.is_primary)
        ]
        canonical_by_name = {
            role.name: role
            for role in roles
            if role.key == normalize_role_key(role.name)
        }
        visible_roles = [
            role
            for role in roles
            if canonical_by_name.get(role.name, role).id == role.id
        ]
        return [role_read(self.session, role) for role in visible_roles]

    def update_role(
        self, *, tenant_id: str, role_id: str, payload: RoleUpdate, actor: User
    ) -> RoleRead:
        assert_tenant_permission(
            self.session,
            actor,
            tenant_id,
            permissions.IDENTITY_ROLES_MANAGE,
            permissions.IDENTITY_ROLES_EDIT,
        )
        updates = payload.model_dump(exclude_unset=True)
        role = get_tenant_role_or_404(self.session, tenant_id, role_id)
        assert_role_editable_by_actor(
            self.session,
            role,
            actor,
            allow_template_permission_override=(
                set(updates) == {"permission_keys"}
                and updates["permission_keys"] is not None
            ),
        )
        if "key" in updates and updates["key"]:
            next_key = normalize_role_key(updates["key"])
            duplicate = self.roles.duplicate_key_for_tenant(
                tenant_id=tenant_id, key=next_key, exclude_role_id=role_id
            )
            if duplicate:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Role key already exists",
                )
            role.key = next_key
        if "name" in updates and updates["name"]:
            role.name = updates["name"]
        if "is_active" in updates and updates["is_active"] is not None:
            role.is_active = updates["is_active"]
        if "permission_keys" in updates and updates["permission_keys"] is not None:
            assert_grantable_permission_keys(
                self.session, actor, tenant_id, updates["permission_keys"]
            )
            matching_roles = self.roles.list_by_name_for_tenant(tenant_id, role.name)
            if not any(match.id == role.id for match in matching_roles):
                matching_roles.append(role)
            for matching_role in matching_roles:
                replace_role_permissions(
                    self.session, matching_role, updates["permission_keys"]
                )
                matching_role.updated_by_user_id = actor.id
                matching_role.updated_at = now_utc()
                self.roles.add(matching_role)
        role.updated_by_user_id = actor.id
        role.updated_at = now_utc()
        self.roles.add(role)
        self.session.commit()
        self.session.refresh(role)
        record_audit_event(
            self.session,
            tenant_id=tenant_id,
            actor_user_id=actor.id,
            actor_role=",".join(user_role_keys(self.session, actor)),
            action="identity.role_updated",
            resource_type="role",
            resource_id=role.id,
            purpose="access_control",
        )
        return role_read(self.session, role)

    def change_role_status(
        self, *, tenant_id: str, role_id: str, payload: RoleUpdate, actor: User
    ) -> RoleRead:
        assert_tenant_permission(
            self.session,
            actor,
            tenant_id,
            permissions.IDENTITY_ROLES_MANAGE,
            permissions.IDENTITY_ROLES_EDIT,
        )
        if payload.is_active is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail="is_active is required"
            )
        role = get_tenant_role_or_404(self.session, tenant_id, role_id)
        assert_role_editable_by_actor(self.session, role, actor)
        role.is_active = payload.is_active
        role.updated_by_user_id = actor.id
        role.updated_at = now_utc()
        self.roles.add(role)
        self.session.commit()
        self.session.refresh(role)
        record_audit_event(
            self.session,
            tenant_id=tenant_id,
            actor_user_id=actor.id,
            actor_role=",".join(user_role_keys(self.session, actor)),
            action="identity.role_status_changed",
            resource_type="role",
            resource_id=role.id,
            purpose="access_control",
        )
        return role_read(self.session, role)

    def delete_role(
        self, *, tenant_id: str, role_id: str, actor: User
    ) -> dict[str, str | bool]:
        assert_tenant_permission(
            self.session,
            actor,
            tenant_id,
            permissions.IDENTITY_ROLES_MANAGE,
            permissions.IDENTITY_ROLES_DELETE,
        )
        role = get_tenant_role_or_404(self.session, tenant_id, role_id)
        assert_role_editable_by_actor(self.session, role, actor)
        role.is_active = False
        role.updated_by_user_id = actor.id
        role.updated_at = now_utc()
        self.roles.add(role)
        self.session.commit()
        record_audit_event(
            self.session,
            tenant_id=tenant_id,
            actor_user_id=actor.id,
            actor_role=",".join(user_role_keys(self.session, actor)),
            action="identity.role_deleted",
            resource_type="role",
            resource_id=role.id,
            purpose="access_control_soft_delete",
        )
        return {"deleted": True, "mode": "deactivated", "role_id": role.id}
