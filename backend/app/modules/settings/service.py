import json
from typing import Any

from fastapi import HTTPException, status
from sqlmodel import Session, select

from app.modules.settings.models import AdminSetting, SettingKey, SettingScope
from app.modules.tenants.models import Branch, now_utc


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
        "medicine_items": {"enabled": False, "provider": "local"},
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
    branch = session.get(Branch, scope_id)
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
    existing = session.exec(
        select(AdminSetting).where(
            AdminSetting.tenant_id == tenant_id,
            AdminSetting.scope == scope,
            AdminSetting.scope_id == scope_id,
            AdminSetting.module == module,
            AdminSetting.key == key,
        )
    ).first()
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
    if branch_id:
        branch_setting = session.exec(
            select(AdminSetting).where(
                AdminSetting.tenant_id == tenant_id,
                AdminSetting.scope == SettingScope.BRANCH,
                AdminSetting.scope_id == branch_id,
                AdminSetting.module == module,
                AdminSetting.key == key,
            )
        ).first()
        if branch_setting:
            return (
                decode_value(branch_setting.value_json),
                branch_setting.scope,
                branch_setting.scope_id,
            )

    tenant_setting = session.exec(
        select(AdminSetting).where(
            AdminSetting.tenant_id == tenant_id,
            AdminSetting.scope == SettingScope.TENANT,
            AdminSetting.scope_id == tenant_id,
            AdminSetting.module == module,
            AdminSetting.key == key,
        )
    ).first()
    if tenant_setting:
        return (
            decode_value(tenant_setting.value_json),
            tenant_setting.scope,
            tenant_setting.scope_id,
        )

    return DEFAULT_SETTING_VALUES.get(key), None, None
