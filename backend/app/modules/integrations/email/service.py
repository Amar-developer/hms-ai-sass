"""Per-tenant SMTP configuration.

A tenant that has not enabled its own SMTP falls back to the deployment-wide
settings in the environment, so a single-mailbox install keeps working with no
tenant configuration at all. The password is held in the same encrypted secret
bundle the other integrations use and is never read back to the client.
"""

import json
from dataclasses import dataclass

from sqlmodel import Session, select

from app.core.config import Settings, get_settings
from app.core.credentials import decrypt_credential, encrypt_credential
from app.modules.audit.service import diff_changes, record_audit_event
from app.modules.identity.models import User
from app.modules.integrations.email.schemas import (
    SECRET_FIELDS,
    EmailSettingsRead,
    EmailSettingsUpdate,
)
from app.modules.integrations.models import TenantIntegrationPlugin
from app.modules.integrations.service import decode_config, get_tenant_plugin
from app.modules.tenants.models import Tenant, now_utc


PLUGIN_KEY = "email"

DEFAULT_CONFIG = EmailSettingsUpdate().model_dump(mode="json", exclude=SECRET_FIELDS)


@dataclass(frozen=True)
class EmailRuntimeSettings:
    """Everything the SMTP adapter needs for one tenant's outbound mail."""

    host: str
    port: int
    use_tls: bool
    username: str
    password: str
    from_email: str
    from_name: str
    reply_to: str | None
    uses_platform_smtp: bool


def _settings_from_row(row: TenantIntegrationPlugin | None) -> EmailSettingsUpdate:
    config = {**DEFAULT_CONFIG, **(decode_config(row.config_json) if row else {})}
    if row:
        config["enabled"] = row.enabled
    return EmailSettingsUpdate.model_validate(config)


def _secret_bundle_from_row(row: TenantIntegrationPlugin | None) -> dict[str, str]:
    if not row or not row.secret_ciphertext:
        return {}
    try:
        decoded = json.loads(decrypt_credential(row.secret_ciphertext))
    except json.JSONDecodeError:
        return {}
    return (
        {str(key): str(value) for key, value in decoded.items() if str(value).strip()}
        if isinstance(decoded, dict)
        else {}
    )


def tenant_admin_email(session: Session, tenant_id: str) -> str | None:
    admin = session.exec(
        select(User)
        .where(
            User.tenant_id == tenant_id,
            User.user_type == "tenant_admin",
            User.is_active == True,  # noqa: E712
        )
        .order_by(User.created_at)
    ).first()
    return admin.email if admin and admin.email else None


def _resolve_sender(
    session: Session,
    *,
    tenant_id: str,
    settings: EmailSettingsUpdate,
    app_settings: Settings,
) -> tuple[str, str]:
    """The address and display name mail is actually sent as."""
    tenant = session.get(Tenant, tenant_id)
    name = (
        settings.from_name
        or (tenant.name if tenant else "")
        or (app_settings.smtp_from_name)
    )
    if settings.sender_mode == "custom" and settings.from_email:
        return settings.from_email, name
    if settings.sender_mode == "tenant_admin":
        admin_email = tenant_admin_email(session, tenant_id)
        if admin_email:
            return admin_email, name
    return app_settings.smtp_from_email, name


def _settings_read(
    session: Session,
    *,
    tenant_id: str,
    row: TenantIntegrationPlugin | None,
    settings: EmailSettingsUpdate,
) -> EmailSettingsRead:
    app_settings = get_settings()
    bundle = _secret_bundle_from_row(row)
    from_email, from_name = _resolve_sender(
        session, tenant_id=tenant_id, settings=settings, app_settings=app_settings
    )
    return EmailSettingsRead(
        enabled=bool(row and row.enabled),
        smtp_host=settings.smtp_host,
        smtp_port=settings.smtp_port,
        smtp_use_tls=settings.smtp_use_tls,
        smtp_username=settings.smtp_username,
        has_password=bool(bundle.get("smtp_password")),
        password_last_four=row.secret_last_four if row else None,
        sender_mode=settings.sender_mode,
        from_email=settings.from_email,
        from_name=settings.from_name,
        reply_to=settings.reply_to,
        effective_from_email=from_email,
        effective_from_name=from_name,
        uses_platform_smtp=not (row and row.enabled and settings.smtp_host),
        updated_at=row.updated_at.isoformat() if row else None,
    )


def get_email_settings(session: Session, *, tenant_id: str) -> EmailSettingsRead:
    row = get_tenant_plugin(session, tenant_id, PLUGIN_KEY)
    return _settings_read(
        session, tenant_id=tenant_id, row=row, settings=_settings_from_row(row)
    )


def get_email_settings_model(
    session: Session, *, tenant_id: str
) -> EmailSettingsUpdate:
    return _settings_from_row(get_tenant_plugin(session, tenant_id, PLUGIN_KEY))


def _merge_over_stored(
    stored: EmailSettingsUpdate, payload: EmailSettingsUpdate
) -> EmailSettingsUpdate:
    """The stored document with only the caller's explicitly sent fields applied."""
    sent = payload.model_dump(mode="json", include=payload.model_fields_set)
    if not sent:
        return stored
    merged = stored.model_dump(mode="json")
    merged.update(sent)
    return EmailSettingsUpdate.model_validate(merged)


def update_email_settings(
    session: Session,
    *,
    tenant_id: str,
    payload: EmailSettingsUpdate,
    actor: User,
) -> EmailSettingsRead:
    row = get_tenant_plugin(session, tenant_id, PLUGIN_KEY)
    stored = _settings_from_row(row)
    before = _settings_read(
        session, tenant_id=tenant_id, row=row, settings=stored
    ).model_dump()
    payload = _merge_over_stored(stored, payload)
    existing_bundle = _secret_bundle_from_row(row)
    next_bundle = {
        **existing_bundle,
        **{
            field: value
            for field in SECRET_FIELDS
            if (value := getattr(payload, field)) is not None
        },
    }
    if not row:
        row = TenantIntegrationPlugin(
            tenant_id=tenant_id,
            plugin_key=PLUGIN_KEY,
            created_by_user_id=actor.id,
        )
    row.enabled = payload.enabled
    row.config_json = json.dumps(payload.model_dump(mode="json", exclude=SECRET_FIELDS))
    password_changed = payload.smtp_password is not None
    if next_bundle:
        row.secret_ciphertext = encrypt_credential(json.dumps(next_bundle))
        fingerprint = next_bundle.get("smtp_password") or ""
        row.secret_last_four = fingerprint[-4:] if fingerprint else None
    row.updated_by_user_id = actor.id
    row.updated_at = now_utc()
    session.add(row)
    session.flush()

    after = _settings_read(
        session, tenant_id=tenant_id, row=row, settings=_settings_from_row(row)
    ).model_dump()
    for values in (before, after):
        values.pop("password_last_four", None)
        values.pop("updated_at", None)
    record_audit_event(
        session,
        tenant_id=tenant_id,
        action="communication.email_settings_updated",
        resource_type="tenant_integration_plugin",
        resource_id=row.id,
        actor_user_id=actor.id,
        purpose="integration_configuration",
        metadata_json=json.dumps(
            {
                "enabled": payload.enabled,
                "sender_mode": payload.sender_mode,
                "password_changed": password_changed,
            }
        ),
        changes=diff_changes(before, after),
        commit=False,
    )
    session.commit()
    session.refresh(row)
    return get_email_settings(session, tenant_id=tenant_id)


def get_email_runtime_settings(
    session: Session, *, tenant_id: str
) -> EmailRuntimeSettings:
    """The SMTP identity for this tenant, falling back to the platform mailbox.

    A tenant that has not configured its own server still sends - through the
    deployment SMTP host - but as its own admin address when sender_mode says
    so, which is what makes per-tenant sending work without per-tenant servers.
    """
    app_settings = get_settings()
    row = get_tenant_plugin(session, tenant_id, PLUGIN_KEY)
    settings = _settings_from_row(row)
    bundle = _secret_bundle_from_row(row)
    from_email, from_name = _resolve_sender(
        session, tenant_id=tenant_id, settings=settings, app_settings=app_settings
    )
    tenant_smtp = bool(row and row.enabled and settings.smtp_host)
    return EmailRuntimeSettings(
        host=settings.smtp_host if tenant_smtp else (app_settings.smtp_host or ""),
        port=settings.smtp_port if tenant_smtp else app_settings.smtp_port,
        use_tls=settings.smtp_use_tls if tenant_smtp else app_settings.smtp_use_tls,
        username=(
            settings.smtp_username
            if tenant_smtp
            else (app_settings.smtp_username or "")
        ),
        password=(
            bundle.get("smtp_password", "")
            if tenant_smtp
            else (app_settings.smtp_password or "")
        ),
        from_email=from_email,
        from_name=from_name,
        reply_to=settings.reply_to or None,
        uses_platform_smtp=not tenant_smtp,
    )
