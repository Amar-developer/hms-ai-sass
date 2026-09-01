"""Administrator-triggered email test send.

Runs the same resolve-and-send path the delivery worker uses, so a passing test
proves the tenant's SMTP host, credentials and sender address are usable rather
than only that the form saved.
"""

import logging

from fastapi import HTTPException, status
from sqlmodel import Session

from app.infrastructure.integrations.factories import get_email_sender
from app.infrastructure.integrations.ports.email import EmailMessageRequest
from app.modules.audit.service import record_audit_event
from app.modules.identity.models import User
from app.modules.integrations.email.schemas import EmailTestRead, EmailTestRequest
from app.modules.integrations.email.service import get_email_runtime_settings


logger = logging.getLogger("medizinhub.email")

IMPLICIT_TLS_PORT = 465
SUBMISSION_PORT = 587


def _diagnose(exc: Exception, *, host: str, port: int) -> str:
    """Turn an SMTP failure into something the operator can act on.

    smtplib's own wording names the symptom, not the cause: a TLS mismatch,
    a bad password and a blocked port can all surface as the same terse line.
    """
    reason = str(exc).strip() or exc.__class__.__name__
    lowered = reason.lower()
    if "unexpectedly closed" in lowered or "not connected" in lowered:
        if port not in {IMPLICIT_TLS_PORT, SUBMISSION_PORT}:
            return (
                f"{reason}. The server closed the connection during the "
                f"handshake. Port {port} is unusual - try 587 with TLS on, or "
                f"465 for implicit TLS."
            )
        return (
            f"{reason}. The server closed the connection during the handshake, "
            f"which usually means the TLS setting does not match the port: use "
            f"465 for implicit TLS, or 587 with TLS enabled."
        )
    if "wrong version number" in lowered or "record layer" in lowered:
        return (
            f"{reason}. This is a TLS mismatch - port 465 expects implicit TLS "
            f"while 587 expects STARTTLS."
        )
    if "authentication" in lowered or "535" in reason or "534" in reason:
        return (
            f"{reason}. The username or password was rejected. Providers with "
            f"2FA usually require an app-specific password."
        )
    if "5.7.0" in reason or "not allowed" in lowered or "sender" in lowered:
        return (
            f"{reason}. The server refused the sender address. It normally has "
            f"to match the authenticated account or a verified identity."
        )
    if isinstance(exc, (TimeoutError, OSError)) and "resolve" not in lowered:
        return (
            f"{reason}. {host}:{port} could not be reached - check the host, "
            f"the port, and any outbound firewall rule."
        )
    return reason


def send_email_test(
    session: Session,
    *,
    tenant_id: str,
    payload: EmailTestRequest,
    actor: User,
    sender=None,
) -> EmailTestRead:
    runtime = get_email_runtime_settings(session, tenant_id=tenant_id)
    if not runtime.host:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "No SMTP server is configured. Set one for this tenant, or "
                "configure the deployment SMTP settings."
            ),
        )
    request = EmailMessageRequest(
        recipients=[payload.recipient],
        subject="MedizinHub email settings test",
        body=(
            "This is a test message confirming that your MedizinHub email "
            "settings are working.\n\n"
            f"Sent as: {runtime.from_name} <{runtime.from_email}>\n"
            f"SMTP host: {runtime.host}"
        ),
        reply_to=runtime.reply_to,
        from_email=runtime.from_email,
        from_name=runtime.from_name,
        smtp_host=None if runtime.uses_platform_smtp else runtime.host,
        smtp_port=None if runtime.uses_platform_smtp else runtime.port,
        smtp_username=runtime.username,
        smtp_password=runtime.password,
        smtp_use_tls=runtime.use_tls,
    )
    try:
        provider_message_id = (sender or get_email_sender()).send_message(request)
    except Exception as exc:
        detail = _diagnose(exc, host=runtime.host, port=runtime.port)
        # The provider's own wording is the useful part here - it names the
        # rejected credential or sender - but it can carry the SMTP dialogue,
        # so it is truncated rather than returned whole.
        logger.warning(
            "email.test_send_failed",
            extra={"tenant_id": tenant_id, "smtp_host": runtime.host},
        )
        record_audit_event(
            session,
            tenant_id=tenant_id,
            actor_user_id=actor.id,
            action="communication.email_test_sent",
            resource_type="tenant_integration_plugin",
            resource_id=tenant_id,
            purpose="integration_configuration",
            metadata_json='{"success": false}',
        )
        return EmailTestRead(
            success=False,
            message=f"Send failed: {detail[:400]}",
            sent_from=runtime.from_email,
        )
    record_audit_event(
        session,
        tenant_id=tenant_id,
        actor_user_id=actor.id,
        action="communication.email_test_sent",
        resource_type="tenant_integration_plugin",
        resource_id=tenant_id,
        purpose="integration_configuration",
        metadata_json='{"success": true}',
    )
    return EmailTestRead(
        success=True,
        message=f"Test email sent to {payload.recipient}.",
        provider_message_id=provider_message_id or None,
        sent_from=runtime.from_email,
    )
