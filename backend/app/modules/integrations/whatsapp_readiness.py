import json
from urllib.parse import urlparse

from sqlmodel import Session, select

from app.core.credentials import decrypt_credential
from app.modules.audit.models import AuditEvent
from app.modules.integrations.service import get_tenant_plugin
from app.modules.integrations.whatsapp_schemas import (
    WhatsAppIntegrationRead,
    WhatsAppReadinessCheck,
    WhatsAppReadinessRead,
    audience_enabled_for,
)


def _check(key: str, label: str, status: str, message: str) -> WhatsAppReadinessCheck:
    return WhatsAppReadinessCheck(key=key, label=label, status=status, message=message)


def evaluate_whatsapp_readiness(
    settings: WhatsAppIntegrationRead,
    *,
    successful_test_recorded: bool = False,
    credential_readable: bool | None = None,
) -> WhatsAppReadinessRead:
    checks: list[WhatsAppReadinessCheck] = []
    checks.append(
        _check(
            "integration_enabled",
            "Integration enabled",
            "pass" if settings.enabled else "block",
            "The tenant integration is enabled."
            if settings.enabled
            else "Enable and save the tenant integration.",
        )
    )
    # Stored-and-unreadable is its own state, and the worst one: the ciphertext
    # is present so this used to report "saved" and pass, while every send
    # failed hours later with "Stored credential could not be decrypted". It
    # happens whenever MEDIZINHUB_CREDENTIAL_ENCRYPTION_KEY changes — the key
    # is a SHA-256 of that string, so any edit to it, or restoring a database
    # from an environment that used a different one, silently orphans every
    # credential already stored.
    if not settings.has_api_key:
        credential_status = "block"
        credential_message = "Save an API credential before rollout."
    elif credential_readable is False:
        credential_status = "block"
        credential_message = (
            "The saved credential cannot be decrypted with this environment's"
            " encryption key. Re-enter and save the API key."
        )
    else:
        credential_status = "pass"
        credential_message = "The encrypted API credential is saved and readable."
    checks.append(
        _check(
            "credential_saved",
            "Credential saved",
            credential_status,
            credential_message,
        )
    )
    api = urlparse(settings.api_url)
    valid_api = api.scheme == "https" and bool(api.hostname)
    checks.append(
        _check(
            "secure_api_url",
            "Secure API URL",
            "pass" if valid_api else "block",
            "The connection uses a valid HTTPS URL."
            if valid_api
            else "Configure a valid HTTPS API URL.",
        )
    )

    active_flows: list[str] = []
    missing_templates: list[str] = []
    for flow_key, enabled in settings.flows.model_dump().items():
        if not enabled:
            continue
        if not audience_enabled_for(
            flow_key,
            patient_enabled=settings.patient_notifications_enabled,
            doctor_enabled=settings.doctor_notifications_enabled,
        ):
            continue
        active_flows.append(flow_key)
        if not getattr(settings.templates, flow_key, "").strip():
            missing_templates.append(flow_key)
    checks.append(
        _check(
            "active_flows",
            "Notification flows",
            "pass" if active_flows else "block",
            f"{len(active_flows)} notification flow(s) are enabled."
            if active_flows
            else "Enable at least one patient or doctor notification flow.",
        )
    )
    checks.append(
        _check(
            "approved_templates",
            "Approved identifiers",
            "pass" if active_flows and not missing_templates else "block",
            "Every enabled flow has a tenant-default identifier."
            if active_flows and not missing_templates
            else "Add identifiers for every enabled notification flow.",
        )
    )

    invoice_enabled = (
        settings.patient_notifications_enabled and settings.flows.invoice_paid_patient
    )
    receipt = urlparse(settings.public_media_base_url)
    receipt_ready = not invoice_enabled or (
        receipt.scheme == "https" and bool(receipt.hostname)
    )
    checks.append(
        _check(
            "invoice_receipts",
            "Invoice receipt delivery",
            "pass" if receipt_ready else "block",
            "Invoice receipt delivery is configured."
            if invoice_enabled and receipt_ready
            else "Invoice receipt delivery is not enabled."
            if not invoice_enabled
            else "Configure the public HTTPS receipt base URL.",
        )
    )

    usage = settings.usage
    allowance_ready = bool(
        usage and usage.monthly_limit > 0 and not usage.limit_reached
    )
    checks.append(
        _check(
            "subscription_allowance",
            "Subscription allowance",
            "pass" if allowance_ready else "block",
            f"{usage.remaining} monthly notifications remain."
            if allowance_ready and usage
            else "The plan has no remaining monthly notification allowance.",
        )
    )

    health = settings.health
    health_status = (
        "block"
        if health and health.status == "critical"
        else "warning"
        if health and health.status == "warning"
        else "pass"
    )
    checks.append(
        _check(
            "delivery_health",
            "Delivery health",
            health_status,
            "The application delivery queue is healthy."
            if health_status == "pass"
            else "Review the delivery health warnings before wider rollout."
            if health_status == "warning"
            else "Resolve critical delivery queue issues before rollout.",
        )
    )

    delivery_verified = bool(
        successful_test_recorded or (health and health.last_sent_at)
    )
    checks.append(
        _check(
            "successful_delivery",
            "Successful delivery",
            "pass" if delivery_verified else "warning",
            "A successful test or automatic delivery has been recorded."
            if delivery_verified
            else "Send one test message before rolling out to all recipients.",
        )
    )

    blockers = sum(check.status == "block" for check in checks)
    warnings = sum(check.status == "warning" for check in checks)
    return WhatsAppReadinessRead(
        status="not_ready" if blockers else "attention" if warnings else "ready",
        passed=sum(check.status == "pass" for check in checks),
        warnings=warnings,
        blockers=blockers,
        checks=checks,
    )


def read_whatsapp_readiness(
    session: Session, *, tenant_id: str, settings: WhatsAppIntegrationRead
) -> WhatsAppReadinessRead:
    recent_tests = session.exec(
        select(AuditEvent)
        .where(
            AuditEvent.tenant_id == tenant_id,
            AuditEvent.action == "communication.whatsapp_test_sent",
        )
        .order_by(AuditEvent.created_at.desc())
        .limit(20)
    ).all()
    successful_test_recorded = False
    for event in recent_tests:
        try:
            if json.loads(event.metadata_json or "{}").get("success") is True:
                successful_test_recorded = True
                break
        except (TypeError, json.JSONDecodeError):
            continue
    return evaluate_whatsapp_readiness(
        settings,
        successful_test_recorded=successful_test_recorded,
        credential_readable=_credential_readable(session, tenant_id),
    )


def _credential_readable(session: Session, tenant_id: str) -> bool | None:
    """Can the stored credential still be decrypted here? None if none saved."""
    row = get_tenant_plugin(session, tenant_id, "whatsapp")
    if not row or not row.secret_ciphertext:
        return None
    try:
        decrypt_credential(row.secret_ciphertext)
    except ValueError:
        return False
    return True
