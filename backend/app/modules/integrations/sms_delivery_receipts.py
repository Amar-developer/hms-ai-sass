"""SMSCountry delivery receipt ingestion.

The provider reports free-form status labels that differ between the REST and
legacy HTTP APIs, so every inbound label is folded into one internal vocabulary
before it touches a notification row. Unrecognised labels stay "unknown" rather
than being guessed at, so an unexpected provider change is visible in the queue
instead of silently reading as a delivery.
"""

import hmac
import json
import logging
from hashlib import sha256

from sqlmodel import Session, select

from app.modules.integrations.sms_schemas import SmsDeliveryReceiptRead
from app.modules.integrations.sms_service import (
    PLUGIN_KEY,
    get_sms_gateway_runtime_settings,
)
from app.modules.notifications.models import (
    NotificationEvent,
    NotificationProvider,
    NotificationStatus,
)
from app.modules.tenants.models import now_utc


logger = logging.getLogger("medizinhub.sms")

# Terminal states never move again; a late duplicate callback for one of these
# is acknowledged and dropped.
TERMINAL_DELIVERY_STATUSES = {
    "delivered",
    "undelivered",
    "expired",
    "rejected",
    "blocked",
}

_STATUS_MAP = {
    # REST API
    "delivered": "delivered",
    "delivered to handset": "delivered",
    "success": "delivered",
    "dlvrd": "delivered",
    "undelivered": "undelivered",
    "undeliv": "undelivered",
    "undeliverable": "undelivered",
    "failed": "failed",
    "failure": "failed",
    "error": "failed",
    "expired": "expired",
    "expired ttl": "expired",
    "rejected": "rejected",
    "rejectd": "rejected",
    "invalid number": "rejected",
    "invalid": "rejected",
    "submitted": "accepted",
    "submit": "accepted",
    "accepted": "accepted",
    "acceptd": "accepted",
    "queued": "accepted",
    "pending": "accepted",
    "enroute": "accepted",
    # Do-not-call / regulator blocks are permanent for this destination.
    "ndnc": "blocked",
    "dnd": "blocked",
    "blocked": "blocked",
    "blackout": "blocked",
    "spam": "blocked",
}


def map_provider_status(raw_status: str) -> str:
    """Fold a provider status label into the internal delivery vocabulary."""
    normalized = str(raw_status or "").strip().lower()
    if not normalized:
        return "unknown"
    if normalized in _STATUS_MAP:
        return _STATUS_MAP[normalized]
    # Legacy HTTP API reports numeric codes alongside labels.
    numeric = {
        "0": "accepted",
        "1": "delivered",
        "2": "failed",
        "3": "expired",
        "4": "rejected",
        "8": "blocked",
    }
    if normalized in numeric:
        return numeric[normalized]
    return "unknown"


def verify_receipt_signature(
    *, secret: str | None, raw_body: bytes, signature: str | None
) -> bool:
    """Constant-time HMAC check.

    A tenant that has not configured a secret cannot verify callbacks, so the
    receipt is refused rather than trusted.
    """
    if not secret or not signature:
        return False
    expected = hmac.new(secret.encode("utf-8"), raw_body, sha256).hexdigest()
    provided = str(signature or "").strip().lower()
    if provided.startswith("sha256="):
        provided = provided[len("sha256=") :]
    return hmac.compare_digest(expected, provided)


def _find_event(
    session: Session, *, tenant_id: str, message_id: str, client_reference: str
) -> NotificationEvent | None:
    filters = [
        NotificationEvent.tenant_id == tenant_id,
        NotificationEvent.provider == NotificationProvider.SMS,
        NotificationEvent.template_key.is_not(None),
    ]
    if message_id:
        event = session.exec(
            select(NotificationEvent).where(
                *filters, NotificationEvent.provider_message_id == message_id
            )
        ).first()
        if event:
            return event
    if client_reference:
        # ClientReference is the notification id we sent with the message.
        event = session.get(NotificationEvent, client_reference)
        if (
            event
            and event.tenant_id == tenant_id
            and event.provider == NotificationProvider.SMS
        ):
            return event
    return None


def record_delivery_receipt(
    session: Session,
    *,
    tenant_id: str,
    payload: dict,
) -> SmsDeliveryReceiptRead:
    """Apply one provider callback to its notification row, idempotently."""
    message_id = str(
        payload.get("MessageUUID")
        or payload.get("messageId")
        or payload.get("message_id")
        or payload.get("MessageId")
        or payload.get("jobno")
        or ""
    ).strip()
    client_reference = str(
        payload.get("ClientReference")
        or payload.get("client_reference")
        or payload.get("clientreference")
        or ""
    ).strip()
    raw_status = str(
        payload.get("Status")
        or payload.get("status")
        or payload.get("DeliveryStatus")
        or payload.get("delstatus")
        or ""
    ).strip()
    delivery_status = map_provider_status(raw_status)

    event = _find_event(
        session,
        tenant_id=tenant_id,
        message_id=message_id,
        client_reference=client_reference,
    )
    if not event:
        # An unmatched receipt is acknowledged so the provider stops retrying,
        # but nothing is written.
        logger.warning(
            "sms.receipt_unmatched",
            extra={
                "tenant_id": tenant_id,
                "provider_status": raw_status[:120],
            },
        )
        return SmsDeliveryReceiptRead(
            accepted=True,
            matched=False,
            delivery_status=delivery_status,
            message="No matching SMS was found for this receipt.",
        )

    if event.delivery_status in TERMINAL_DELIVERY_STATUSES:
        return SmsDeliveryReceiptRead(
            accepted=True,
            matched=True,
            delivery_status=event.delivery_status,
            message="This SMS already has a final delivery state.",
        )

    now = now_utc()
    event.delivery_status = delivery_status
    event.provider_status = raw_status[:120] or event.provider_status
    event.callback_updated_at = now
    event.updated_at = now
    if delivery_status == "delivered":
        event.delivered_at = now
        event.status = NotificationStatus.SENT
        event.failure_reason = None
    elif delivery_status in TERMINAL_DELIVERY_STATUSES:
        # The provider accepted the message but the handset never got it.
        # This is a delivery outcome, not a send failure, so it is not retried.
        event.status = NotificationStatus.FAILED
        event.failure_reason = (
            f"SMSCountry reported the message as {delivery_status}."
        )[:500]
    session.add(event)
    session.commit()
    logger.info(
        "sms.receipt_recorded",
        extra={
            "tenant_id": tenant_id,
            "notification_id": event.id,
            "delivery_status": delivery_status,
        },
    )
    return SmsDeliveryReceiptRead(
        accepted=True,
        matched=True,
        delivery_status=delivery_status,
        message="Delivery receipt recorded.",
    )


def webhook_secret_for_tenant(session: Session, *, tenant_id: str) -> str | None:
    try:
        runtime = get_sms_gateway_runtime_settings(session, tenant_id=tenant_id)
    except Exception:
        return None
    return runtime.webhook_secret


def parse_receipt_body(raw_body: bytes) -> dict:
    """Accept both the JSON and form-encoded callback shapes."""
    text = raw_body.decode("utf-8", errors="replace").strip()
    if not text:
        return {}
    if text.startswith("{"):
        try:
            parsed = json.loads(text)
        except json.JSONDecodeError:
            return {}
        return parsed if isinstance(parsed, dict) else {}
    from urllib.parse import parse_qsl

    return {key: value for key, value in parse_qsl(text)}


__all__ = [
    "PLUGIN_KEY",
    "map_provider_status",
    "parse_receipt_body",
    "record_delivery_receipt",
    "verify_receipt_signature",
    "webhook_secret_for_tenant",
]
