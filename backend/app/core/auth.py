from datetime import datetime, timezone
from typing import Annotated

from fastapi import Depends, Header, HTTPException, status
from sqlmodel import Session, select

from app.core.database import get_session
from app.modules.identity.models import AuthSession, Permission, Role, RolePermission, User, UserRole
from app.modules.identity.security import hash_token
from app.modules.tenants.models import Tenant, TenantStatus


def _bearer_token(authorization: str | None) -> str:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Bearer token is required")
    return authorization.split(" ", 1)[1].strip()


def get_current_user(
    authorization: Annotated[str | None, Header()] = None,
    session: Session = Depends(get_session),
) -> User:
    token_hash = hash_token(_bearer_token(authorization))
    auth_session = session.exec(
        select(AuthSession).where(
            AuthSession.token_hash == token_hash,
            AuthSession.revoked_at.is_(None),
        )
    ).first()
    if not auth_session:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Session expired")
    expires_at = auth_session.expires_at
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Session expired")
    user = session.get(User, auth_session.user_id)
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User is inactive")
    return user


def get_current_auth_session(
    authorization: Annotated[str | None, Header()] = None,
    session: Session = Depends(get_session),
) -> AuthSession:
    token_hash = hash_token(_bearer_token(authorization))
    auth_session = session.exec(
        select(AuthSession).where(
            AuthSession.token_hash == token_hash,
            AuthSession.revoked_at.is_(None),
        )
    ).first()
    if not auth_session:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Session expired")
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
    return [role.key for role in rows]


def user_permission_keys(session: Session, user: User) -> list[str]:
    if user.is_super_admin:
        return ["*"]
    rows = session.exec(
        select(Permission)
        .join(RolePermission, RolePermission.permission_id == Permission.id)
        .join(UserRole, UserRole.role_id == RolePermission.role_id)
        .join(Role, Role.id == UserRole.role_id)
        .where(UserRole.user_id == user.id, Role.is_active == True)  # noqa: E712
        .order_by(Permission.key)
    ).all()
    return [permission.key for permission in rows]


def is_tenant_admin_user(session: Session, user: User) -> bool:
    return user.user_type == "tenant_admin" or "tenant_admin" in user_role_keys(session, user)


def require_super_admin(current_user: User = Depends(get_current_user)) -> User:
    if not current_user.is_super_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Super admin access required")
    return current_user


def require_tenant_admin(
    tenant_id: str,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> User:
    if current_user.is_super_admin:
        return current_user
    if current_user.tenant_id != tenant_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant access denied")
    if not is_tenant_admin_user(session, current_user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant admin access required")
    return current_user


def require_permission(permission_key: str):
    def dependency(
        x_tenant_id: Annotated[str | None, Header(alias="X-Tenant-ID")] = None,
        current_user: User = Depends(get_current_user),
        session: Session = Depends(get_session),
    ) -> User:
        if current_user.is_super_admin:
            return current_user
        if not x_tenant_id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="X-Tenant-ID header is required")
        if current_user.tenant_id != x_tenant_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant access denied")
        tenant = session.get(Tenant, x_tenant_id)
        if not tenant:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tenant not found")
        if tenant.status == TenantStatus.SUSPENDED:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant is suspended")
        if permission_key not in user_permission_keys(session, current_user):
            if permission_key == "settings.manage" and is_tenant_admin_user(session, current_user):
                return current_user
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Permission denied")
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
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="X-Tenant-ID header is required")
        if current_user.tenant_id != x_tenant_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant access denied")
        tenant = session.get(Tenant, x_tenant_id)
        if not tenant:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tenant not found")
        if tenant.status == TenantStatus.SUSPENDED:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant is suspended")
        user_permissions = set(user_permission_keys(session, current_user))
        if not user_permissions.intersection(permission_keys):
            if is_tenant_admin_user(session, current_user) and any(
                not permission_key.startswith("platform.") for permission_key in permission_keys
            ):
                return current_user
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Permission denied")
        return current_user

    return dependency
