import hashlib
import logging
import os
from dataclasses import dataclass
from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlmodel import Session, select

from app.core.auth import user_role_keys
from app.core.config import get_settings
from app.infrastructure.integrations.factories import get_cache_store
from app.infrastructure.integrations.ports.cache import KeyValueStore
from app.modules.audit.service import record_audit_event
from app.modules.identity.models import AuthSession, User
from app.modules.identity.repositories import (
    IdentityAuthSessionRepository,
    IdentityTenantRepository,
    IdentityUserRepository,
)
from app.modules.identity.schemas import (
    AuthUserRead,
    BootstrapSuperAdminRequest,
    ChangePasswordRequest,
    LoginRequest,
    LoginResponse,
)
from app.modules.identity.security import (
    create_access_session,
    find_user_by_login,
    hash_password,
    verify_password,
)
from app.modules.identity.services.helpers import (
    auth_user_read,
    ensure_clinical_role_templates,
    ensure_primary_tenant,
    ensure_primary_tenant_admin_role,
    ensure_super_admin_role,
    normalize_email,
    user_read,
)
from app.modules.settings.numbering import next_document_number
from app.modules.subscriptions.service import ensure_default_plans
from app.modules.tenants.models import TenantStatus

secure_cookie = get_settings().secure_cookie_enabled

security_logger = logging.getLogger("medizinhub.security")
_DUMMY_PASSWORD_HASH = hash_password("invalid-login-timing-placeholder")


def _rate_limit_keys(email: str, client_ip: str) -> tuple[str, str]:
    email_digest = hashlib.sha256(email.encode("utf-8")).hexdigest()
    ip_digest = hashlib.sha256(client_ip.encode("utf-8")).hexdigest()
    return (
        f"medizinhub:auth:login:email:{email_digest}",
        f"medizinhub:auth:login:ip:{ip_digest}",
    )


def _rate_limit_store() -> KeyValueStore:
    settings = get_settings()
    return get_cache_store(
        settings,
        socket_connect_timeout=1,
        socket_timeout=1,
    )


def _enforce_login_rate_limit(email: str, client_ip: str) -> KeyValueStore | None:
    settings = get_settings()
    email_key, ip_key = _rate_limit_keys(email, client_ip)
    try:
        cache = _rate_limit_store()
        email_attempts = int(cache.get(email_key) or 0)
        ip_attempts = int(cache.get(ip_key) or 0)
    except Exception:
        security_logger.warning("auth.rate_limit_unavailable")
        return None
    if (
        email_attempts >= settings.login_rate_limit_attempts
        or ip_attempts >= settings.login_rate_limit_ip_attempts
    ):
        security_logger.warning(
            "auth.login_rate_limited",
            extra={"reason": "failed_attempt_threshold"},
        )
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many login attempts. Please try again later.",
            headers={"Retry-After": str(settings.login_rate_limit_window_seconds)},
        )
    return cache


def _record_failed_login(
    cache: KeyValueStore | None, email: str, client_ip: str
) -> None:
    if cache is None:
        return
    settings = get_settings()
    try:
        for key in _rate_limit_keys(email, client_ip):
            attempts = int(cache.incr(key))
            if attempts == 1:
                cache.expire(key, settings.login_rate_limit_window_seconds)
    except Exception:
        security_logger.warning("auth.rate_limit_unavailable")


def _clear_failed_logins(
    cache: KeyValueStore | None, email: str, client_ip: str
) -> None:
    if cache is None:
        return
    try:
        email_key, _ip_key = _rate_limit_keys(email, client_ip)
        # Preserve the IP counter until its window expires. Otherwise an
        # attacker could use their own valid account to reset spray protection.
        cache.delete(email_key)
    except Exception:
        security_logger.warning("auth.rate_limit_unavailable")


@dataclass
class LoginResult:
    response: LoginResponse
    max_age_seconds: int


class AuthService:
    def __init__(self, session: Session):
        self.session = session
        self.users = IdentityUserRepository(session)
        self.tenants = IdentityTenantRepository(session)
        self.auth_sessions = IdentityAuthSessionRepository(session)

    def bootstrap_super_admin(self, payload: BootstrapSuperAdminRequest) -> User:
        # In production this highly-privileged, unauthenticated endpoint must be
        # gated by a deploy-time secret, so it cannot be raced or re-triggered by
        # anyone if the super-admin row is ever removed.
        if get_settings().environment.strip().lower() in {"production", "prod"}:
            expected = os.getenv("MEDIZINHUB_BOOTSTRAP_TOKEN")
            if not expected or getattr(payload, "bootstrap_token", None) != expected:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Bootstrap is disabled without a valid bootstrap token",
                )
        existing = self.users.get_super_admin()
        if existing:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Super admin already exists",
            )
        ensure_default_plans(self.session)
        primary_tenant = ensure_primary_tenant(self.session)
        user = User(
            tenant_id=primary_tenant.id,
            user_number=next_document_number(
                self.session, tenant_id=primary_tenant.id, entity="user"
            ),
            name=payload.name,
            email=normalize_email(payload.email),
            password_hash=hash_password(payload.password),
            is_super_admin=True,
        )
        self.users.add(user)
        self.session.commit()
        self.session.refresh(user)
        ensure_super_admin_role(self.session, primary_tenant, user)
        ensure_primary_tenant_admin_role(self.session, primary_tenant, user)
        ensure_clinical_role_templates(self.session, primary_tenant, user)
        return user_read(self.session, user)

    def _tenant_allows_login(self, candidate: User) -> bool:
        tenant = self.tenants.get(candidate.tenant_id) if candidate.tenant_id else None
        return not tenant or tenant.status != TenantStatus.SUSPENDED

    def login(
        self, payload: LoginRequest, *, client_ip: str = "unknown"
    ) -> LoginResult:
        identifier = normalize_email(payload.identifier)
        rate_limit_cache = _enforce_login_rate_limit(identifier, client_ip)
        try:
            if payload.tenant_id:
                user = find_user_by_login(self.session, identifier, payload.tenant_id)
                if not user:
                    # Keep unknown-account and wrong-password work comparable
                    # so response timing does not become an email oracle.
                    verify_password(payload.password, _DUMMY_PASSWORD_HASH)
                if not user or not verify_password(
                    payload.password, user.password_hash
                ):
                    security_logger.warning(
                        "auth.login_failed",
                        extra={
                            "tenant_id": payload.tenant_id,
                            "reason": "invalid_login",
                        },
                    )
                    raise HTTPException(
                        status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid login"
                    )
                if not self._tenant_allows_login(user):
                    security_logger.warning(
                        "auth.login_blocked",
                        extra={
                            "tenant_id": payload.tenant_id,
                            "reason": "tenant_suspended",
                        },
                    )
                    raise HTTPException(
                        status_code=status.HTTP_403_FORBIDDEN,
                        detail="Tenant is suspended",
                    )
            else:
                candidates = self.users.list_login_candidates(identifier)
                if not candidates:
                    verify_password(payload.password, _DUMMY_PASSWORD_HASH)
                user = next(
                    (
                        candidate
                        for candidate in candidates
                        if self._tenant_allows_login(candidate)
                        and verify_password(payload.password, candidate.password_hash)
                    ),
                    None,
                )
                if not user:
                    security_logger.warning(
                        "auth.login_failed",
                        extra={"tenant_id": None, "reason": "invalid_login"},
                    )
                    raise HTTPException(
                        status_code=status.HTTP_401_UNAUTHORIZED,
                        detail="Invalid login",
                    )
        except HTTPException as exc:
            if exc.status_code == status.HTTP_401_UNAUTHORIZED:
                _record_failed_login(rate_limit_cache, identifier, client_ip)
            raise
        _clear_failed_logins(rate_limit_cache, identifier, client_ip)
        token, auth_session = create_access_session(self.session, user)
        expires_at = auth_session.expires_at
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)
        max_age = max(0, int((expires_at - datetime.now(timezone.utc)).total_seconds()))
        if user.tenant_id:
            record_audit_event(
                self.session,
                tenant_id=user.tenant_id,
                branch_id=user.branch_id,
                actor_user_id=user.id,
                actor_role=",".join(user_role_keys(self.session, user)),
                action="auth.login",
                resource_type="user",
                resource_id=user.id,
                purpose="authentication",
            )
        return LoginResult(
            response=LoginResponse(
                access_token=token,
                expires_at=auth_session.expires_at,
                user=auth_user_read(self.session, user),
            ),
            max_age_seconds=max_age,
        )

    def me(self, current_user: User) -> AuthUserRead:
        return auth_user_read(self.session, current_user)

    def logout(self, *, auth_session: AuthSession, current_user: User) -> None:
        auth_session.revoked_at = datetime.now(timezone.utc)
        self.auth_sessions.add(auth_session)
        self.session.commit()
        if current_user.tenant_id:
            record_audit_event(
                self.session,
                tenant_id=current_user.tenant_id,
                branch_id=current_user.branch_id,
                actor_user_id=current_user.id,
                actor_role=",".join(user_role_keys(self.session, current_user)),
                action="auth.logout",
                resource_type="user",
                resource_id=current_user.id,
                purpose="authentication",
            )

    def change_password(
        self,
        *,
        current_user: User,
        current_auth_session: AuthSession,
        payload: ChangePasswordRequest,
    ) -> User:
        if not verify_password(payload.current_password, current_user.password_hash):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Current password is invalid",
            )
        current_user.password_hash = hash_password(payload.new_password)
        current_user.must_change_password = False
        self.users.add(current_user)
        other_sessions = self.session.exec(
            select(AuthSession).where(
                AuthSession.user_id == current_user.id,
                AuthSession.revoked_at.is_(None),
                AuthSession.id != current_auth_session.id,
            )
        ).all()
        revoked_at = datetime.now(timezone.utc)
        for auth_session in other_sessions:
            auth_session.revoked_at = revoked_at
            self.auth_sessions.add(auth_session)
        self.session.commit()
        self.session.refresh(current_user)
        if current_user.tenant_id:
            record_audit_event(
                self.session,
                tenant_id=current_user.tenant_id,
                branch_id=current_user.branch_id,
                actor_user_id=current_user.id,
                actor_role=",".join(user_role_keys(self.session, current_user)),
                action="auth.password_changed",
                resource_type="user",
                resource_id=current_user.id,
                purpose="security",
            )
        return current_user
