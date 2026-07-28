import json
from datetime import timedelta

from fastapi import HTTPException, status
from sqlmodel import Session, select

from app.core.credentials import decrypt_credential, encrypt_credential
from app.modules.audit.models import AuditEvent
from app.modules.audit.service import diff_changes, record_audit_event
from app.modules.identity.models import User
from app.modules.integrations.models import TenantIntegrationPlugin
from app.modules.integrations.service import decode_config, get_tenant_plugin
from app.modules.integrations.whatsapp_schemas import (
    WhatsAppFlowSettings,
    WhatsAppIntegrationRead,
    WhatsAppIntegrationUpdate,
    WhatsAppTestRead,
    WhatsAppTestRequest,
    WhatsAppTemplateSettings,
)
from app.modules.integrations.whatsapp_gateway import (
    WhatsAppGateway,
    normalize_whatsapp_number,
)
from app.modules.integrations.whatsapp_templates import resolve_template_identifier
from app.modules.integrations.whatsapp_usage import read_whatsapp_usage
from app.modules.integrations.whatsapp_health import read_whatsapp_health
from app.modules.integrations.whatsapp_readiness import read_whatsapp_readiness
from app.modules.subscriptions.service import enforce_module_enabled
from app.modules.tenants.models import now_utc


PLUGIN_KEY = "whatsapp"
DEFAULT_CONFIG = {
    "api_url": "",
    "public_media_base_url": "",
    "appointment_view_url": "",
    "default_country_code": "+91",
    "timeout_seconds": 15,
    "max_attempts": 5,
    "patient_notifications_enabled": True,
    "doctor_notifications_enabled": True,
    "appointment_reminder_24h_enabled": False,
    "appointment_reminder_2h_enabled": False,
    "default_language": "en",
    "templates": WhatsAppTemplateSettings().model_dump(),
    "localized_templates": {},
    "flows": WhatsAppFlowSettings().model_dump(),
    "custom_templates": [],
}

TEST_RATE_LIMIT_PER_MINUTE = 5


def _enforce_entitlement(session: Session, tenant_id: str) -> None:
    # Passing no user intentionally enforces the active plan for tenant and
    # platform administrators too. Configuration cannot bypass subscription.
    enforce_module_enabled(session, tenant_id, PLUGIN_KEY)


def _masked_secret(last_four: str | None) -> str | None:
    return f"••••••••{last_four}" if last_four else None


def _read(row: TenantIntegrationPlugin | None) -> WhatsAppIntegrationRead:
    config = {**DEFAULT_CONFIG, **(decode_config(row.config_json) if row else {})}
    return WhatsAppIntegrationRead(
        enabled=bool(row and row.enabled),
        api_url=str(config.get("api_url") or ""),
        public_media_base_url=str(config.get("public_media_base_url") or ""),
        appointment_view_url=str(config.get("appointment_view_url") or ""),
        api_key_masked=_masked_secret(row.secret_last_four if row else None),
        has_api_key=bool(row and row.secret_ciphertext),
        default_country_code=str(config.get("default_country_code") or "+91"),
        timeout_seconds=int(config.get("timeout_seconds") or 15),
        max_attempts=int(config.get("max_attempts") or 5),
        patient_notifications_enabled=bool(
            config.get("patient_notifications_enabled", True)
        ),
        doctor_notifications_enabled=bool(
            config.get("doctor_notifications_enabled", True)
        ),
        appointment_reminder_24h_enabled=bool(
            config.get("appointment_reminder_24h_enabled", False)
        ),
        appointment_reminder_2h_enabled=bool(
            config.get("appointment_reminder_2h_enabled", False)
        ),
        default_language=str(config.get("default_language") or "en"),
        templates=WhatsAppTemplateSettings.model_validate(
            config.get("templates") or {}
        ),
        localized_templates=config.get("localized_templates") or {},
        flows=WhatsAppFlowSettings.model_validate(config.get("flows") or {}),
        custom_templates=config.get("custom_templates") or [],
        updated_at=row.updated_at.isoformat() if row else None,
    )


def get_whatsapp_integration(
    session: Session, *, tenant_id: str
) -> WhatsAppIntegrationRead:
    _enforce_entitlement(session, tenant_id)
    result = _read(get_tenant_plugin(session, tenant_id, PLUGIN_KEY))
    result.usage = read_whatsapp_usage(session, tenant_id=tenant_id)
    result.health = read_whatsapp_health(session, tenant_id=tenant_id)
    result.readiness = read_whatsapp_readiness(
        session, tenant_id=tenant_id, settings=result
    )
    return result


def update_whatsapp_integration(
    session: Session,
    *,
    tenant_id: str,
    payload: WhatsAppIntegrationUpdate,
    actor: User,
) -> WhatsAppIntegrationRead:
    _enforce_entitlement(session, tenant_id)
    row = get_tenant_plugin(session, tenant_id, PLUGIN_KEY)
    has_existing_secret = bool(row and row.secret_ciphertext)
    if payload.enabled and not payload.api_key and not has_existing_secret:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="API key is required when the integration is enabled",
        )

    config = payload.model_dump(mode="json", exclude={"api_key", "enabled"})
    before = _read(row).model_dump()
    credential_changed = bool(payload.api_key)

    if not row:
        row = TenantIntegrationPlugin(
            tenant_id=tenant_id,
            plugin_key=PLUGIN_KEY,
            created_by_user_id=actor.id,
        )
    row.enabled = payload.enabled
    row.config_json = json.dumps(config)
    if payload.api_key:
        row.secret_ciphertext = encrypt_credential(payload.api_key)
        row.secret_last_four = payload.api_key[-4:]
    row.updated_by_user_id = actor.id
    row.updated_at = now_utc()
    session.add(row)
    session.flush()

    after = _read(row).model_dump()
    # Secret fields are represented only by booleans/masks and are never
    # included in audit diffs or metadata.
    for values in (before, after):
        values.pop("api_key_masked", None)
        values.pop("updated_at", None)
    record_audit_event(
        session,
        tenant_id=tenant_id,
        actor_user_id=actor.id,
        action="communication.whatsapp_settings_updated",
        resource_type="tenant_integration_plugin",
        resource_id=row.id,
        purpose="integration_configuration",
        metadata_json=json.dumps({"credential_changed": credential_changed}),
        changes=diff_changes(before, after),
        commit=False,
    )
    session.commit()
    session.refresh(row)
    result = _read(row)
    result.usage = read_whatsapp_usage(session, tenant_id=tenant_id)
    result.health = read_whatsapp_health(session, tenant_id=tenant_id)
    result.readiness = read_whatsapp_readiness(
        session, tenant_id=tenant_id, settings=result
    )
    return result


def _audience_enabled(config: dict, flow_key: str) -> bool:
    if flow_key in {"appointment_booked_doctor", "appointment_cancelled_doctor"}:
        return bool(config.get("doctor_notifications_enabled", True))
    return bool(config.get("patient_notifications_enabled", True))


def _enforce_test_rate_limit(session: Session, tenant_id: str, actor_id: str) -> None:
    cutoff = now_utc() - timedelta(minutes=1)
    recent = session.exec(
        select(AuditEvent).where(
            AuditEvent.tenant_id == tenant_id,
            AuditEvent.actor_user_id == actor_id,
            AuditEvent.action == "communication.whatsapp_test_sent",
            AuditEvent.created_at >= cutoff,
        )
    ).all()
    if len(recent) >= TEST_RATE_LIMIT_PER_MINUTE:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many test messages. Please wait one minute and try again.",
        )


def test_whatsapp_integration(
    session: Session,
    *,
    tenant_id: str,
    payload: WhatsAppTestRequest,
    actor: User,
    gateway: WhatsAppGateway | None = None,
) -> WhatsAppTestRead:
    _enforce_entitlement(session, tenant_id)
    row = get_tenant_plugin(session, tenant_id, PLUGIN_KEY)
    if not row or not row.enabled:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Enable and save the integration before sending a test message.",
        )
    config = {**DEFAULT_CONFIG, **decode_config(row.config_json)}
    flow_key = payload.flow_key
    flows = WhatsAppFlowSettings.model_validate(config.get("flows") or {})
    if not getattr(flows, flow_key) or not _audience_enabled(config, flow_key):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="The selected notification flow is disabled.",
        )
    campaign_name, resolved_language = resolve_template_identifier(
        config,
        flow_key=flow_key,
        preferred_language=payload.language,
    )
    if not campaign_name:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="The selected notification flow has no template identifier.",
        )
    if not row.secret_ciphertext:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Save an API key before sending a test message.",
        )
    _enforce_test_rate_limit(session, tenant_id, actor.id)
    try:
        api_key = decrypt_credential(row.secret_ciphertext)
        destination = normalize_whatsapp_number(
            payload.mobile, str(config.get("default_country_code") or "+91")
        )
        result = (gateway or WhatsAppGateway()).send_template(
            api_url=str(config.get("api_url") or ""),
            api_key=api_key,
            campaign_name=campaign_name,
            destination=destination,
            recipient_name=payload.recipient_name,
            template_parameters=payload.template_parameters,
            timeout_seconds=int(config.get("timeout_seconds") or 15),
            media_url=str(payload.media_url) if payload.media_url else None,
            media_filename=payload.media_filename,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)
        ) from exc

    record_audit_event(
        session,
        tenant_id=tenant_id,
        actor_user_id=actor.id,
        action="communication.whatsapp_test_sent",
        resource_type="tenant_integration_plugin",
        resource_id=row.id,
        purpose="integration_testing",
        metadata_json=json.dumps(
            {
                "flow_key": flow_key,
                "language": resolved_language,
                "destination_masked": f"••••{destination[-4:]}",
                "success": result.success,
                "status": result.status,
                "status_code": result.status_code,
            }
        ),
    )
    return WhatsAppTestRead(
        success=result.success,
        status=result.status,
        message=result.message,
        external_message_id=result.external_message_id,
    )
