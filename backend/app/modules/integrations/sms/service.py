import json
from dataclasses import dataclass

from fastapi import HTTPException, status
from sqlmodel import Session

from app.core.credentials import decrypt_credential, encrypt_credential
from app.infrastructure.integrations.ports.sms import (
    SmsGatewayCredentials,
    SmsGatewayMode,
)
from app.modules.audit.service import diff_changes, record_audit_event
from app.modules.identity.models import User
from app.modules.integrations.models import TenantIntegrationPlugin
from app.modules.integrations.service import decode_config, get_tenant_plugin
from app.modules.integrations.sms.readiness import evaluate_sms_readiness
from app.modules.integrations.sms.schemas import (
    SmsFlowReadiness,
    SmsReadinessRead,
    SmsReadinessUpdate,
    SmsSettingsRead,
    SmsSettingsUpdate,
)
from app.modules.subscriptions.service import enforce_module_enabled
from app.modules.tenants.models import now_utc


PLUGIN_KEY = "sms"

DEFAULT_SMS_TEMPLATES = [
    SmsFlowReadiness(
        id="sms_tpl_patient_registration",
        flow_key="patient_registered_patient",
        name="Patient registration",
        registered_body=(
            "Dear {#var#}, your patient registration at MedizinHub has been "
            "successfully completed. Your Patient ID is {#var#}. Thank you."
        ),
        variable_keys=["patient_name", "patient_number"],
    ),
    SmsFlowReadiness(
        id="sms_tpl_appointment_booking",
        flow_key="appointment_booked_patient",
        name="Appointment booking",
        registered_body=(
            "Dear {#var#}, your appointment with Dr. {#var#} for {#var#} at "
            "MedizinHub on {#var#} at {#var#} has been successfully booked. "
            "Appointment ID: {#var#}. Thank you."
        ),
        variable_keys=[
            "patient_name",
            "doctor_name",
            "consultation_type",
            "appointment_date",
            "appointment_time",
            "appointment_id",
        ],
    ),
]

DEFAULT_CONFIG = SmsSettingsUpdate(flows=DEFAULT_SMS_TEMPLATES).model_dump(
    exclude={"api_key", "api_token", "username", "password", "webhook_secret"}
)
SECRET_FIELDS = {"api_key", "api_token", "username", "password", "webhook_secret"}


@dataclass(frozen=True)
class SmsGatewayRuntimeSettings:
    provider: str
    enabled: bool
    mode: SmsGatewayMode
    api_url: str | None
    credentials: SmsGatewayCredentials
    webhook_secret: str | None
    timeout_seconds: int
    max_attempts: int
    default_country_code: str
    max_segments_per_message: int


def _enforce_entitlement(session: Session, tenant_id: str) -> None:
    enforce_module_enabled(session, tenant_id, PLUGIN_KEY)


def _settings_from_row(row: TenantIntegrationPlugin | None) -> SmsSettingsUpdate:
    config = {**DEFAULT_CONFIG, **(decode_config(row.config_json) if row else {})}
    if row:
        config["enabled"] = row.enabled
    return SmsSettingsUpdate.model_validate(config)


def _secret_bundle_from_row(row: TenantIntegrationPlugin | None) -> dict[str, str]:
    if not row or not row.secret_ciphertext:
        return {}
    raw = decrypt_credential(row.secret_ciphertext)
    try:
        decoded = json.loads(raw)
    except json.JSONDecodeError:
        return {"api_key": raw}
    return (
        {str(key): str(value) for key, value in decoded.items() if str(value).strip()}
        if isinstance(decoded, dict)
        else {}
    )


def _credential_complete(
    bundle: dict[str, str], mode: str, *, allow_unknown: bool = True
) -> bool:
    if mode == "rest":
        return bool(bundle.get("api_key") and bundle.get("api_token"))
    if mode == "http_legacy":
        return bool(bundle.get("username") and bundle.get("password"))
    return allow_unknown and any(bundle.get(key) for key in SECRET_FIELDS)


def _merge_over_stored(
    stored: SmsSettingsUpdate, payload: SmsSettingsUpdate
) -> SmsSettingsUpdate:
    """The stored document with only the caller's explicitly sent fields applied."""
    sent = payload.model_dump(mode="json", include=payload.model_fields_set)
    if not sent:
        return stored
    merged = stored.model_dump(mode="json")
    merged.update(sent)
    return SmsSettingsUpdate.model_validate(merged)


def _settings_read(
    row: TenantIntegrationPlugin | None, settings: SmsSettingsUpdate
) -> SmsSettingsRead:
    bundle = _secret_bundle_from_row(row)
    readiness = evaluate_sms_readiness(
        settings, has_webhook_secret=bool(bundle.get("webhook_secret"))
    )
    readiness_payload = readiness.model_dump()
    readiness_payload.pop("updated_at", None)
    return SmsSettingsRead(
        **readiness_payload,
        enabled=bool(row and row.enabled),
        api_url=str(settings.api_url or ""),
        has_credentials=_credential_complete(bundle, settings.sms_country_api_mode),
        credential_last_four=row.secret_last_four if row else None,
        has_webhook_secret=bool(bundle.get("webhook_secret")),
        default_country_code=settings.default_country_code,
        timeout_seconds=settings.timeout_seconds,
        max_attempts=settings.max_attempts,
        max_segments_per_message=settings.max_segments_per_message,
        daily_message_limit=settings.daily_message_limit,
        monthly_segment_limit=settings.monthly_segment_limit,
        patient_notifications_enabled=settings.patient_notifications_enabled,
        staff_notifications_enabled=settings.staff_notifications_enabled,
        default_language=settings.default_language,
        cost_per_segment_paise=settings.cost_per_segment_paise,
        updated_at=row.updated_at.isoformat() if row else None,
    )


def get_sms_readiness(session: Session, *, tenant_id: str) -> SmsReadinessRead:
    _enforce_entitlement(session, tenant_id)
    row = get_tenant_plugin(session, tenant_id, PLUGIN_KEY)
    result = evaluate_sms_readiness(
        _settings_from_row(row),
        has_webhook_secret=bool(_secret_bundle_from_row(row).get("webhook_secret")),
    )
    result.updated_at = row.updated_at.isoformat() if row else None
    return result


def get_sms_settings(session: Session, *, tenant_id: str) -> SmsSettingsRead:
    _enforce_entitlement(session, tenant_id)
    row = get_tenant_plugin(session, tenant_id, PLUGIN_KEY)
    return _settings_read(row, _settings_from_row(row))


def update_sms_readiness(
    session: Session,
    *,
    tenant_id: str,
    payload: SmsReadinessUpdate,
    actor: User,
) -> SmsReadinessRead:
    row = get_tenant_plugin(session, tenant_id, PLUGIN_KEY)
    current = _settings_from_row(row).model_dump(mode="json")
    # Readiness is a focused update surface. Merge its fields into the saved
    # integration document so changing a compliance check cannot reset API,
    # delivery, recipient, language, or usage-limit settings to model defaults.
    current.update(payload.model_dump(mode="json"))
    result = update_sms_settings(
        session,
        tenant_id=tenant_id,
        payload=SmsSettingsUpdate.model_validate(current),
        actor=actor,
        audit_action="communication.sms_readiness_updated",
        audit_purpose="sms_readiness",
    )
    return SmsReadinessRead.model_validate(result.model_dump())


def update_sms_settings(
    session: Session,
    *,
    tenant_id: str,
    payload: SmsSettingsUpdate,
    actor: User,
    audit_action: str = "communication.sms_settings_updated",
    audit_purpose: str = "integration_configuration",
) -> SmsSettingsRead:
    _enforce_entitlement(session, tenant_id)
    row = get_tenant_plugin(session, tenant_id, PLUGIN_KEY)
    stored = _settings_from_row(row)
    before = _settings_read(row, stored).model_dump()
    # Fields the caller did not send keep their stored value rather than falling
    # back to model defaults. Secrets already merged this way; without the same
    # rule for the rest, a PUT that omits `flows` silently deleted every DLT
    # template the tenant had registered.
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
    if payload.enabled and not _credential_complete(
        next_bundle, payload.sms_country_api_mode, allow_unknown=False
    ):
        mode_label = (
            "REST auth key and token"
            if payload.sms_country_api_mode == "rest"
            else "legacy username and password"
        )
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"SMSCountry {mode_label} are required when SMS is enabled",
        )

    if not row:
        row = TenantIntegrationPlugin(
            tenant_id=tenant_id,
            plugin_key=PLUGIN_KEY,
            created_by_user_id=actor.id,
        )
    row.enabled = payload.enabled
    row.config_json = json.dumps(payload.model_dump(mode="json", exclude=SECRET_FIELDS))
    credential_changed = any(
        getattr(payload, field) is not None for field in SECRET_FIELDS
    )
    if next_bundle:
        row.secret_ciphertext = encrypt_credential(json.dumps(next_bundle))
        fingerprint = (
            next_bundle.get("api_key")
            or next_bundle.get("username")
            or next_bundle.get("api_token")
            or next_bundle.get("password")
            or next_bundle.get("webhook_secret")
            or ""
        )
        row.secret_last_four = fingerprint[-4:] if fingerprint else None
    row.updated_by_user_id = actor.id
    row.updated_at = now_utc()
    session.add(row)
    session.flush()

    after = _settings_read(row, _settings_from_row(row)).model_dump()
    for values in (before, after):
        values.pop("credential_last_four", None)
        values.pop("updated_at", None)
        values.pop("checks", None)
    record_audit_event(
        session,
        tenant_id=tenant_id,
        action=audit_action,
        resource_type="tenant_integration_plugin",
        resource_id=row.id,
        actor_user_id=actor.id,
        purpose=audit_purpose,
        metadata_json=json.dumps(
            {
                "provider": payload.provider,
                "sms_country_api_mode": payload.sms_country_api_mode,
                "enabled_flow_count": sum(flow.enabled for flow in payload.flows),
                "readiness_status": evaluate_sms_readiness(payload).status,
                "credential_changed": credential_changed,
            }
        ),
        changes=diff_changes(before, after),
        commit=False,
    )
    session.commit()
    session.refresh(row)
    return get_sms_settings(session, tenant_id=tenant_id)


def get_sms_gateway_runtime_settings(
    session: Session, *, tenant_id: str
) -> SmsGatewayRuntimeSettings:
    _enforce_entitlement(session, tenant_id)
    row = get_tenant_plugin(session, tenant_id, PLUGIN_KEY)
    settings = _settings_from_row(row)
    bundle = _secret_bundle_from_row(row)
    mode = settings.sms_country_api_mode
    if mode == "unknown":
        raise ValueError("SMSCountry API mode is not configured")
    return SmsGatewayRuntimeSettings(
        provider=settings.provider,
        enabled=bool(row and row.enabled),
        mode=mode,
        api_url=str(settings.api_url) if settings.api_url else None,
        credentials=SmsGatewayCredentials(
            auth_key=bundle.get("api_key"),
            auth_token=bundle.get("api_token"),
            username=bundle.get("username"),
            password=bundle.get("password"),
        ),
        webhook_secret=bundle.get("webhook_secret"),
        timeout_seconds=settings.timeout_seconds,
        max_attempts=settings.max_attempts,
        default_country_code=settings.default_country_code,
        max_segments_per_message=settings.max_segments_per_message,
    )


def get_sms_settings_model(session: Session, *, tenant_id: str) -> SmsSettingsUpdate:
    """The validated tenant SMS configuration, without the read-only wrapper."""
    _enforce_entitlement(session, tenant_id)
    return _settings_from_row(get_tenant_plugin(session, tenant_id, PLUGIN_KEY))


# SMS integration domain package.
