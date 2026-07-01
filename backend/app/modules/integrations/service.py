import json
from typing import Any

from sqlmodel import Session, select

from app.modules.integrations.models import TenantIntegrationPlugin
from app.modules.tenants.models import now_utc


def integration_plugin_registry() -> list[dict[str, Any]]:
    return []


def get_plugin_definition(plugin_key: str) -> dict[str, Any] | None:
    return next(
        (
            plugin
            for plugin in integration_plugin_registry()
            if plugin["key"] == plugin_key
        ),
        None,
    )


def decode_config(value_json: str) -> dict[str, Any]:
    try:
        value = json.loads(value_json or "{}")
    except json.JSONDecodeError:
        return {}
    return value if isinstance(value, dict) else {}


def encode_config(value: dict[str, Any] | None) -> str:
    return json.dumps(value or {})


def get_tenant_plugin(
    session: Session, tenant_id: str, plugin_key: str
) -> TenantIntegrationPlugin | None:
    return session.exec(
        select(TenantIntegrationPlugin).where(
            TenantIntegrationPlugin.tenant_id == tenant_id,
            TenantIntegrationPlugin.plugin_key == plugin_key,
        )
    ).first()


def is_tenant_plugin_enabled(session: Session, tenant_id: str, plugin_key: str) -> bool:
    plugin = get_plugin_definition(plugin_key)
    if not plugin or not plugin.get("configured"):
        return False
    row = get_tenant_plugin(session, tenant_id, plugin_key)
    return bool(row and row.enabled)


def upsert_tenant_plugin(
    session: Session,
    *,
    tenant_id: str,
    plugin_key: str,
    enabled: bool,
    config: dict[str, Any] | None = None,
    actor_user_id: str | None = None,
) -> TenantIntegrationPlugin:
    row = get_tenant_plugin(session, tenant_id, plugin_key)
    if row:
        row.enabled = enabled
        row.config_json = encode_config(config)
        row.updated_by_user_id = actor_user_id
        row.updated_at = now_utc()
        session.add(row)
        session.commit()
        session.refresh(row)
        return row
    row = TenantIntegrationPlugin(
        tenant_id=tenant_id,
        plugin_key=plugin_key,
        enabled=enabled,
        config_json=encode_config(config),
        created_by_user_id=actor_user_id,
        updated_by_user_id=actor_user_id,
    )
    session.add(row)
    session.commit()
    session.refresh(row)
    return row
