from sqlmodel import Session, select

from app.modules.settings.models import AdminSetting, SettingKey, SettingScope
from app.modules.settings.service import decode_value, upsert_setting

REPORT_SETTING_KEYS = {
    SettingKey.REPORT_MONTHLY_EMAIL_ENABLED,
    SettingKey.REPORT_MONTHLY_EMAIL_RECIPIENTS,
    SettingKey.REPORT_MONTHLY_EMAIL_CC,
    SettingKey.REPORT_MONTHLY_EMAIL_SEND_DAY,
    SettingKey.REPORT_MONTHLY_EMAIL_FILTERS,
    SettingKey.REPORT_MONTHLY_EMAIL_LAST_SENT_PERIOD,
}


def _list(value: object) -> list[str]:
    if isinstance(value, list):
        return [str(item).strip() for item in value if str(item).strip()]
    if isinstance(value, str):
        return [item.strip() for item in value.split(",") if item.strip()]
    return []


def load_monthly_report_config(session: Session, tenant_id: str) -> dict:
    rows = session.exec(
        select(AdminSetting).where(
            AdminSetting.tenant_id == tenant_id,
            AdminSetting.scope == SettingScope.TENANT,
            AdminSetting.module == "reports",
        )
    ).all()
    values = {
        row.key: decode_value(row.value_json)
        for row in rows
        if row.key in REPORT_SETTING_KEYS
    }
    return {
        "enabled": bool(values.get(SettingKey.REPORT_MONTHLY_EMAIL_ENABLED, False)),
        "recipients": _list(values.get(SettingKey.REPORT_MONTHLY_EMAIL_RECIPIENTS, [])),
        "cc": _list(values.get(SettingKey.REPORT_MONTHLY_EMAIL_CC, [])),
        "send_day": int(values.get(SettingKey.REPORT_MONTHLY_EMAIL_SEND_DAY, 1) or 1),
        "filters": values.get(
            SettingKey.REPORT_MONTHLY_EMAIL_FILTERS,
            {"overall": True, "doctor": True, "department": True, "invoice": True},
        )
        or {},
        "last_sent_period": str(
            values.get(SettingKey.REPORT_MONTHLY_EMAIL_LAST_SENT_PERIOD, "") or ""
        ),
    }


def save_monthly_report_config(
    session: Session,
    *,
    tenant_id: str,
    recipients: list[str],
    cc: list[str],
    enabled: bool,
    send_day: int,
    filters: dict,
    actor_user_id: str | None,
) -> dict:
    send_day = min(max(int(send_day or 1), 1), 28)
    values = [
        (SettingKey.REPORT_MONTHLY_EMAIL_ENABLED, enabled),
        (SettingKey.REPORT_MONTHLY_EMAIL_RECIPIENTS, recipients),
        (SettingKey.REPORT_MONTHLY_EMAIL_CC, cc),
        (SettingKey.REPORT_MONTHLY_EMAIL_SEND_DAY, send_day),
        (SettingKey.REPORT_MONTHLY_EMAIL_FILTERS, filters),
    ]
    for key, value in values:
        upsert_setting(
            session,
            tenant_id=tenant_id,
            scope=SettingScope.TENANT,
            scope_id=tenant_id,
            module="reports",
            key=key,
            value=value,
            actor_user_id=actor_user_id,
        )
    return load_monthly_report_config(session, tenant_id)


def mark_report_period_sent(
    session: Session,
    *,
    tenant_id: str,
    period_key: str,
    actor_user_id: str | None = None,
) -> None:
    upsert_setting(
        session,
        tenant_id=tenant_id,
        scope=SettingScope.TENANT,
        scope_id=tenant_id,
        module="reports",
        key=SettingKey.REPORT_MONTHLY_EMAIL_LAST_SENT_PERIOD,
        value=period_key,
        actor_user_id=actor_user_id,
    )
