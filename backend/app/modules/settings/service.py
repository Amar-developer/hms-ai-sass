import json
from typing import Any

from fastapi import HTTPException, status
from sqlmodel import Session

from app.core.access_control import require_user_branch_access
from app.modules.audit.service import record_audit_event
from app.modules.identity.models import User
from app.modules.settings.models import AdminSetting, SettingKey, SettingScope
from app.modules.settings.repositories import AdminSettingRepository
from app.modules.settings.schemas import (
    AdminSettingRead,
    AdminSettingsBundle,
    AdminSettingUpsert,
    ResolvedSettingRead,
)
from app.modules.tenants.models import now_utc


DEFAULT_SETTING_VALUES: dict[SettingKey, Any] = {
    SettingKey.QUEUE_REQUEUE_AFTER_PATIENTS: 3,
    SettingKey.QUEUE_AUTO_NO_SHOW_AFTER_MISSED_CALLS: 3,
    SettingKey.PAYMENT_METHODS_ENABLED: [
        "cash",
        "credit_card",
        "debit_card",
        "upi",
        "gpay",
        "paytm",
    ],
    SettingKey.INVOICE_PREFIX: "INV",
    SettingKey.INVOICE_LOGO_URL: "",
    SettingKey.NUMBERING_RULES: {
        "prefix": "INV",
        "digits": 5,
        "entities": {
            "user": "USR",
            "patient": "PAT",
            "doctor": "DOC",
            "department": "DEPT",
            "lab_order": "LAB",
            "pharmacy_issue": "PHM",
            "invoice": "INV",
            "ip_admission": "IP",
            "physiotherapy_case": "PHY",
            "home_care_booking": "HC",
            "supplier": "SUP",
        },
    },
    SettingKey.FOLLOW_UP_VALIDITY_DAYS: 7,
    SettingKey.APPOINTMENT_SLOT_INTERVALS_ENABLED: False,
    SettingKey.APPOINTMENT_SLOT_INTERVAL_MINUTES: 5,
    SettingKey.TOKEN_LANGUAGE: "en-IN",
    SettingKey.COMMUNICATION_PROVIDERS_ENABLED: [],
    SettingKey.CATALOG_INTEGRATIONS: {
        "lab_items": {"enabled": False, "provider": "local"},
        "medicine_items": {"enabled": True, "provider": "external_catalog"},
    },
    SettingKey.ACCOUNTS_BANK_DETAILS: {
        "account_name": "",
        "branch_name": "",
        "account_number": "",
        "ifsc": "",
        "upi_id": "",
        "gstin": "",
    },
}


def encode_value(value: Any) -> str:
    return json.dumps(value)


def decode_value(value_json: str) -> Any:
    try:
        return json.loads(value_json)
    except json.JSONDecodeError:
        return None


def validate_scope(
    session: Session, tenant_id: str, scope: SettingScope, scope_id: str | None
) -> str:
    if scope == SettingScope.TENANT:
        return tenant_id
    if not scope_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="scope_id is required for branch settings",
        )
    branch = AdminSettingRepository(session).get_branch(scope_id)
    if not branch or branch.tenant_id != tenant_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid branch scope"
        )
    return scope_id


def upsert_setting(
    session: Session,
    *,
    tenant_id: str,
    scope: SettingScope,
    scope_id: str,
    module: str,
    key: SettingKey,
    value: Any,
    actor_user_id: str | None = None,
) -> AdminSetting:
    existing = AdminSettingRepository(session).find_setting(
        tenant_id=tenant_id,
        scope=scope,
        scope_id=scope_id,
        module=module,
        key=key,
    )
    if existing:
        existing.value_json = encode_value(value)
        existing.updated_by_user_id = actor_user_id
        existing.updated_at = now_utc()
        session.add(existing)
        session.commit()
        session.refresh(existing)
        return existing

    setting = AdminSetting(
        tenant_id=tenant_id,
        scope=scope,
        scope_id=scope_id,
        module=module,
        key=key,
        value_json=encode_value(value),
        created_by_user_id=actor_user_id,
        updated_by_user_id=actor_user_id,
    )
    session.add(setting)
    session.commit()
    session.refresh(setting)
    return setting


def resolve_setting(
    session: Session,
    *,
    tenant_id: str,
    module: str,
    key: SettingKey,
    branch_id: str | None = None,
) -> tuple[Any, SettingScope | None, str | None]:
    repository = AdminSettingRepository(session)
    if branch_id:
        branch_setting = repository.find_setting(
            tenant_id=tenant_id,
            scope=SettingScope.BRANCH,
            scope_id=branch_id,
            module=module,
            key=key,
        )
        if branch_setting:
            return (
                decode_value(branch_setting.value_json),
                branch_setting.scope,
                branch_setting.scope_id,
            )

    tenant_setting = repository.find_setting(
        tenant_id=tenant_id,
        scope=SettingScope.TENANT,
        scope_id=tenant_id,
        module=module,
        key=key,
    )
    if tenant_setting:
        return (
            decode_value(tenant_setting.value_json),
            tenant_setting.scope,
            tenant_setting.scope_id,
        )

    return DEFAULT_SETTING_VALUES.get(key), None, None


def read_setting(setting: AdminSetting) -> AdminSettingRead:
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


def upsert_admin_setting(
    session: Session, *, tenant_id: str, payload: AdminSettingUpsert, actor: User
) -> AdminSettingRead:
    scope_id = validate_scope(session, tenant_id, payload.scope, payload.scope_id)
    if payload.scope.value == "branch":
        require_user_branch_access(actor, scope_id)
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
    return read_setting(setting)


def list_admin_settings(
    session: Session, *, tenant_id: str, module: str | None, actor: User
) -> list[AdminSettingRead]:
    scope_ids = None
    if actor.branch_id and not actor.is_super_admin:
        scope_ids = [tenant_id, actor.branch_id]
    settings = AdminSettingRepository(session).list_settings(
        tenant_id=tenant_id,
        module=module,
        scope_ids=scope_ids,
    )
    return [read_setting(setting) for setting in settings]


def resolve_admin_setting(
    session: Session,
    *,
    tenant_id: str,
    module: str,
    key: SettingKey,
    branch_id: str | None,
) -> ResolvedSettingRead:
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


def resolve_settings_bundle(
    session: Session, *, tenant_id: str, module: str, branch_id: str | None
) -> AdminSettingsBundle:
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
