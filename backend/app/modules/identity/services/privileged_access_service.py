import json
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, status
from sqlmodel import Session, select

from app.modules.audit.service import record_audit_event
from app.modules.identity import permissions
from app.modules.identity.models import (
    AuthSession,
    PrivilegedAccessGrant,
    Role,
    User,
    UserRole,
)
from app.modules.identity.repositories import (
    IdentityTenantRepository,
    IdentityUserRepository,
)
from app.modules.identity.schemas import (
    PrivilegedAccessOptionsRead,
    PrivilegedAccountCreate,
    PrivilegedAccountUpdate,
    SupportAccessGrantCreate,
    SupportAccessGrantRead,
    SupportAccessGrantRevoke,
    UserRead,
)
from app.modules.identity.security import hash_password, verify_password
from app.modules.identity.services.privileged_policy import (
    PLATFORM_ADMIN_PERMISSION_KEYS,
    PRIVILEGED_USER_TYPES,
    SUPPORT_GRANT_PERMISSION_KEYS,
    grant_permission_keys,
)
from app.modules.identity.services.read_models import user_read
from app.modules.identity.services.role_permissions import (
    ensure_role_permissions,
    replace_role_permissions,
)
from app.modules.identity.services.user_helpers import normalize_email
from app.modules.settings.numbering import next_document_number
from app.modules.tenants.models import TenantStatus, now_utc


MAXIMUM_SUPPORT_DURATION_MINUTES = 480


def _aware(value: datetime) -> datetime:
    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)


class PrivilegedAccessService:
    def __init__(self, session: Session):
        self.session = session
        self.users = IdentityUserRepository(session)
        self.tenants = IdentityTenantRepository(session)

    @staticmethod
    def _require_root(actor: User) -> None:
        if not actor.is_super_admin or not actor.is_active:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Active Root Super Admin access required",
            )

    @staticmethod
    def _reauthenticate(actor: User, current_password: str) -> None:
        if not verify_password(current_password, actor.password_hash):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Current password is incorrect",
            )

    @staticmethod
    def _permissions_for_account(account_type: str, requested: list[str]) -> list[str]:
        if account_type == "support_admin":
            disallowed = set(requested) - {permissions.PLATFORM_SUPPORT_ACCESS}
            if disallowed:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Support Admin account permissions are fixed; tenant access is granted temporarily",
                )
            return [permissions.PLATFORM_SUPPORT_ACCESS]
        selected = set(requested)
        if not selected:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Select at least one Platform Admin permission",
            )
        disallowed = selected - PLATFORM_ADMIN_PERMISSION_KEYS
        if disallowed:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Unsupported Platform Admin permissions: {', '.join(sorted(disallowed))}",
            )
        return sorted(selected)

    def options(self, *, actor: User) -> PrivilegedAccessOptionsRead:
        if not actor.is_super_admin and actor.user_type not in PRIVILEGED_USER_TYPES:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Privileged access account required",
            )
        return PrivilegedAccessOptionsRead(
            platform_permission_keys=sorted(PLATFORM_ADMIN_PERMISSION_KEYS),
            support_permission_keys=sorted(SUPPORT_GRANT_PERMISSION_KEYS),
            maximum_support_duration_minutes=MAXIMUM_SUPPORT_DURATION_MINUTES,
        )

    def list_accounts(self, *, actor: User) -> list[UserRead]:
        self._require_root(actor)
        primary = self.tenants.get_primary()
        if not primary:
            return []
        rows = self.session.exec(
            select(User)
            .where(
                User.tenant_id == primary.id,
                User.user_type.in_(PRIVILEGED_USER_TYPES),
                User.is_super_admin == False,  # noqa: E712
            )
            .order_by(User.is_active.desc(), User.created_at)
        ).all()
        return [user_read(self.session, row) for row in rows]

    def create_account(
        self, *, payload: PrivilegedAccountCreate, actor: User
    ) -> UserRead:
        self._require_root(actor)
        self._reauthenticate(actor, payload.current_password)
        primary = self.tenants.get_primary()
        if not primary:
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
        permission_keys = self._permissions_for_account(
            payload.account_type, payload.permission_keys
        )
        user = User(
            tenant_id=primary.id,
            branch_id=None,
            user_number=next_document_number(
                self.session, tenant_id=primary.id, entity="user"
            ),
            user_type=payload.account_type,
            name=payload.name.strip(),
            email=email,
            mobile=payload.mobile,
            password_hash=hash_password(payload.temporary_password),
            is_super_admin=False,
            is_active=True,
            must_change_password=True,
            created_by_user_id=actor.id,
            updated_by_user_id=actor.id,
        )
        self.session.add(user)
        self.session.flush()
        role = Role(
            tenant_id=primary.id,
            name=f"{payload.account_type.replace('_', ' ').title()} - {user.name}",
            key=f"{payload.account_type}_{user.id}",
            is_global_template=False,
            is_template_locked=True,
            created_by_user_id=actor.id,
            updated_by_user_id=actor.id,
        )
        self.session.add(role)
        self.session.flush()
        ensure_role_permissions(self.session, role, permission_keys)
        self.session.add(
            UserRole(user_id=user.id, role_id=role.id, tenant_id=primary.id)
        )
        self.session.commit()
        self.session.refresh(user)
        record_audit_event(
            self.session,
            tenant_id=primary.id,
            actor_user_id=actor.id,
            actor_role="super_admin",
            action="identity.privileged_account_created",
            resource_type="user",
            resource_id=user.id,
            purpose="platform_access_control",
            metadata_json=json.dumps(
                {
                    "account_type": payload.account_type,
                    "permission_keys": permission_keys,
                    "reason": payload.reason,
                }
            ),
        )
        return user_read(self.session, user)

    def _account_and_role(self, user_id: str) -> tuple[User, Role]:
        user = self.users.get(user_id)
        if (
            not user
            or user.is_super_admin
            or user.user_type not in PRIVILEGED_USER_TYPES
        ):
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Privileged account not found",
            )
        role = self.session.exec(
            select(Role)
            .join(UserRole, UserRole.role_id == Role.id)
            .where(
                UserRole.user_id == user.id,
                Role.key == f"{user.user_type}_{user.id}",
            )
        ).first()
        if not role:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Privileged account role is missing",
            )
        return user, role

    def update_account(
        self,
        *,
        user_id: str,
        payload: PrivilegedAccountUpdate,
        actor: User,
    ) -> UserRead:
        self._require_root(actor)
        self._reauthenticate(actor, payload.current_password)
        user, role = self._account_and_role(user_id)
        changed: list[str] = []
        if payload.permission_keys is not None:
            selected = self._permissions_for_account(
                user.user_type, payload.permission_keys
            )
            replace_role_permissions(self.session, role, selected)
            changed.append("permission_keys")
        if payload.is_active is not None and payload.is_active != user.is_active:
            user.is_active = payload.is_active
            changed.append("is_active")
            if not user.is_active:
                now = now_utc()
                for auth_session in self.session.exec(
                    select(AuthSession).where(
                        AuthSession.user_id == user.id,
                        AuthSession.revoked_at.is_(None),
                    )
                ).all():
                    auth_session.revoked_at = now
                    self.session.add(auth_session)
                for grant in self.session.exec(
                    select(PrivilegedAccessGrant).where(
                        PrivilegedAccessGrant.user_id == user.id,
                        PrivilegedAccessGrant.revoked_at.is_(None),
                        PrivilegedAccessGrant.expires_at > now,
                    )
                ).all():
                    grant.revoked_at = now
                    grant.revoked_by_user_id = actor.id
                    grant.revoke_reason = "Privileged account deactivated"
                    grant.updated_at = now
                    self.session.add(grant)
        user.updated_by_user_id = actor.id
        user.updated_at = now_utc()
        self.session.add(user)
        self.session.commit()
        self.session.refresh(user)
        record_audit_event(
            self.session,
            tenant_id=user.tenant_id,
            actor_user_id=actor.id,
            actor_role="super_admin",
            action="identity.privileged_account_updated",
            resource_type="user",
            resource_id=user.id,
            purpose="platform_access_control",
            metadata_json=json.dumps(
                {"changed_fields": changed, "reason": payload.reason}
            ),
        )
        return user_read(self.session, user)

    def list_grants(self, *, actor: User) -> list[SupportAccessGrantRead]:
        if actor.is_super_admin:
            statement = select(PrivilegedAccessGrant)
        elif actor.user_type == "support_admin":
            statement = select(PrivilegedAccessGrant).where(
                PrivilegedAccessGrant.user_id == actor.id
            )
        else:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Support access is unavailable for this account",
            )
        rows = self.session.exec(
            statement.order_by(PrivilegedAccessGrant.created_at.desc())
        ).all()
        return [self._grant_read(row) for row in rows]

    def create_grant(
        self, *, payload: SupportAccessGrantCreate, actor: User
    ) -> SupportAccessGrantRead:
        self._require_root(actor)
        self._reauthenticate(actor, payload.current_password)
        user = self.users.get(payload.user_id)
        if not user or user.user_type != "support_admin" or not user.is_active:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Select an active Support Admin",
            )
        tenant = self.tenants.get(payload.tenant_id)
        if not tenant or tenant.is_primary:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Select a customer tenant",
            )
        if tenant.status == TenantStatus.SUSPENDED:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Support access cannot be granted to a suspended tenant",
            )
        permission_keys = set(payload.permission_keys)
        if not permission_keys:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Select at least one support permission",
            )
        disallowed = permission_keys - SUPPORT_GRANT_PERMISSION_KEYS
        if disallowed:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Unsupported support permissions: {', '.join(sorted(disallowed))}",
            )
        now = now_utc()
        existing = self.session.exec(
            select(PrivilegedAccessGrant).where(
                PrivilegedAccessGrant.user_id == user.id,
                PrivilegedAccessGrant.tenant_id == tenant.id,
                PrivilegedAccessGrant.revoked_at.is_(None),
                PrivilegedAccessGrant.expires_at > now,
            )
        ).first()
        if existing:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="This Support Admin already has an active grant for the tenant",
            )
        grant = PrivilegedAccessGrant(
            tenant_id=tenant.id,
            user_id=user.id,
            permission_keys_json=json.dumps(sorted(permission_keys)),
            reason=payload.reason.strip(),
            starts_at=now,
            expires_at=now + timedelta(minutes=payload.duration_minutes),
            granted_by_user_id=actor.id,
        )
        self.session.add(grant)
        self.session.commit()
        self.session.refresh(grant)
        record_audit_event(
            self.session,
            tenant_id=tenant.id,
            actor_user_id=actor.id,
            actor_role="super_admin",
            action="identity.support_access_granted",
            resource_type="privileged_access_grant",
            resource_id=grant.id,
            purpose="tenant_support",
            metadata_json=json.dumps(
                {
                    "support_user_id": user.id,
                    "permission_keys": sorted(permission_keys),
                    "expires_at": grant.expires_at.isoformat(),
                    "reason": grant.reason,
                }
            ),
        )
        return self._grant_read(grant)

    def revoke_grant(
        self,
        *,
        grant_id: str,
        payload: SupportAccessGrantRevoke,
        actor: User,
    ) -> SupportAccessGrantRead:
        self._require_root(actor)
        self._reauthenticate(actor, payload.current_password)
        grant = self.session.get(PrivilegedAccessGrant, grant_id)
        if not grant:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Support access grant not found",
            )
        if grant.revoked_at is None:
            grant.revoked_at = now_utc()
            grant.revoked_by_user_id = actor.id
            grant.revoke_reason = payload.reason.strip()
            grant.updated_at = now_utc()
            self.session.add(grant)
            self.session.commit()
            self.session.refresh(grant)
            record_audit_event(
                self.session,
                tenant_id=grant.tenant_id,
                actor_user_id=actor.id,
                actor_role="super_admin",
                action="identity.support_access_revoked",
                resource_type="privileged_access_grant",
                resource_id=grant.id,
                purpose="tenant_support",
                metadata_json=json.dumps({"reason": grant.revoke_reason}),
            )
        return self._grant_read(grant)

    def _grant_read(self, grant: PrivilegedAccessGrant) -> SupportAccessGrantRead:
        tenant = self.tenants.get(grant.tenant_id)
        user = self.users.get(grant.user_id)
        now = datetime.now(timezone.utc)
        if grant.revoked_at:
            grant_status = "revoked"
        elif _aware(grant.starts_at) > now:
            grant_status = "scheduled"
        elif _aware(grant.expires_at) <= now:
            grant_status = "expired"
        else:
            grant_status = "active"
        return SupportAccessGrantRead(
            id=grant.id,
            tenant_id=grant.tenant_id,
            tenant_name=tenant.name if tenant else None,
            user_id=grant.user_id,
            user_name=user.name if user else None,
            user_email=user.email if user else None,
            permission_keys=sorted(grant_permission_keys(grant)),
            reason=grant.reason,
            starts_at=grant.starts_at,
            expires_at=grant.expires_at,
            revoked_at=grant.revoked_at,
            granted_by_user_id=grant.granted_by_user_id,
            revoked_by_user_id=grant.revoked_by_user_id,
            revoke_reason=grant.revoke_reason,
            status=grant_status,
            created_at=grant.created_at,
        )
