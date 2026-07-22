import json

from fastapi import HTTPException, status
from sqlmodel import Session

from app.core.auth import user_role_keys
from app.modules.audit.service import record_audit_event
from app.modules.identity import permissions
from app.modules.identity.models import User, UserRole
from app.modules.identity.repositories import (
    IdentityTenantRepository,
    IdentityUserRepository,
    IdentityUserRoleRepository,
)
from app.modules.identity.schemas import (
    ResetUserPasswordRequest,
    UserCreate,
    UserRead,
    UserUpdate,
)
from app.modules.identity.security import hash_password
from app.modules.identity.services.helpers import (
    assert_can_target_user_for_management,
    assert_tenant_permission,
    get_tenant_user_or_404,
    has_tenant_admin_access,
    is_primary_tenant,
    normalize_email,
    normalize_user_access,
    original_user_email,
    replace_user_roles,
    resolve_role_for_user_assignment,
    user_read,
)
from app.modules.settings.numbering import next_document_number
from app.modules.tenants.models import now_utc


class UserService:
    def __init__(self, session: Session):
        self.session = session
        self.users = IdentityUserRepository(session)
        self.tenants = IdentityTenantRepository(session)
        self.user_roles = IdentityUserRoleRepository(session)

    def create_user(
        self, *, tenant_id: str, payload: UserCreate, actor: User
    ) -> UserRead:
        assert_tenant_permission(
            self.session,
            actor,
            tenant_id,
            permissions.IDENTITY_USERS_MANAGE,
            permissions.IDENTITY_USERS_CREATE,
        )
        user_payload = normalize_user_access(payload.model_dump())
        if user_payload.get(
            "user_type"
        ) == "super_admin" or "super_admin" in user_payload.get("role_keys", []):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Create super admins only from Platform Admins",
            )
        if (
            not actor.is_super_admin
            and not has_tenant_admin_access(self.session, actor)
            and (
                user_payload["user_type"] == "tenant_admin"
                or "tenant_admin" in user_payload["role_keys"]
            )
        ):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only a tenant admin can create a tenant admin account",
            )
        tenant = self.tenants.get(tenant_id)
        if not tenant:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Tenant not found"
            )
        existing = self.users.get_by_email_for_tenant(
            tenant_id, normalize_email(user_payload["email"])
        )
        if existing:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT, detail="User already exists"
            )
        user = User(
            tenant_id=tenant_id,
            branch_id=user_payload["branch_id"],
            user_number=next_document_number(
                self.session,
                tenant_id=tenant_id,
                branch_id=user_payload["branch_id"],
                entity="user",
            ),
            user_type=user_payload["user_type"],
            name=user_payload["name"],
            email=normalize_email(user_payload["email"]),
            mobile=user_payload["mobile"],
            password_hash=hash_password(user_payload["password"]),
            must_change_password=user_payload["must_change_password"],
            created_by_user_id=actor.id,
            updated_by_user_id=actor.id,
        )
        self.users.add(user)
        self.session.commit()
        self.session.refresh(user)
        for role_key in user_payload["role_keys"]:
            role = resolve_role_for_user_assignment(
                self.session, tenant_id, role_key, actor
            )
            if not role:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Unknown role: {role_key}",
                )
            self.user_roles.add(
                UserRole(user_id=user.id, role_id=role.id, tenant_id=tenant_id)
            )
        self.session.commit()
        record_audit_event(
            self.session,
            tenant_id=tenant_id,
            branch_id=user.branch_id,
            actor_user_id=actor.id,
            actor_role=",".join(user_role_keys(self.session, actor)),
            action="identity.user_created",
            resource_type="user",
            resource_id=user.id,
            purpose="access_control",
            metadata_json=json.dumps(
                {
                    "role_keys": user_payload.get("role_keys"),
                    "user_type": user_payload.get("user_type"),
                }
            ),
        )
        return user_read(self.session, user)

    def list_users(self, *, tenant_id: str, actor: User) -> list[UserRead]:
        assert_tenant_permission(
            self.session,
            actor,
            tenant_id,
            permissions.IDENTITY_USERS_MANAGE,
            permissions.IDENTITY_USERS_READ,
        )
        users = self.users.list_for_tenant(tenant_id)
        return [user_read(self.session, user) for user in users]

    def update_user(
        self, *, tenant_id: str, user_id: str, payload: UserUpdate, actor: User
    ) -> UserRead:
        assert_tenant_permission(
            self.session,
            actor,
            tenant_id,
            permissions.IDENTITY_USERS_MANAGE,
            permissions.IDENTITY_USERS_EDIT,
        )
        user = get_tenant_user_or_404(self.session, tenant_id, user_id)
        updates = normalize_user_access(payload.model_dump(exclude_unset=True))
        if updates.get("user_type") == "super_admin" or "super_admin" in (
            updates.get("role_keys") or []
        ):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Manage super admins only from Platform Admins",
            )
        assert_can_target_user_for_management(
            self.session, actor, user, updates.get("role_keys")
        )
        if "email" in updates and updates["email"]:
            email = normalize_email(updates["email"])
            duplicate = self.users.duplicate_email_for_tenant(
                tenant_id=tenant_id, email=email, exclude_user_id=user_id
            )
            if duplicate:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="User email already exists",
                )
            user.email = email
        for key in (
            "name",
            "user_type",
            "mobile",
            "branch_id",
            "is_active",
            "must_change_password",
        ):
            if key in updates:
                setattr(user, key, updates[key])
        if "role_keys" in updates and updates["role_keys"] is not None:
            replace_user_roles(
                self.session, tenant_id, user, updates["role_keys"], actor
            )
        user.updated_by_user_id = actor.id
        user.updated_at = now_utc()
        self.users.add(user)
        self.session.commit()
        self.session.refresh(user)
        record_audit_event(
            self.session,
            tenant_id=tenant_id,
            branch_id=user.branch_id,
            actor_user_id=actor.id,
            actor_role=",".join(user_role_keys(self.session, actor)),
            action="identity.user_updated",
            resource_type="user",
            resource_id=user.id,
            purpose="access_control",
            metadata_json=json.dumps(
                {
                    "changed_fields": sorted(updates.keys()),
                    "role_keys": updates.get("role_keys"),
                    "user_type": updates.get("user_type"),
                }
            ),
        )
        return user_read(self.session, user)

    def reset_user_password(
        self,
        *,
        tenant_id: str,
        user_id: str,
        payload: ResetUserPasswordRequest,
        actor: User,
    ) -> UserRead:
        assert_tenant_permission(
            self.session,
            actor,
            tenant_id,
            permissions.IDENTITY_USERS_MANAGE,
            permissions.IDENTITY_USERS_EDIT,
        )
        user = get_tenant_user_or_404(self.session, tenant_id, user_id)
        if user.id == actor.id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Use change password for your own login",
            )
        assert_can_target_user_for_management(self.session, actor, user)
        if actor.is_super_admin and (
            is_primary_tenant(self.session, tenant_id)
            or not has_tenant_admin_access(self.session, user)
        ):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Super admin can reset only tenant admin passwords",
            )
        if user.is_super_admin:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Super admin password cannot be reset here",
            )
        user.password_hash = hash_password(payload.new_password)
        user.must_change_password = payload.must_change_password
        user.updated_by_user_id = actor.id
        user.updated_at = now_utc()
        self.users.add(user)
        self.session.commit()
        self.session.refresh(user)
        record_audit_event(
            self.session,
            tenant_id=tenant_id,
            branch_id=user.branch_id,
            actor_user_id=actor.id,
            actor_role=",".join(user_role_keys(self.session, actor)),
            action="identity.user_password_reset",
            resource_type="user",
            resource_id=user.id,
            purpose="password_reset",
        )
        return user_read(self.session, user)

    def change_user_status(
        self, *, tenant_id: str, user_id: str, payload: UserUpdate, actor: User
    ) -> UserRead:
        assert_tenant_permission(
            self.session,
            actor,
            tenant_id,
            permissions.IDENTITY_USERS_MANAGE,
            permissions.IDENTITY_USERS_EDIT,
        )
        if payload.is_active is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail="is_active is required"
            )
        user = get_tenant_user_or_404(self.session, tenant_id, user_id)
        if user.id == actor.id and payload.is_active is False:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="You cannot deactivate your own user",
            )
        assert_can_target_user_for_management(self.session, actor, user)
        user.is_active = payload.is_active
        if payload.is_active:
            original_email = original_user_email(user)
            if original_email != user.email:
                duplicate = self.users.duplicate_email_for_tenant(
                    tenant_id=tenant_id, email=original_email, exclude_user_id=user.id
                )
                if duplicate:
                    raise HTTPException(
                        status_code=status.HTTP_409_CONFLICT,
                        detail="Restore or change the user email before activation; the original email is already in use",
                    )
                user.email = original_email
        user.updated_by_user_id = actor.id
        user.updated_at = now_utc()
        self.users.add(user)
        self.session.commit()
        self.session.refresh(user)
        record_audit_event(
            self.session,
            tenant_id=tenant_id,
            branch_id=user.branch_id,
            actor_user_id=actor.id,
            actor_role=",".join(user_role_keys(self.session, actor)),
            action="identity.user_status_changed",
            resource_type="user",
            resource_id=user.id,
            purpose="access_control",
        )
        return user_read(self.session, user)

    def delete_user(
        self, *, tenant_id: str, user_id: str, actor: User
    ) -> dict[str, str | bool]:
        assert_tenant_permission(
            self.session,
            actor,
            tenant_id,
            permissions.IDENTITY_USERS_MANAGE,
            permissions.IDENTITY_USERS_DELETE,
        )
        user = get_tenant_user_or_404(self.session, tenant_id, user_id)
        if user.id == actor.id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="You cannot delete your own user",
            )
        assert_can_target_user_for_management(self.session, actor, user)
        user.is_active = False
        if not user.email.startswith(f"deleted+{user.id}+"):
            user.email = f"deleted+{user.id}+{user.email}"
        user.updated_by_user_id = actor.id
        user.updated_at = now_utc()
        self.users.add(user)
        self.session.commit()
        record_audit_event(
            self.session,
            tenant_id=tenant_id,
            branch_id=user.branch_id,
            actor_user_id=actor.id,
            actor_role=",".join(user_role_keys(self.session, actor)),
            action="identity.user_deleted",
            resource_type="user",
            resource_id=user.id,
            purpose="access_control_soft_delete",
        )
        return {"deleted": True, "mode": "deactivated", "user_id": user.id}
