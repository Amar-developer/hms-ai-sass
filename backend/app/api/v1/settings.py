from fastapi import APIRouter, Depends, Query
from sqlmodel import Session

from app.core.access_control import scoped_branch_id
from app.core.auth import get_current_user, require_any_permission
from app.core.database import get_session
from app.core.tenant_context import require_tenant_id
from app.core.validation import BranchId
from app.modules.identity import permissions
from app.modules.identity.models import User
from app.modules.settings.models import SettingKey
from app.modules.settings.schemas import (
    AdminSettingRead,
    AdminSettingsBundle,
    AdminSettingUpsert,
    ResolvedSettingRead,
)
from app.modules.settings import service as settings_service

router = APIRouter(prefix="/settings")


@router.put(
    "",
    response_model=AdminSettingRead,
    summary="Create or update setting",
    dependencies=[
        Depends(
            require_any_permission(
                permissions.SETTINGS_MANAGE,
                permissions.SETTINGS_CREATE,
                permissions.SETTINGS_EDIT,
            )
        )
    ],
)
def upsert_admin_setting(
    payload: AdminSettingUpsert,
    tenant_id: str = Depends(require_tenant_id),
    current_user: User = Depends(
        require_any_permission(
            permissions.SETTINGS_MANAGE,
            permissions.SETTINGS_CREATE,
            permissions.SETTINGS_EDIT,
        )
    ),
    session: Session = Depends(get_session),
) -> AdminSettingRead:
    return settings_service.upsert_admin_setting(
        session, tenant_id=tenant_id, payload=payload, actor=current_user
    )


@router.get(
    "",
    response_model=list[AdminSettingRead],
    summary="List settings",
    dependencies=[
        Depends(
            require_any_permission(
                permissions.SETTINGS_MANAGE, permissions.SETTINGS_READ
            )
        )
    ],
)
def list_admin_settings(
    tenant_id: str = Depends(require_tenant_id),
    module: str | None = Query(default=None, min_length=2, max_length=80),
    current_user: User = Depends(
        require_any_permission(permissions.SETTINGS_MANAGE, permissions.SETTINGS_READ)
    ),
    session: Session = Depends(get_session),
) -> list[AdminSettingRead]:
    return settings_service.list_admin_settings(
        session, tenant_id=tenant_id, module=module, actor=current_user
    )


@router.get(
    "/sidebar-modules",
    response_model=dict,
    summary="Get sidebar modules",
)
def get_sidebar_role_modules(
    tenant_id: str = Depends(require_tenant_id),
    _current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> dict:
    return settings_service.get_sidebar_role_modules(session, tenant_id=tenant_id)


@router.get(
    "/resolve",
    response_model=ResolvedSettingRead,
    summary="Resolve setting",
    dependencies=[
        Depends(
            require_any_permission(
                permissions.SETTINGS_MANAGE,
                permissions.SETTINGS_READ,
                permissions.BILLING_MANAGE,
                permissions.INVOICES_READ,
                permissions.PAYMENTS_MANAGE,
            )
        )
    ],
)
def resolve_admin_setting(
    key: SettingKey,
    module: str = Query(min_length=2, max_length=80),
    branch_id: BranchId | None = None,
    tenant_id: str = Depends(require_tenant_id),
    current_user: User = Depends(
        require_any_permission(
            permissions.SETTINGS_MANAGE,
            permissions.SETTINGS_READ,
            permissions.BILLING_MANAGE,
            permissions.INVOICES_READ,
            permissions.PAYMENTS_MANAGE,
        )
    ),
    session: Session = Depends(get_session),
) -> ResolvedSettingRead:
    branch_id = scoped_branch_id(current_user, branch_id)
    return settings_service.resolve_admin_setting(
        session, tenant_id=tenant_id, module=module, key=key, branch_id=branch_id
    )


@router.get(
    "/bundle",
    response_model=AdminSettingsBundle,
    summary="Resolve settings bundle",
    dependencies=[
        Depends(
            require_any_permission(
                permissions.SETTINGS_MANAGE, permissions.SETTINGS_READ
            )
        )
    ],
)
def resolve_settings_bundle(
    module: str = Query(min_length=2, max_length=80),
    branch_id: BranchId | None = None,
    tenant_id: str = Depends(require_tenant_id),
    current_user: User = Depends(
        require_any_permission(permissions.SETTINGS_MANAGE, permissions.SETTINGS_READ)
    ),
    session: Session = Depends(get_session),
) -> AdminSettingsBundle:
    branch_id = scoped_branch_id(current_user, branch_id)
    return settings_service.resolve_settings_bundle(
        session, tenant_id=tenant_id, module=module, branch_id=branch_id
    )
