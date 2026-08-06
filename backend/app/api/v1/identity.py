from fastapi import APIRouter, Depends, Request, Response, status
from sqlmodel import Session

from app.core.auth import (
    get_current_auth_session,
    get_current_user,
    require_any_permission,
    require_super_admin,
)
from app.core.database import get_session
from app.core.tenant_context import require_tenant_id
from app.modules.identity import permissions
from app.modules.identity.models import AuthSession, User
from app.modules.identity.schemas import (
    AuthUserRead,
    BootstrapSuperAdminRequest,
    ChangePasswordRequest,
    LoginRequest,
    LoginResponse,
    PermissionRead,
    PrivilegedAccessOptionsRead,
    PrivilegedAccountCreate,
    PrivilegedAccountUpdate,
    ResetUserPasswordRequest,
    RoleCreate,
    RoleRead,
    RoleUpdate,
    SuperAdminCreate,
    SuperAdminStatusUpdate,
    SupportAccessGrantCreate,
    SupportAccessGrantRead,
    SupportAccessGrantRevoke,
    UserCreate,
    UserRead,
    UserUpdate,
)
from app.modules.identity.services.auth_service import AuthService, secure_cookie
from app.modules.identity.services.privileged_access_service import (
    PrivilegedAccessService,
)
from app.modules.identity.services.role_service import RoleService
from app.modules.identity.services.super_admin_service import SuperAdminService
from app.modules.identity.services.user_service import UserService

router = APIRouter()


@router.get("/identity/super-admins", response_model=list[UserRead])
def list_super_admins(
    current_user: User = Depends(require_super_admin),
    session: Session = Depends(get_session),
) -> list[UserRead]:
    return SuperAdminService(session).list_super_admins(actor=current_user)


@router.post(
    "/identity/super-admins",
    response_model=UserRead,
    status_code=status.HTTP_201_CREATED,
)
def create_super_admin(
    payload: SuperAdminCreate,
    current_user: User = Depends(require_super_admin),
    session: Session = Depends(get_session),
) -> UserRead:
    return SuperAdminService(session).create_super_admin(
        payload=payload, actor=current_user
    )


@router.post("/identity/super-admins/{user_id}/status", response_model=UserRead)
def change_super_admin_status(
    user_id: str,
    payload: SuperAdminStatusUpdate,
    current_user: User = Depends(require_super_admin),
    session: Session = Depends(get_session),
) -> UserRead:
    return SuperAdminService(session).change_status(
        user_id=user_id, payload=payload, actor=current_user
    )


@router.get(
    "/identity/privileged-access/options",
    response_model=PrivilegedAccessOptionsRead,
)
def privileged_access_options(
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> PrivilegedAccessOptionsRead:
    return PrivilegedAccessService(session).options(actor=current_user)


@router.get("/identity/privileged-accounts", response_model=list[UserRead])
def list_privileged_accounts(
    current_user: User = Depends(require_super_admin),
    session: Session = Depends(get_session),
) -> list[UserRead]:
    return PrivilegedAccessService(session).list_accounts(actor=current_user)


@router.post(
    "/identity/privileged-accounts",
    response_model=UserRead,
    status_code=status.HTTP_201_CREATED,
)
def create_privileged_account(
    payload: PrivilegedAccountCreate,
    current_user: User = Depends(require_super_admin),
    session: Session = Depends(get_session),
) -> UserRead:
    return PrivilegedAccessService(session).create_account(
        payload=payload, actor=current_user
    )


@router.patch("/identity/privileged-accounts/{user_id}", response_model=UserRead)
def update_privileged_account(
    user_id: str,
    payload: PrivilegedAccountUpdate,
    current_user: User = Depends(require_super_admin),
    session: Session = Depends(get_session),
) -> UserRead:
    return PrivilegedAccessService(session).update_account(
        user_id=user_id,
        payload=payload,
        actor=current_user,
    )


@router.get(
    "/identity/support-access-grants",
    response_model=list[SupportAccessGrantRead],
)
def list_support_access_grants(
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> list[SupportAccessGrantRead]:
    return PrivilegedAccessService(session).list_grants(actor=current_user)


@router.post(
    "/identity/support-access-grants",
    response_model=SupportAccessGrantRead,
    status_code=status.HTTP_201_CREATED,
)
def create_support_access_grant(
    payload: SupportAccessGrantCreate,
    current_user: User = Depends(require_super_admin),
    session: Session = Depends(get_session),
) -> SupportAccessGrantRead:
    return PrivilegedAccessService(session).create_grant(
        payload=payload,
        actor=current_user,
    )


@router.post(
    "/identity/support-access-grants/{grant_id}/revoke",
    response_model=SupportAccessGrantRead,
)
def revoke_support_access_grant(
    grant_id: str,
    payload: SupportAccessGrantRevoke,
    current_user: User = Depends(require_super_admin),
    session: Session = Depends(get_session),
) -> SupportAccessGrantRead:
    return PrivilegedAccessService(session).revoke_grant(
        grant_id=grant_id,
        payload=payload,
        actor=current_user,
    )


@router.post(
    "/auth/bootstrap-super-admin",
    response_model=UserRead,
    status_code=status.HTTP_201_CREATED,
)
def bootstrap_super_admin(
    payload: BootstrapSuperAdminRequest,
    session: Session = Depends(get_session),
) -> User:
    return AuthService(session).bootstrap_super_admin(payload)


@router.post("/auth/login", response_model=LoginResponse)
def login(
    payload: LoginRequest,
    request: Request,
    response: Response,
    session: Session = Depends(get_session),
) -> LoginResponse:
    client_ip = request.client.host if request.client else "unknown"
    result = AuthService(session).login(payload, client_ip=client_ip)
    response.set_cookie(
        key="access_token",
        value=result.response.access_token,
        httponly=True,
        secure=secure_cookie,
        samesite="lax",
        max_age=result.max_age_seconds,
        path="/",
    )
    return result.response


@router.get("/auth/me", response_model=AuthUserRead)
def me(
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> AuthUserRead:
    return AuthService(session).me(current_user)


@router.post("/auth/logout")
def logout(
    response: Response,
    auth_session: AuthSession = Depends(get_current_auth_session),
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> dict[str, bool]:
    AuthService(session).logout(auth_session=auth_session, current_user=current_user)
    response.delete_cookie(key="access_token", path="/")
    return {"logged_out": True}


@router.post("/auth/change-password", response_model=UserRead)
def change_password(
    payload: ChangePasswordRequest,
    current_user: User = Depends(get_current_user),
    auth_session: AuthSession = Depends(get_current_auth_session),
    session: Session = Depends(get_session),
) -> User:
    return AuthService(session).change_password(
        current_user=current_user,
        current_auth_session=auth_session,
        payload=payload,
    )


@router.get("/identity/permissions", response_model=list[PermissionRead])
def list_permission_catalog(
    tenant_id: str = Depends(require_tenant_id),
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> list[PermissionRead]:
    return RoleService(session).list_permission_catalog(
        tenant_id=tenant_id, actor=current_user
    )


@router.post(
    "/identity/roles", response_model=RoleRead, status_code=status.HTTP_201_CREATED
)
def create_role(
    payload: RoleCreate,
    tenant_id: str = Depends(require_tenant_id),
    current_user: User = Depends(
        require_any_permission(
            permissions.IDENTITY_ROLES_MANAGE, permissions.IDENTITY_ROLES_CREATE
        )
    ),
    session: Session = Depends(get_session),
) -> RoleRead:
    return RoleService(session).create_role(
        tenant_id=tenant_id, payload=payload, actor=current_user
    )


@router.post(
    "/identity/roles/{role_id}/assign/{target_tenant_id}", response_model=RoleRead
)
def assign_role_to_tenant(
    role_id: str,
    target_tenant_id: str,
    current_user: User = Depends(require_super_admin),
    session: Session = Depends(get_session),
) -> RoleRead:
    return RoleService(session).assign_role_to_tenant(
        role_id=role_id, target_tenant_id=target_tenant_id, actor=current_user
    )


@router.get("/identity/roles", response_model=list[RoleRead])
def list_roles(
    tenant_id: str = Depends(require_tenant_id),
    current_user: User = Depends(
        require_any_permission(
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
    ),
    session: Session = Depends(get_session),
) -> list[RoleRead]:
    return RoleService(session).list_roles(tenant_id=tenant_id, actor=current_user)


@router.patch("/identity/roles/{role_id}", response_model=RoleRead)
def update_role(
    role_id: str,
    payload: RoleUpdate,
    tenant_id: str = Depends(require_tenant_id),
    current_user: User = Depends(
        require_any_permission(
            permissions.IDENTITY_ROLES_MANAGE, permissions.IDENTITY_ROLES_EDIT
        )
    ),
    session: Session = Depends(get_session),
) -> RoleRead:
    return RoleService(session).update_role(
        tenant_id=tenant_id, role_id=role_id, payload=payload, actor=current_user
    )


@router.post("/identity/roles/{role_id}/status", response_model=RoleRead)
def change_role_status(
    role_id: str,
    payload: RoleUpdate,
    tenant_id: str = Depends(require_tenant_id),
    current_user: User = Depends(
        require_any_permission(
            permissions.IDENTITY_ROLES_MANAGE, permissions.IDENTITY_ROLES_EDIT
        )
    ),
    session: Session = Depends(get_session),
) -> RoleRead:
    return RoleService(session).change_role_status(
        tenant_id=tenant_id, role_id=role_id, payload=payload, actor=current_user
    )


@router.delete("/identity/roles/{role_id}")
def delete_role(
    role_id: str,
    tenant_id: str = Depends(require_tenant_id),
    current_user: User = Depends(
        require_any_permission(
            permissions.IDENTITY_ROLES_MANAGE, permissions.IDENTITY_ROLES_DELETE
        )
    ),
    session: Session = Depends(get_session),
) -> dict[str, str | bool]:
    return RoleService(session).delete_role(
        tenant_id=tenant_id, role_id=role_id, actor=current_user
    )


@router.post(
    "/identity/users", response_model=UserRead, status_code=status.HTTP_201_CREATED
)
def create_user(
    payload: UserCreate,
    tenant_id: str = Depends(require_tenant_id),
    current_user: User = Depends(
        require_any_permission(
            permissions.IDENTITY_USERS_MANAGE, permissions.IDENTITY_USERS_CREATE
        )
    ),
    session: Session = Depends(get_session),
) -> UserRead:
    return UserService(session).create_user(
        tenant_id=tenant_id, payload=payload, actor=current_user
    )


@router.get("/identity/users", response_model=list[UserRead])
def list_users(
    tenant_id: str = Depends(require_tenant_id),
    current_user: User = Depends(
        require_any_permission(
            permissions.IDENTITY_USERS_MANAGE, permissions.IDENTITY_USERS_READ
        )
    ),
    session: Session = Depends(get_session),
) -> list[UserRead]:
    return UserService(session).list_users(tenant_id=tenant_id, actor=current_user)


@router.patch("/identity/users/{user_id}", response_model=UserRead)
def update_user(
    user_id: str,
    payload: UserUpdate,
    tenant_id: str = Depends(require_tenant_id),
    current_user: User = Depends(
        require_any_permission(
            permissions.IDENTITY_USERS_MANAGE, permissions.IDENTITY_USERS_EDIT
        )
    ),
    session: Session = Depends(get_session),
) -> UserRead:
    return UserService(session).update_user(
        tenant_id=tenant_id, user_id=user_id, payload=payload, actor=current_user
    )


@router.post("/identity/users/{user_id}/password-reset", response_model=UserRead)
def reset_user_password(
    user_id: str,
    payload: ResetUserPasswordRequest,
    tenant_id: str = Depends(require_tenant_id),
    current_user: User = Depends(
        require_any_permission(
            permissions.IDENTITY_USERS_MANAGE, permissions.IDENTITY_USERS_EDIT
        )
    ),
    session: Session = Depends(get_session),
) -> UserRead:
    return UserService(session).reset_user_password(
        tenant_id=tenant_id, user_id=user_id, payload=payload, actor=current_user
    )


@router.post("/identity/users/{user_id}/status", response_model=UserRead)
def change_user_status(
    user_id: str,
    payload: UserUpdate,
    tenant_id: str = Depends(require_tenant_id),
    current_user: User = Depends(
        require_any_permission(
            permissions.IDENTITY_USERS_MANAGE, permissions.IDENTITY_USERS_EDIT
        )
    ),
    session: Session = Depends(get_session),
) -> UserRead:
    return UserService(session).change_user_status(
        tenant_id=tenant_id, user_id=user_id, payload=payload, actor=current_user
    )


@router.delete("/identity/users/{user_id}")
def delete_user(
    user_id: str,
    tenant_id: str = Depends(require_tenant_id),
    current_user: User = Depends(
        require_any_permission(
            permissions.IDENTITY_USERS_MANAGE, permissions.IDENTITY_USERS_DELETE
        )
    ),
    session: Session = Depends(get_session),
) -> dict[str, str | bool]:
    return UserService(session).delete_user(
        tenant_id=tenant_id, user_id=user_id, actor=current_user
    )
