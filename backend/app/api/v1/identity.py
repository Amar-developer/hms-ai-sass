from datetime import datetime, timezone
import json
import logging
import re
import os
from dotenv import load_dotenv

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlmodel import Session, select

from app.core.auth import (
    get_current_auth_session,
    get_current_user,
    require_super_admin,
    user_permission_keys,
    user_role_keys,
)
from app.core.database import get_session
from app.core.tenant_context import require_tenant_id
from app.modules.audit.service import record_audit_event
from app.modules.identity.models import (
    AuthSession,
    Permission,
    Role,
    RolePermission,
    User,
    UserRole,
)
from app.modules.identity.schemas import (
    AuthUserRead,
    BootstrapSuperAdminRequest,
    ChangePasswordRequest,
    LoginRequest,
    LoginResponse,
    PermissionRead,
    ResetUserPasswordRequest,
    RoleCreate,
    RoleRead,
    RoleUpdate,
    UserCreate,
    UserRead,
    UserUpdate,
)
from app.modules.identity.security import (
    create_access_session,
    find_user_by_login,
    hash_password,
    verify_password,
)
from app.modules.identity import permissions
from app.modules.settings.numbering import next_document_number
from app.modules.subscriptions.service import ensure_default_plans
from app.modules.tenants.models import Tenant, TenantStatus, TenantType, now_utc

PRIMARY_TENANT_NAME = "MedizinHub HMS"
load_dotenv()
ENV = os.getenv("MEDIZINHUB_ENVIRONMENT", "local")

secure_cookie = (
    ENV == "production"
    and os.getenv("MEDIZINHUB_SECURE_COOKIE", "false").lower() == "true"
)
router = APIRouter()
security_logger = logging.getLogger("medizinhub.security")

TENANT_ADMIN_DEFAULT_PERMISSION_KEYS = [
    permission_key
    for permission_key in permissions.PERMISSION_CATALOG
    if not permission_key.startswith("platform.")
]


def _normalize_email(email: str) -> str:
    return email.strip().lower()


def _original_user_email(user: User) -> str:
    """Hide the internal soft-delete prefix from user-facing responses."""
    email = str(user.email or "")
    prefix = f"deleted+{user.id}+"
    while email.startswith(prefix):
        email = email[len(prefix) :]
    return email


def _normalize_role_key(value: str) -> str:
    key = re.sub(r"[^a-z0-9]+", "_", value.strip().lower())
    return re.sub(r"_+", "_", key).strip("_")


def _assert_tenant_admin(session: Session, current_user: User, tenant_id: str) -> None:
    if current_user.is_super_admin:
        return
    if current_user.tenant_id != tenant_id or "tenant_admin" not in user_role_keys(
        session, current_user
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Tenant admin access required"
        )


def _assert_tenant_permission(
    session: Session,
    current_user: User,
    tenant_id: str,
    *permission_keys: str,
) -> None:
    if current_user.is_super_admin:
        return
    if current_user.tenant_id != tenant_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Tenant access denied"
        )
    if "tenant_admin" in user_role_keys(session, current_user):
        return
    if not set(permission_keys).intersection(
        user_permission_keys(session, current_user)
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Permission denied"
        )


def _has_tenant_admin_access(session: Session, user: User) -> bool:
    return user.user_type == "tenant_admin" or "tenant_admin" in user_role_keys(
        session, user
    )


def _is_primary_tenant(session: Session, tenant_id: str | None) -> bool:
    if not tenant_id:
        return False
    tenant = session.get(Tenant, tenant_id)
    return bool(tenant and tenant.is_primary)


def _assert_role_editable_by_actor(
    session: Session, role: Role, current_user: User
) -> None:
    if current_user.is_super_admin:
        return
    if role.is_template_locked or role.source_template_role_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This role is assigned from MedizinHub HMS global template and cannot be changed by tenant admin",
        )


def _auth_user_read(session: Session, user: User) -> AuthUserRead:
    data = UserRead.model_validate(user, from_attributes=True).model_dump()
    if user.tenant_id:
        tenant = session.get(Tenant, user.tenant_id)
        data["tenant_name"] = tenant.name if tenant else None
    data.pop("roles", None)
    return AuthUserRead(
        **data,
        roles=user_role_keys(session, user),
        permissions=user_permission_keys(session, user),
    )


def _role_read(session: Session, role: Role) -> RoleRead:
    permission_keys = list(
        session.exec(
            select(Permission.key)
            .join(RolePermission, RolePermission.permission_id == Permission.id)
            .where(RolePermission.role_id == role.id)
            .order_by(Permission.key)
        ).all()
    )
    data = RoleRead.model_validate(role, from_attributes=True).model_dump()
    data["permission_keys"] = permission_keys
    return RoleRead(**data)


def _user_read(session: Session, user: User) -> UserRead:
    data = UserRead.model_validate(user, from_attributes=True).model_dump()
    data["email"] = _original_user_email(user)
    if user.tenant_id:
        tenant = session.get(Tenant, user.tenant_id)
        data["tenant_name"] = tenant.name if tenant else None
    data["roles"] = user_role_keys(session, user)
    return UserRead(**data)


def _ensure_permission(session: Session, key: str) -> Permission:
    permission = session.exec(select(Permission).where(Permission.key == key)).first()
    if permission:
        return permission
    permission = Permission(key=key, description=key.replace(".", " ").title())
    session.add(permission)
    session.commit()
    session.refresh(permission)
    return permission


def _ensure_role_permissions(
    session: Session, role: Role, permission_keys: list[str]
) -> None:
    for permission_key in permission_keys:
        permission = _ensure_permission(session, permission_key)
        role_permission = session.exec(
            select(RolePermission).where(
                RolePermission.role_id == role.id,
                RolePermission.permission_id == permission.id,
            )
        ).first()
        if not role_permission:
            session.add(RolePermission(role_id=role.id, permission_id=permission.id))


def _ensure_super_admin_role(
    session: Session, primary_tenant: Tenant, user: User
) -> Role:
    role = session.exec(
        select(Role).where(
            Role.tenant_id == primary_tenant.id, Role.key == "super_admin"
        )
    ).first()
    if not role:
        role = Role(
            tenant_id=primary_tenant.id,
            name="Super Admin",
            key="super_admin",
            is_global_template=True,
            is_template_locked=False,
            created_by_user_id=user.id,
            updated_by_user_id=user.id,
        )
        session.add(role)
        session.commit()
        session.refresh(role)
    else:
        role.name = "Super Admin"
        role.is_global_template = True
        role.is_template_locked = False
        role.updated_by_user_id = user.id
        role.updated_at = now_utc()
        session.add(role)
    _ensure_role_permissions(session, role, permissions.PERMISSION_CATALOG)
    user_role = session.exec(
        select(UserRole).where(UserRole.user_id == user.id, UserRole.role_id == role.id)
    ).first()
    if not user_role:
        session.add(
            UserRole(user_id=user.id, role_id=role.id, tenant_id=primary_tenant.id)
        )
    session.commit()
    return role


def _ensure_primary_tenant_admin_role(
    session: Session, primary_tenant: Tenant, user: User
) -> Role:
    role = session.exec(
        select(Role).where(
            Role.tenant_id == primary_tenant.id, Role.key == "tenant_admin"
        )
    ).first()
    if not role:
        role = Role(
            tenant_id=primary_tenant.id,
            name="Tenant Admin",
            key="tenant_admin",
            is_global_template=True,
            is_template_locked=False,
            created_by_user_id=user.id,
            updated_by_user_id=user.id,
        )
        session.add(role)
        session.commit()
        session.refresh(role)
    else:
        role.name = "Tenant Admin"
        role.is_global_template = True
        role.is_template_locked = False
        role.updated_by_user_id = user.id
        role.updated_at = now_utc()
        session.add(role)
    _ensure_role_permissions(session, role, TENANT_ADMIN_DEFAULT_PERMISSION_KEYS)
    session.commit()
    return role


def _permission_read(key: str) -> PermissionRead:
    parts = key.split(".")
    module = ".".join(parts[:-1]) if len(parts) > 1 else parts[0]
    action = parts[-1] if len(parts) > 1 else "manage"
    return PermissionRead(
        key=key,
        module=module,
        action=action,
        description=key.replace(".", " ").title(),
    )


def _ensure_primary_tenant(session: Session) -> Tenant:
    tenant = session.exec(select(Tenant).where(Tenant.is_primary == True)).first()  # noqa: E712
    if not tenant:
        tenant = session.exec(
            select(Tenant).where(Tenant.name == PRIMARY_TENANT_NAME)
        ).first()
    if tenant:
        tenant.name = PRIMARY_TENANT_NAME
        tenant.tenant_type = TenantType.PRIMARY.value
        tenant.is_primary = True
        tenant.status = TenantStatus.ACTIVE
        session.add(tenant)
        session.commit()
        session.refresh(tenant)
        return tenant
    tenant = Tenant(
        name=PRIMARY_TENANT_NAME,
        legal_name="MedizinHub HMS Platform",
        description="Primary SaaS tenant with global tenant-management authority.",
        tenant_type=TenantType.PRIMARY.value,
        is_primary=True,
        status=TenantStatus.ACTIVE,
        country="IN",
        timezone="Asia/Kolkata",
    )
    session.add(tenant)
    session.commit()
    session.refresh(tenant)
    return tenant


@router.post(
    "/auth/bootstrap-super-admin",
    response_model=UserRead,
    status_code=status.HTTP_201_CREATED,
)
def bootstrap_super_admin(
    payload: BootstrapSuperAdminRequest,
    session: Session = Depends(get_session),
) -> User:
    existing = session.exec(select(User).where(User.is_super_admin == True)).first()  # noqa: E712
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="Super admin already exists"
        )
    ensure_default_plans(session)
    primary_tenant = _ensure_primary_tenant(session)
    user = User(
        tenant_id=primary_tenant.id,
        user_number=next_document_number(
            session, tenant_id=primary_tenant.id, entity="user"
        ),
        name=payload.name,
        email=_normalize_email(payload.email),
        password_hash=hash_password(payload.password),
        is_super_admin=True,
    )
    session.add(user)
    session.commit()
    session.refresh(user)
    _ensure_super_admin_role(session, primary_tenant, user)
    _ensure_primary_tenant_admin_role(session, primary_tenant, user)
    return _user_read(session, user)


@router.post("/auth/login", response_model=LoginResponse)
def login(
    payload: LoginRequest,
    response: Response,
    session: Session = Depends(get_session),
) -> LoginResponse:
    email = _normalize_email(payload.email)

    def tenant_allows_login(candidate: User) -> bool:
        tenant = (
            session.get(Tenant, candidate.tenant_id) if candidate.tenant_id else None
        )
        return not tenant or tenant.status != TenantStatus.SUSPENDED

    if payload.tenant_id:
        user = find_user_by_login(session, email, payload.tenant_id)
        if not user or not verify_password(payload.password, user.password_hash):
            security_logger.warning(
                "auth.login_failed",
                extra={"tenant_id": payload.tenant_id, "reason": "invalid_login"},
            )
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid login"
            )
        if not tenant_allows_login(user):
            security_logger.warning(
                "auth.login_blocked",
                extra={"tenant_id": payload.tenant_id, "reason": "tenant_suspended"},
            )
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN, detail="Tenant is suspended"
            )
    else:
        candidates = session.exec(
            select(User)
            .where(User.email == email, User.is_active == True)  # noqa: E712
            .order_by(User.updated_at.desc(), User.created_at.desc())
        ).all()
        user = next(
            (
                candidate
                for candidate in candidates
                if tenant_allows_login(candidate)
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
                status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid login"
            )
    token, auth_session = create_access_session(session, user)
    expires_at = auth_session.expires_at
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    max_age = max(0, int((expires_at - datetime.now(timezone.utc)).total_seconds()))
    response.set_cookie(
        key="access_token",
        value=token,
        httponly=True,
        secure=secure_cookie,
        samesite="lax",
        max_age=max_age,
        path="/",
    )
    if user.tenant_id:
        record_audit_event(
            session,
            tenant_id=user.tenant_id,
            branch_id=user.branch_id,
            actor_user_id=user.id,
            actor_role=",".join(user_role_keys(session, user)),
            action="auth.login",
            resource_type="user",
            resource_id=user.id,
            purpose="authentication",
        )
    return LoginResponse(
        access_token=token,
        expires_at=auth_session.expires_at,
        user=_auth_user_read(session, user),
    )


@router.get("/auth/me", response_model=AuthUserRead)
def me(
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> AuthUserRead:
    return _auth_user_read(session, current_user)


@router.post("/auth/logout")
def logout(
    response: Response,
    auth_session: AuthSession = Depends(get_current_auth_session),
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> dict[str, bool]:
    auth_session.revoked_at = datetime.now(timezone.utc)
    session.add(auth_session)
    session.commit()
    response.delete_cookie(key="access_token", path="/")
    if current_user.tenant_id:
        record_audit_event(
            session,
            tenant_id=current_user.tenant_id,
            branch_id=current_user.branch_id,
            actor_user_id=current_user.id,
            actor_role=",".join(user_role_keys(session, current_user)),
            action="auth.logout",
            resource_type="user",
            resource_id=current_user.id,
            purpose="authentication",
        )
    return {"logged_out": True}


@router.post("/auth/change-password", response_model=UserRead)
def change_password(
    payload: ChangePasswordRequest,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> User:
    if not verify_password(payload.current_password, current_user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Current password is invalid",
        )
    current_user.password_hash = hash_password(payload.new_password)
    current_user.must_change_password = False
    session.add(current_user)
    session.commit()
    session.refresh(current_user)
    if current_user.tenant_id:
        record_audit_event(
            session,
            tenant_id=current_user.tenant_id,
            branch_id=current_user.branch_id,
            actor_user_id=current_user.id,
            actor_role=",".join(user_role_keys(session, current_user)),
            action="auth.password_changed",
            resource_type="user",
            resource_id=current_user.id,
            purpose="security",
        )
    return current_user


@router.get("/identity/permissions", response_model=list[PermissionRead])
def list_permission_catalog(
    _current_user: User = Depends(get_current_user),
) -> list[PermissionRead]:
    return [
        _permission_read(key) for key in sorted(set(permissions.PERMISSION_CATALOG))
    ]


@router.post(
    "/identity/roles", response_model=RoleRead, status_code=status.HTTP_201_CREATED
)
def create_role(
    payload: RoleCreate,
    tenant_id: str = Depends(require_tenant_id),
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> RoleRead:
    _assert_tenant_admin(session, current_user, tenant_id)
    role = Role(
        tenant_id=tenant_id,
        name=payload.name,
        key=_normalize_role_key(payload.key or payload.name),
        is_global_template=current_user.is_super_admin
        and _is_primary_tenant(session, tenant_id),
        is_template_locked=False,
        created_by_user_id=current_user.id,
        updated_by_user_id=current_user.id,
    )
    session.add(role)
    session.commit()
    session.refresh(role)
    for permission_key in payload.permission_keys:
        permission = _ensure_permission(session, permission_key)
        session.add(RolePermission(role_id=role.id, permission_id=permission.id))
    session.commit()
    record_audit_event(
        session,
        tenant_id=tenant_id,
        actor_user_id=current_user.id,
        actor_role=",".join(user_role_keys(session, current_user)),
        action="identity.role_created",
        resource_type="role",
        resource_id=role.id,
        purpose="access_control",
    )
    return _role_read(session, role)


@router.post(
    "/identity/roles/{role_id}/assign/{target_tenant_id}", response_model=RoleRead
)
def assign_role_to_tenant(
    role_id: str,
    target_tenant_id: str,
    current_user: User = Depends(require_super_admin),
    session: Session = Depends(get_session),
) -> RoleRead:
    source_role = session.get(Role, role_id)
    target_tenant = session.get(Tenant, target_tenant_id)
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

    source_permissions = list(
        session.exec(
            select(Permission.key)
            .join(RolePermission, RolePermission.permission_id == Permission.id)
            .where(RolePermission.role_id == source_role.id)
        ).all()
    )
    role = session.exec(
        select(Role).where(
            Role.tenant_id == target_tenant_id, Role.key == source_role.key
        )
    ).first()
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
            created_by_user_id=current_user.id,
        )
    role.updated_by_user_id = current_user.id
    role.updated_at = now_utc()
    session.add(role)
    session.commit()
    session.refresh(role)
    _replace_role_permissions(session, role, source_permissions)
    session.commit()
    record_audit_event(
        session,
        tenant_id=target_tenant_id,
        actor_user_id=current_user.id,
        actor_role="super_admin",
        action="identity.role_assigned_from_template",
        resource_type="role",
        resource_id=role.id,
        purpose=f"source_role:{source_role.id}",
    )
    return _role_read(session, role)


@router.get("/identity/roles", response_model=list[RoleRead])
def list_roles(
    tenant_id: str = Depends(require_tenant_id),
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> list[RoleRead]:
    _assert_tenant_permission(
        session,
        current_user,
        tenant_id,
        permissions.IDENTITY_ROLES_MANAGE,
        permissions.IDENTITY_ROLES_READ,
        permissions.IDENTITY_USERS_MANAGE,
        permissions.IDENTITY_USERS_READ,
    )
    roles = session.exec(
        select(Role)
        .where(Role.tenant_id == tenant_id)
        .order_by(Role.updated_at.desc(), Role.created_at.desc())
    ).all()
    return [_role_read(session, role) for role in roles]


def _get_tenant_role_or_404(session: Session, tenant_id: str, role_id: str) -> Role:
    role = session.get(Role, role_id)
    if not role or role.tenant_id != tenant_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Role not found"
        )
    return role


def _replace_role_permissions(
    session: Session, role: Role, permission_keys: list[str]
) -> None:
    existing = list(
        session.exec(
            select(RolePermission).where(RolePermission.role_id == role.id)
        ).all()
    )
    for row in existing:
        session.delete(row)
    for permission_key in permission_keys:
        permission = _ensure_permission(session, permission_key)
        session.add(RolePermission(role_id=role.id, permission_id=permission.id))


def _role_permission_keys(session: Session, role: Role) -> list[str]:
    return list(
        session.exec(
            select(Permission.key)
            .join(RolePermission, RolePermission.permission_id == Permission.id)
            .where(RolePermission.role_id == role.id)
        ).all()
    )


def _resolve_role_for_user_assignment(
    session: Session,
    tenant_id: str,
    role_key: str,
    current_user: User,
) -> Role | None:
    role = session.exec(
        select(Role).where(Role.tenant_id == tenant_id, Role.key == role_key)
    ).first()
    if role or role_key != "tenant_admin" or not current_user.is_super_admin:
        return role

    target_tenant = session.get(Tenant, tenant_id)
    source_role = session.exec(
        select(Role)
        .join(Tenant, Tenant.id == Role.tenant_id)
        .where(Tenant.is_primary == True, Role.key == "tenant_admin")  # noqa: E712
    ).first()
    source_permissions = (
        _role_permission_keys(session, source_role)
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
    session.add(role)
    session.commit()
    session.refresh(role)
    _replace_role_permissions(session, role, source_permissions)
    session.commit()
    return role


def _normalize_user_access(updates: dict) -> dict:
    role_keys = list(updates.get("role_keys") or [])
    has_tenant_admin_access = (
        updates.get("user_type") == "tenant_admin" or "tenant_admin" in role_keys
    )
    if has_tenant_admin_access:
        updates["user_type"] = "tenant_admin"
        updates["branch_id"] = None
        if "tenant_admin" not in role_keys:
            role_keys.append("tenant_admin")
        updates["role_keys"] = role_keys
    return updates


@router.patch("/identity/roles/{role_id}", response_model=RoleRead)
def update_role(
    role_id: str,
    payload: RoleUpdate,
    tenant_id: str = Depends(require_tenant_id),
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> RoleRead:
    _assert_tenant_admin(session, current_user, tenant_id)
    role = _get_tenant_role_or_404(session, tenant_id, role_id)
    _assert_role_editable_by_actor(session, role, current_user)
    updates = payload.model_dump(exclude_unset=True)
    if "key" in updates and updates["key"]:
        next_key = _normalize_role_key(updates["key"])
        duplicate = session.exec(
            select(Role).where(
                Role.tenant_id == tenant_id, Role.key == next_key, Role.id != role_id
            )
        ).first()
        if duplicate:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT, detail="Role key already exists"
            )
        role.key = next_key
    if "name" in updates and updates["name"]:
        role.name = updates["name"]
    if "is_active" in updates and updates["is_active"] is not None:
        role.is_active = updates["is_active"]
    if "permission_keys" in updates and updates["permission_keys"] is not None:
        _replace_role_permissions(session, role, updates["permission_keys"])
    role.updated_by_user_id = current_user.id
    role.updated_at = now_utc()
    session.add(role)
    session.commit()
    session.refresh(role)
    record_audit_event(
        session,
        tenant_id=tenant_id,
        actor_user_id=current_user.id,
        actor_role=",".join(user_role_keys(session, current_user)),
        action="identity.role_updated",
        resource_type="role",
        resource_id=role.id,
        purpose="access_control",
    )
    return _role_read(session, role)


@router.post("/identity/roles/{role_id}/status", response_model=RoleRead)
def change_role_status(
    role_id: str,
    payload: RoleUpdate,
    tenant_id: str = Depends(require_tenant_id),
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> RoleRead:
    _assert_tenant_admin(session, current_user, tenant_id)
    if payload.is_active is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="is_active is required"
        )
    role = _get_tenant_role_or_404(session, tenant_id, role_id)
    _assert_role_editable_by_actor(session, role, current_user)
    role.is_active = payload.is_active
    role.updated_by_user_id = current_user.id
    role.updated_at = now_utc()
    session.add(role)
    session.commit()
    session.refresh(role)
    record_audit_event(
        session,
        tenant_id=tenant_id,
        actor_user_id=current_user.id,
        actor_role=",".join(user_role_keys(session, current_user)),
        action="identity.role_status_changed",
        resource_type="role",
        resource_id=role.id,
        purpose="access_control",
    )
    return _role_read(session, role)


@router.delete("/identity/roles/{role_id}")
def delete_role(
    role_id: str,
    tenant_id: str = Depends(require_tenant_id),
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> dict[str, str | bool]:
    _assert_tenant_admin(session, current_user, tenant_id)
    role = _get_tenant_role_or_404(session, tenant_id, role_id)
    _assert_role_editable_by_actor(session, role, current_user)
    role.is_active = False
    role.updated_by_user_id = current_user.id
    role.updated_at = now_utc()
    session.add(role)
    session.commit()
    record_audit_event(
        session,
        tenant_id=tenant_id,
        actor_user_id=current_user.id,
        actor_role=",".join(user_role_keys(session, current_user)),
        action="identity.role_deleted",
        resource_type="role",
        resource_id=role.id,
        purpose="access_control_soft_delete",
    )
    return {"deleted": True, "mode": "deactivated", "role_id": role.id}


@router.post(
    "/identity/users", response_model=UserRead, status_code=status.HTTP_201_CREATED
)
def create_user(
    payload: UserCreate,
    tenant_id: str = Depends(require_tenant_id),
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> UserRead:
    _assert_tenant_permission(
        session,
        current_user,
        tenant_id,
        permissions.IDENTITY_USERS_MANAGE,
        permissions.IDENTITY_USERS_CREATE,
    )
    user_payload = _normalize_user_access(payload.model_dump())
    tenant = session.get(Tenant, tenant_id)
    if not tenant:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Tenant not found"
        )
    existing = session.exec(
        select(User).where(
            User.tenant_id == tenant_id,
            User.email == _normalize_email(user_payload["email"]),
        )
    ).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="User already exists"
        )
    user = User(
        tenant_id=tenant_id,
        branch_id=user_payload["branch_id"],
        user_number=next_document_number(
            session,
            tenant_id=tenant_id,
            branch_id=user_payload["branch_id"],
            entity="user",
        ),
        user_type=user_payload["user_type"],
        name=user_payload["name"],
        email=_normalize_email(user_payload["email"]),
        mobile=user_payload["mobile"],
        password_hash=hash_password(user_payload["password"]),
        must_change_password=user_payload["must_change_password"],
        created_by_user_id=current_user.id,
        updated_by_user_id=current_user.id,
    )
    session.add(user)
    session.commit()
    session.refresh(user)
    for role_key in user_payload["role_keys"]:
        role = _resolve_role_for_user_assignment(
            session, tenant_id, role_key, current_user
        )
        if not role:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Unknown role: {role_key}",
            )
        session.add(UserRole(user_id=user.id, role_id=role.id, tenant_id=tenant_id))
    session.commit()
    record_audit_event(
        session,
        tenant_id=tenant_id,
        branch_id=user.branch_id,
        actor_user_id=current_user.id,
        actor_role=",".join(user_role_keys(session, current_user)),
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
    return _user_read(session, user)


@router.get("/identity/users", response_model=list[UserRead])
def list_users(
    tenant_id: str = Depends(require_tenant_id),
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> list[UserRead]:
    _assert_tenant_permission(
        session,
        current_user,
        tenant_id,
        permissions.IDENTITY_USERS_MANAGE,
        permissions.IDENTITY_USERS_READ,
    )
    users = session.exec(
        select(User)
        .where(User.tenant_id == tenant_id)
        .order_by(User.updated_at.desc(), User.created_at.desc())
    ).all()
    return [_user_read(session, user) for user in users]


def _get_tenant_user_or_404(session: Session, tenant_id: str, user_id: str) -> User:
    user = session.get(User, user_id)
    if not user or user.tenant_id != tenant_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="User not found"
        )
    return user


def _replace_user_roles(
    session: Session,
    tenant_id: str,
    user: User,
    role_keys: list[str],
    current_user: User,
) -> None:
    existing = list(
        session.exec(select(UserRole).where(UserRole.user_id == user.id)).all()
    )
    for row in existing:
        session.delete(row)
    for role_key in role_keys:
        role = _resolve_role_for_user_assignment(
            session, tenant_id, role_key, current_user
        )
        if not role:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Unknown role: {role_key}",
            )
        session.add(UserRole(user_id=user.id, role_id=role.id, tenant_id=tenant_id))


@router.patch("/identity/users/{user_id}", response_model=UserRead)
def update_user(
    user_id: str,
    payload: UserUpdate,
    tenant_id: str = Depends(require_tenant_id),
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> UserRead:
    _assert_tenant_permission(
        session,
        current_user,
        tenant_id,
        permissions.IDENTITY_USERS_MANAGE,
        permissions.IDENTITY_USERS_EDIT,
    )
    user = _get_tenant_user_or_404(session, tenant_id, user_id)
    updates = _normalize_user_access(payload.model_dump(exclude_unset=True))
    if "email" in updates and updates["email"]:
        email = _normalize_email(updates["email"])
        duplicate = session.exec(
            select(User).where(
                User.tenant_id == tenant_id, User.email == email, User.id != user_id
            )
        ).first()
        if duplicate:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT, detail="User email already exists"
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
        _replace_user_roles(
            session, tenant_id, user, updates["role_keys"], current_user
        )
    user.updated_by_user_id = current_user.id
    user.updated_at = now_utc()
    session.add(user)
    session.commit()
    session.refresh(user)
    record_audit_event(
        session,
        tenant_id=tenant_id,
        branch_id=user.branch_id,
        actor_user_id=current_user.id,
        actor_role=",".join(user_role_keys(session, current_user)),
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
    return _user_read(session, user)


@router.post("/identity/users/{user_id}/password-reset", response_model=UserRead)
def reset_user_password(
    user_id: str,
    payload: ResetUserPasswordRequest,
    tenant_id: str = Depends(require_tenant_id),
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> UserRead:
    _assert_tenant_permission(
        session,
        current_user,
        tenant_id,
        permissions.IDENTITY_USERS_MANAGE,
        permissions.IDENTITY_USERS_EDIT,
    )
    user = _get_tenant_user_or_404(session, tenant_id, user_id)
    if user.id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Use change password for your own login",
        )
    if current_user.is_super_admin and (
        _is_primary_tenant(session, tenant_id)
        or not _has_tenant_admin_access(session, user)
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
    user.updated_by_user_id = current_user.id
    user.updated_at = now_utc()
    session.add(user)
    session.commit()
    session.refresh(user)
    record_audit_event(
        session,
        tenant_id=tenant_id,
        branch_id=user.branch_id,
        actor_user_id=current_user.id,
        actor_role=",".join(user_role_keys(session, current_user)),
        action="identity.user_password_reset",
        resource_type="user",
        resource_id=user.id,
        purpose="password_reset",
    )
    return _user_read(session, user)


@router.post("/identity/users/{user_id}/status", response_model=UserRead)
def change_user_status(
    user_id: str,
    payload: UserUpdate,
    tenant_id: str = Depends(require_tenant_id),
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> UserRead:
    _assert_tenant_permission(
        session,
        current_user,
        tenant_id,
        permissions.IDENTITY_USERS_MANAGE,
        permissions.IDENTITY_USERS_EDIT,
    )
    if payload.is_active is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="is_active is required"
        )
    user = _get_tenant_user_or_404(session, tenant_id, user_id)
    if user.id == current_user.id and payload.is_active is False:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You cannot deactivate your own user",
        )
    user.is_active = payload.is_active
    if payload.is_active:
        original_email = _original_user_email(user)
        if original_email != user.email:
            duplicate = session.exec(
                select(User).where(
                    User.tenant_id == tenant_id,
                    User.email == original_email,
                    User.id != user.id,
                )
            ).first()
            if duplicate:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Restore or change the user email before activation; the original email is already in use",
                )
            user.email = original_email
    user.updated_by_user_id = current_user.id
    user.updated_at = now_utc()
    session.add(user)
    session.commit()
    session.refresh(user)
    record_audit_event(
        session,
        tenant_id=tenant_id,
        branch_id=user.branch_id,
        actor_user_id=current_user.id,
        actor_role=",".join(user_role_keys(session, current_user)),
        action="identity.user_status_changed",
        resource_type="user",
        resource_id=user.id,
        purpose="access_control",
    )
    return _user_read(session, user)


@router.delete("/identity/users/{user_id}")
def delete_user(
    user_id: str,
    tenant_id: str = Depends(require_tenant_id),
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> dict[str, str | bool]:
    _assert_tenant_permission(
        session,
        current_user,
        tenant_id,
        permissions.IDENTITY_USERS_MANAGE,
        permissions.IDENTITY_USERS_DELETE,
    )
    user = _get_tenant_user_or_404(session, tenant_id, user_id)
    if user.id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You cannot delete your own user",
        )
    user.is_active = False
    if not user.email.startswith(f"deleted+{user.id}+"):
        user.email = f"deleted+{user.id}+{user.email}"
    user.updated_by_user_id = current_user.id
    user.updated_at = now_utc()
    session.add(user)
    session.commit()
    record_audit_event(
        session,
        tenant_id=tenant_id,
        branch_id=user.branch_id,
        actor_user_id=current_user.id,
        actor_role=",".join(user_role_keys(session, current_user)),
        action="identity.user_deleted",
        resource_type="user",
        resource_id=user.id,
        purpose="access_control_soft_delete",
    )
    return {"deleted": True, "mode": "deactivated", "user_id": user.id}
