from fastapi import APIRouter, Depends
from sqlmodel import Session, select

from app.core.access_control import require_user_branch_access, scoped_branch_id
from app.core.auth import require_permission
from app.core.database import get_session
from app.core.tenant_context import require_tenant_id
from app.modules.identity import permissions
from app.modules.identity.models import User
from app.modules.audit.service import record_audit_event
from app.modules.settings.models import AdminSetting, SettingKey
from app.modules.settings.schemas import (
    AdminSettingRead,
    AdminSettingsBundle,
    AdminSettingUpsert,
    ResolvedSettingRead,
)
from app.modules.settings.service import decode_value, resolve_setting, upsert_setting, validate_scope

router = APIRouter(prefix="/settings")


def _read_setting(setting: AdminSetting) -> AdminSettingRead:
    return AdminSettingRead(
        id=setting.id,
        tenant_id=setting.tenant_id,
        scope=setting.scope,
        scope_id=setting.scope_id,
        module=setting.module,
        key=setting.key,
        value=decode_value(setting.value_json),
        created_by_user_id=setting.created_by_user_id,
        updated_by_user_id=setting.updated_by_user_id,
        created_at=setting.created_at,
        updated_at=setting.updated_at,
    )


@router.put(
    "",
    response_model=AdminSettingRead,
    dependencies=[Depends(require_permission(permissions.SETTINGS_MANAGE))],
)
def upsert_admin_setting(
    payload: AdminSettingUpsert,
    tenant_id: str = Depends(require_tenant_id),
    current_user: User = Depends(require_permission(permissions.SETTINGS_MANAGE)),
    session: Session = Depends(get_session),
) -> AdminSettingRead:
    scope_id = validate_scope(session, tenant_id, payload.scope, payload.scope_id)
    if payload.scope.value == "branch":
        require_user_branch_access(current_user, scope_id)
    setting = upsert_setting(
        session,
        tenant_id=tenant_id,
        scope=payload.scope,
        scope_id=scope_id,
        module=payload.module,
        key=payload.key,
        value=payload.value,
        actor_user_id=payload.actor_user_id,
    )
    record_audit_event(
        session,
        tenant_id=tenant_id,
        branch_id=scope_id if payload.scope.value == "branch" else None,
        actor_user_id=payload.actor_user_id,
        action="setting.upserted",
        resource_type="admin_setting",
        resource_id=setting.id,
        purpose="admin_configuration",
        metadata_json=f'{{"key": "{payload.key.value}", "module": "{payload.module}"}}',
    )
    return _read_setting(setting)


@router.get(
    "",
    response_model=list[AdminSettingRead],
    dependencies=[Depends(require_permission(permissions.SETTINGS_MANAGE))],
)
def list_admin_settings(
    tenant_id: str = Depends(require_tenant_id),
    module: str | None = None,
    current_user: User = Depends(require_permission(permissions.SETTINGS_MANAGE)),
    session: Session = Depends(get_session),
) -> list[AdminSettingRead]:
    statement = select(AdminSetting).where(AdminSetting.tenant_id == tenant_id)
    if current_user.branch_id and not current_user.is_super_admin:
        statement = statement.where(
            (AdminSetting.scope_id == tenant_id) | (AdminSetting.scope_id == current_user.branch_id)
        )
    if module:
        statement = statement.where(AdminSetting.module == module)
    settings = list(session.exec(statement.order_by(AdminSetting.created_at)).all())
    return [_read_setting(setting) for setting in settings]


@router.get(
    "/resolve",
    response_model=ResolvedSettingRead,
    dependencies=[Depends(require_permission(permissions.SETTINGS_MANAGE))],
)
def resolve_admin_setting(
    module: str,
    key: SettingKey,
    branch_id: str | None = None,
    tenant_id: str = Depends(require_tenant_id),
    current_user: User = Depends(require_permission(permissions.SETTINGS_MANAGE)),
    session: Session = Depends(get_session),
) -> ResolvedSettingRead:
    branch_id = scoped_branch_id(current_user, branch_id)
    value, source_scope, source_scope_id = resolve_setting(
        session,
        tenant_id=tenant_id,
        module=module,
        key=key,
        branch_id=branch_id,
    )
    return ResolvedSettingRead(
        tenant_id=tenant_id,
        branch_id=branch_id,
        module=module,
        key=key,
        value=value,
        source_scope=source_scope,
        source_scope_id=source_scope_id,
    )


@router.get(
    "/bundle",
    response_model=AdminSettingsBundle,
    dependencies=[Depends(require_permission(permissions.SETTINGS_MANAGE))],
)
def resolve_settings_bundle(
    module: str,
    branch_id: str | None = None,
    tenant_id: str = Depends(require_tenant_id),
    current_user: User = Depends(require_permission(permissions.SETTINGS_MANAGE)),
    session: Session = Depends(get_session),
) -> AdminSettingsBundle:
    branch_id = scoped_branch_id(current_user, branch_id)
    rows = []
    for key in SettingKey:
        value, source_scope, source_scope_id = resolve_setting(
            session,
            tenant_id=tenant_id,
            module=module,
            key=key,
            branch_id=branch_id,
        )
        rows.append(
            ResolvedSettingRead(
                tenant_id=tenant_id,
                branch_id=branch_id,
                module=module,
                key=key,
                value=value,
                source_scope=source_scope,
                source_scope_id=source_scope_id,
            )
        )
    return AdminSettingsBundle(settings=rows)
