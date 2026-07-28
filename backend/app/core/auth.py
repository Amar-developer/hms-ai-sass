from datetime import datetime, timezone
from typing import Annotated

from fastapi import Cookie, Depends, Header, HTTPException, status
from sqlmodel import Session, select

from app.core.database import get_session
from app.modules.identity.models import (
    AuthSession,
    Permission,
    Role,
    RolePermission,
    User,
    UserRole,
)
from app.modules.identity.security import hash_token
from app.modules.identity.services.privileged_policy import (
    active_support_permissions,
    is_primary_tenant_user,
)
from app.modules.tenants.models import Tenant, TenantStatus


def _role_key_from_name(name: str) -> str:
    return "_".join(
        "".join(char.lower() if char.isalnum() else " " for char in name).split()
    )


def _canonical_tenant_role(session: Session, role: Role) -> Role:
    if not role.tenant_id:
        return role
    canonical_key = _role_key_from_name(role.name)
    canonical_role = session.exec(
        select(Role).where(
            Role.tenant_id == role.tenant_id,
            Role.name == role.name,
            Role.key == canonical_key,
            Role.is_active == True,  # noqa: E712
        )
    ).first()
    return canonical_role or role


def _extract_token(
    authorization: str | None,
    access_token: str | None,
) -> str:
    """Prefer Bearer header for explicit API clients; fall back to HTTP-only cookie for browsers."""
    if authorization and authorization.lower().startswith("bearer "):
        return authorization.split(" ", 1)[1].strip()
    if access_token:
        return access_token
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED, detail="Bearer token is required"
    )


def get_current_user(
    authorization: Annotated[str | None, Header()] = None,
    access_token: Annotated[str | None, Cookie()] = None,
    session: Session = Depends(get_session),
) -> User:
    token_hash = hash_token(_extract_token(authorization, access_token))
    auth_session = session.exec(
        select(AuthSession).where(
            AuthSession.token_hash == token_hash,
            AuthSession.revoked_at.is_(None),
        )
    ).first()
    if not auth_session:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Session expired"
        )
    expires_at = auth_session.expires_at
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at < datetime.now(timezone.utc):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Session expired"
        )
    user = session.get(User, auth_session.user_id)
    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="User is inactive"
        )
    return user


def get_current_auth_session(
    authorization: Annotated[str | None, Header()] = None,
    access_token: Annotated[str | None, Cookie()] = None,
    session: Session = Depends(get_session),
) -> AuthSession:
    token_hash = hash_token(_extract_token(authorization, access_token))
    auth_session = session.exec(
        select(AuthSession).where(
            AuthSession.token_hash == token_hash,
            AuthSession.revoked_at.is_(None),
        )
    ).first()
    if not auth_session:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Session expired"
        )
    return auth_session


def user_role_keys(session: Session, user: User) -> list[str]:
    if user.is_super_admin:
        return ["super_admin"]
    rows = session.exec(
        select(Role)
        .join(UserRole, UserRole.role_id == Role.id)
        .where(UserRole.user_id == user.id, Role.is_active == True)  # noqa: E712
        .order_by(Role.key)
    ).all()
    return list(
        dict.fromkeys(_canonical_tenant_role(session, role).key for role in rows)
    )


def user_permission_keys(session: Session, user: User) -> list[str]:
    if user.is_super_admin:
        return ["*"]
    assigned_roles = session.exec(
        select(Role)
        .join(UserRole, UserRole.role_id == Role.id)
        .where(UserRole.user_id == user.id, Role.is_active == True)  # noqa: E712
    ).all()
    role_ids = list(
        dict.fromkeys(
            _canonical_tenant_role(session, role).id for role in assigned_roles
        )
    )
    if not role_ids:
        return []
    rows = session.exec(
        select(Permission)
        .join(RolePermission, RolePermission.permission_id == Permission.id)
        .where(RolePermission.role_id.in_(role_ids))
        .order_by(Permission.key)
    ).all()
    return sorted({permission.key for permission in rows})


def is_tenant_admin_user(session: Session, user: User) -> bool:
    return user.user_type == "tenant_admin" or "tenant_admin" in user_role_keys(
        session, user
    )


def require_super_admin(current_user: User = Depends(get_current_user)) -> User:
    if not current_user.is_super_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Super admin access required"
        )
    return current_user


def require_tenant_admin(
    tenant_id: str,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> User:
    if current_user.is_super_admin:
        return current_user
    if current_user.tenant_id != tenant_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Tenant access denied"
        )
    if not is_tenant_admin_user(session, current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Tenant admin access required"
        )
    return current_user


def _has_requested_permission(
    session: Session,
    *,
    current_user: User,
    tenant_id: str,
    permission_keys: set[str],
) -> tuple[bool, bool]:
    """Return (allowed, platform_operation) for the requested tenant context."""
    assigned = set(user_permission_keys(session, current_user))
    matching = assigned.intersection(permission_keys)
    same_tenant = current_user.tenant_id == tenant_id
    if same_tenant:
        if matching:
            return True, any(key.startswith("platform.") for key in matching)
        if is_tenant_admin_user(session, current_user) and any(
            not key.startswith("platform.") for key in permission_keys
        ):
            return True, False
        return False, False

    platform_matching = {key for key in matching if key.startswith("platform.")}
    if platform_matching and is_primary_tenant_user(session, current_user):
        return True, True

    granted = active_support_permissions(
        session,
        user=current_user,
        tenant_id=tenant_id,
    )
    return bool(granted.intersection(permission_keys)), False


def require_permission(permission_key: str):
    def dependency(
        x_tenant_id: Annotated[str | None, Header(alias="X-Tenant-ID")] = None,
        current_user: User = Depends(get_current_user),
        session: Session = Depends(get_session),
    ) -> User:
        if current_user.is_super_admin:
            return current_user
        if not x_tenant_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="X-Tenant-ID header is required",
            )
        tenant = session.get(Tenant, x_tenant_id)
        if not tenant:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Tenant not found"
            )
        allowed, platform_operation = _has_requested_permission(
            session,
            current_user=current_user,
            tenant_id=x_tenant_id,
            permission_keys={permission_key},
        )
        if tenant.status == TenantStatus.SUSPENDED and not platform_operation:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN, detail="Tenant is suspended"
            )
        if not allowed:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=(
                    "Temporary tenant access is missing or expired"
                    if current_user.user_type == "support_admin"
                    and current_user.tenant_id != x_tenant_id
                    else "Permission denied"
                ),
            )
        return current_user

    return dependency


def require_any_permission(*permission_keys: str):
    def dependency(
        x_tenant_id: Annotated[str | None, Header(alias="X-Tenant-ID")] = None,
        current_user: User = Depends(get_current_user),
        session: Session = Depends(get_session),
    ) -> User:
        if current_user.is_super_admin:
            return current_user
        if not x_tenant_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="X-Tenant-ID header is required",
            )
        tenant = session.get(Tenant, x_tenant_id)
        if not tenant:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Tenant not found"
            )
        allowed, platform_operation = _has_requested_permission(
            session,
            current_user=current_user,
            tenant_id=x_tenant_id,
            permission_keys=set(permission_keys),
        )
        if tenant.status == TenantStatus.SUSPENDED and not platform_operation:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN, detail="Tenant is suspended"
            )
        if not allowed:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=(
                    "Temporary tenant access is missing or expired"
                    if current_user.user_type == "support_admin"
                    and current_user.tenant_id != x_tenant_id
                    else "Permission denied"
                ),
            )
        return current_user

    return dependency
