import json

from fastapi import HTTPException, status
from sqlmodel import Session, select

from app.modules.audit.service import record_audit_event
from app.modules.identity.models import AuthSession, User
from app.modules.identity.repositories import (
    IdentityTenantRepository,
    IdentityUserRepository,
)
from app.modules.identity.schemas import (
    SuperAdminCreate,
    SuperAdminStatusUpdate,
    UserRead,
)
from app.modules.identity.security import hash_password, verify_password
from app.modules.identity.services.bootstrap import ensure_super_admin_role
from app.modules.identity.services.read_models import user_read
from app.modules.identity.services.user_helpers import normalize_email
from app.modules.settings.numbering import next_document_number
from app.modules.tenants.models import now_utc


class SuperAdminService:
    def __init__(self, session: Session):
        self.session = session
        self.users = IdentityUserRepository(session)
        self.tenants = IdentityTenantRepository(session)

    @staticmethod
    def _require_super_admin(actor: User) -> None:
        if not actor.is_super_admin or not actor.is_active:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Active super admin access required",
            )

    @staticmethod
    def _reauthenticate(actor: User, current_password: str) -> None:
        if not verify_password(current_password, actor.password_hash):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Current password is incorrect",
            )

    def list_super_admins(self, *, actor: User) -> list[UserRead]:
        self._require_super_admin(actor)
        return [
            user_read(self.session, user) for user in self.users.list_super_admins()
        ]

    def create_super_admin(self, *, payload: SuperAdminCreate, actor: User) -> UserRead:
        self._require_super_admin(actor)
        self._reauthenticate(actor, payload.current_password)
        primary_tenant = self.tenants.get_primary()
        if not primary_tenant:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Primary platform tenant is not configured",
            )
        email = normalize_email(payload.email)
        if self.users.get_by_email(email):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="A user with this email already exists",
            )
        user = User(
            tenant_id=primary_tenant.id,
            branch_id=None,
            user_number=next_document_number(
                self.session, tenant_id=primary_tenant.id, entity="user"
            ),
            user_type="super_admin",
            name=payload.name.strip(),
            email=email,
            mobile=payload.mobile,
            password_hash=hash_password(payload.temporary_password),
            is_super_admin=True,
            is_active=True,
            must_change_password=True,
            created_by_user_id=actor.id,
            updated_by_user_id=actor.id,
        )
        self.users.add(user)
        self.session.commit()
        self.session.refresh(user)
        ensure_super_admin_role(self.session, primary_tenant, user)
        record_audit_event(
            self.session,
            tenant_id=primary_tenant.id,
            actor_user_id=actor.id,
            actor_role="super_admin",
            action="identity.super_admin_created",
            resource_type="user",
            resource_id=user.id,
            purpose="platform_access_control",
            metadata_json=json.dumps({"reason": payload.reason}),
        )
        return user_read(self.session, user)

    def change_status(
        self,
        *,
        user_id: str,
        payload: SuperAdminStatusUpdate,
        actor: User,
    ) -> UserRead:
        self._require_super_admin(actor)
        self._reauthenticate(actor, payload.current_password)
        target = self.users.get(user_id)
        if not target or not target.is_super_admin:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Super admin not found",
            )
        if target.id == actor.id and not payload.is_active:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="You cannot deactivate your own super admin account",
            )
        if not payload.is_active:
            active_count = sum(
                1
                for user in self.users.list_super_admins(for_update=True)
                if user.is_active
            )
            if target.is_active and active_count <= 1:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="The last active super admin cannot be deactivated",
                )
        target.is_active = payload.is_active
        target.updated_by_user_id = actor.id
        target.updated_at = now_utc()
        self.users.add(target)
        if not payload.is_active:
            for auth_session in self.session.exec(
                select(AuthSession).where(
                    AuthSession.user_id == target.id,
                    AuthSession.revoked_at.is_(None),
                )
            ).all():
                auth_session.revoked_at = now_utc()
                self.session.add(auth_session)
        self.session.commit()
        self.session.refresh(target)
        record_audit_event(
            self.session,
            tenant_id=target.tenant_id,
            actor_user_id=actor.id,
            actor_role="super_admin",
            action=(
                "identity.super_admin_activated"
                if payload.is_active
                else "identity.super_admin_deactivated"
            ),
            resource_type="user",
            resource_id=target.id,
            purpose="platform_access_control",
            metadata_json=json.dumps({"reason": payload.reason}),
        )
        return user_read(self.session, target)
