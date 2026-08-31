"""SMS outbox worker.

Every send is revalidated at claim time rather than trusted from enqueue time:
consent, phone number, tenant entitlement, integration state, template approval
and volume limits are all rechecked, because a row can sit in the queue long
enough for any of them to change.
"""

from datetime import timedelta
import json
import logging

from fastapi import HTTPException
from sqlalchemy import func
from sqlmodel import Session, select

from app.infrastructure.integrations.factories import get_sms_gateway
from app.infrastructure.integrations.ports.messaging import normalize_mobile_number
from app.infrastructure.integrations.ports.sms import (
    SmsGateway,
    SmsSendRequest,
    SmsSendResult,
)
from app.modules.audit.service import record_audit_event
from app.modules.integrations.sms.consent import (
    patient_allows_sms,
    patient_for_sms_resource,
    patient_sms_destination,
    patient_sms_language,
)
from app.modules.integrations.sms.service import (
    PLUGIN_KEY,
    get_sms_gateway_runtime_settings,
    get_sms_settings_model,
)
from app.modules.integrations.sms.templates import resolve_sms_template, select_sms_flow
from app.modules.integrations.sms.usage import enforce_sms_limits
from app.modules.notifications.models import (
    NotificationEvent,
    NotificationProvider,
    NotificationStatus,
)
from app.modules.patients.models import Patient
from app.modules.subscriptions.service import enforce_module_enabled
from app.modules.tenants.models import now_utc


PROCESSING_LEASE_MINUTES = 5
RETRYABLE_STATUSES = {"rate_limited", "service_unavailable", "send_failed"}

logger = logging.getLogger("medizinhub.sms")


class SmsCancelled(ValueError):
    """The send must not happen and must never be retried automatically."""


class SmsRetryable(RuntimeError):
    """The send failed for a reason that may clear on its own."""


class SmsDeferred(RuntimeError):
    """The send remains valid but must wait for a tenant throughput window."""


def _claim_next(session: Session) -> NotificationEvent | None:
    """Take exclusive ownership of one due SMS row.

    SELECT ... FOR UPDATE SKIP LOCKED plus the lease timestamp means several
    workers can run concurrently without ever sending the same message twice,
    and a worker that dies mid-send releases its row once the lease expires.
    """
    now = now_utc()
    lease_expired = now - timedelta(minutes=PROCESSING_LEASE_MINUTES)
    event = session.exec(
        select(NotificationEvent)
        .where(
            NotificationEvent.provider == NotificationProvider.SMS,
            NotificationEvent.status == NotificationStatus.QUEUED,
            NotificationEvent.template_key.is_not(None),
            NotificationEvent.next_attempt_at <= now,
            (
                NotificationEvent.processing_started_at.is_(None)
                | (NotificationEvent.processing_started_at <= lease_expired)
            ),
        )
        .order_by(NotificationEvent.next_attempt_at, NotificationEvent.created_at)
        .with_for_update(skip_locked=True)
    ).first()
    if not event:
        return None
    event.processing_started_at = now
    session.add(event)
    session.commit()
    session.refresh(event)
    return event


def _cancel(session: Session, event: NotificationEvent, reason: str) -> None:
    event.status = NotificationStatus.CANCELLED
    event.failure_reason = reason[:500]
    event.processing_started_at = None
    event.updated_at = now_utc()
    session.add(event)
    session.commit()
    record_audit_event(
        session,
        tenant_id=event.tenant_id,
        branch_id=event.branch_id,
        action="notification.cancelled",
        resource_type="notification_event",
        resource_id=event.id,
        purpose="communication",
        metadata_json=json.dumps(
            {"channel": "sms", "flow_key": event.template_key, "reason": reason[:200]}
        ),
    )


def _defer(session: Session, event: NotificationEvent, reason: str) -> None:
    event.status = NotificationStatus.QUEUED
    event.processing_started_at = None
    event.next_attempt_at = now_utc() + timedelta(minutes=1)
    event.failure_reason = reason[:500]
    event.updated_at = now_utc()
    session.add(event)
    session.commit()


def _enforce_throughput(session: Session, event: NotificationEvent, settings) -> None:
    limit = settings.throughput_limit_per_minute
    if not limit:
        return
    accepted_since = now_utc() - timedelta(minutes=1)
    accepted = int(
        session.exec(
            select(func.count())
            .select_from(NotificationEvent)
            .where(
                NotificationEvent.tenant_id == event.tenant_id,
                NotificationEvent.provider == NotificationProvider.SMS,
                NotificationEvent.accepted_at >= accepted_since,
            )
        ).one()
    )
    if accepted >= limit:
        raise SmsDeferred(
            "Deferred until the tenant SMS throughput window has capacity."
        )


def _load_runtime(session: Session, event: NotificationEvent):
    """Recheck everything that must still be true at send time."""
    try:
        enforce_module_enabled(session, event.tenant_id, PLUGIN_KEY)
    except HTTPException as exc:
        raise SmsCancelled("The tenant subscription no longer enables SMS.") from exc
    try:
        runtime = get_sms_gateway_runtime_settings(session, tenant_id=event.tenant_id)
    except ValueError as exc:
        raise SmsCancelled(str(exc)) from exc
    if not runtime.enabled:
        raise SmsCancelled("The tenant SMS integration is disabled.")
    settings = get_sms_settings_model(session, tenant_id=event.tenant_id)
    flow_key = str(event.template_key or "")
    # Resolved fresh at send time, not pinned at enqueue time: if the admin
    # swaps which template is enabled for this flow_key after the message was
    # queued, the row sends under whichever template is live now.
    if not any(item.flow_key == flow_key and item.enabled for item in settings.flows):
        raise SmsCancelled("This SMS workflow is disabled.")
    if not settings.default_sender_id:
        raise SmsCancelled("The tenant SMS sender header is missing.")
    return runtime, settings


def _resolve_destination(
    session: Session,
    event: NotificationEvent,
    *,
    settings,
) -> tuple[str, str, Patient | None]:
    """Decide who this message goes to, and whether it may go at all.

    Recipient type comes from the flow, not from whether a patient row was
    found: a patient flow whose record has since been deleted is still a
    patient message and must not fall through to the staff toggle.
    """
    flow_key = str(event.template_key or "")
    is_patient_flow = flow_key.endswith("_patient")
    if is_patient_flow and not settings.patient_notifications_enabled:
        raise SmsCancelled("Patient SMS notifications are disabled for this tenant.")
    if not is_patient_flow and not settings.staff_notifications_enabled:
        raise SmsCancelled("Staff SMS notifications are disabled for this tenant.")

    patient = patient_for_sms_resource(
        session,
        tenant_id=event.tenant_id,
        resource_type=str(event.resource_type or ""),
        resource_id=str(event.resource_id or ""),
    )
    if is_patient_flow and event.resource_type and not patient:
        raise SmsCancelled("The patient record for this SMS is no longer available.")
    destination = (
        patient_sms_destination(patient, settings.default_country_code)
        if patient
        else None
    )
    if not destination:
        try:
            destination = normalize_mobile_number(
                event.recipient, settings.default_country_code
            )
        except ValueError as exc:
            raise SmsCancelled(
                "The recipient does not have a valid mobile number."
            ) from exc
    language = patient_sms_language(patient) if patient else "en"
    return destination, language, patient


def _template_values(event: NotificationEvent) -> dict[str, object]:
    """Variable values are pinned onto the row at enqueue time.

    The worker never re-derives them from live records: a value that changed
    after the message was queued would no longer match the approved template
    the patient is about to receive.
    """
    try:
        parsed = json.loads(event.message or "{}")
    except json.JSONDecodeError:
        return {}
    return parsed if isinstance(parsed, dict) else {}


def _save_result(
    session: Session,
    event: NotificationEvent,
    result: SmsSendResult,
) -> None:
    now = now_utc()
    event.attempt_count += 1
    event.processing_started_at = None
    event.updated_at = now
    event.provider_adapter = "smscountry"
    event.provider_message_id = result.external_message_id
    event.provider_status = result.provider_status or None
    event.provider_error_code = result.provider_error_code or None
    if result.segment_count:
        event.segment_count = result.segment_count
    if result.success:
        # "sent" means the gateway accepted it. Delivery is only confirmed by a
        # receipt, which moves delivery_status off "accepted".
        event.status = NotificationStatus.SENT
        event.failure_reason = None
        event.sent_at = now
        event.accepted_at = now
        event.delivery_status = "accepted"
    elif (
        result.retryable
        and result.status in RETRYABLE_STATUSES
        and event.attempt_count < event.max_attempts
    ):
        delay_seconds = min(60 * (5 ** (event.attempt_count - 1)), 3600)
        event.status = NotificationStatus.QUEUED
        event.failure_reason = result.message[:500]
        event.next_attempt_at = now + timedelta(seconds=delay_seconds)
    else:
        event.status = NotificationStatus.FAILED
        event.failure_reason = result.message[:500]
    session.add(event)
    session.commit()
    logger.info(
        "sms.send_attempted",
        extra={
            "tenant_id": event.tenant_id,
            "notification_id": event.id,
            "flow_key": event.template_key,
            "gateway_status": result.status,
            "attempt": event.attempt_count,
            "segments": event.segment_count,
        },
    )
    record_audit_event(
        session,
        tenant_id=event.tenant_id,
        branch_id=event.branch_id,
        action=(
            "notification.sent" if result.success else "notification.delivery_failed"
        ),
        resource_type="notification_event",
        resource_id=event.id,
        purpose="communication",
        metadata_json=json.dumps(
            {
                "channel": "sms",
                "flow_key": event.template_key,
                "status": result.status,
                "attempt": event.attempt_count,
                "segments": event.segment_count,
            }
        ),
    )


def _callback_url(event: NotificationEvent) -> str | None:
    from app.core.config import get_settings

    base = str(get_settings().public_api_base_url or "").strip().rstrip("/")
    if not base.startswith("https://"):
        return None
    return f"{base}/api/v1/communications/sms/delivery-receipt/{event.tenant_id}"


def process_due_sms_notifications(
    session: Session,
    *,
    limit: int = 10,
    gateway: SmsGateway | None = None,
) -> int:
    """Send up to `limit` due SMS rows. Returns how many were processed."""
    processed = 0
    sender = gateway or get_sms_gateway()
    for _index in range(limit):
        event = _claim_next(session)
        if not event:
            break
        try:
            runtime, settings = _load_runtime(session, event)
            _enforce_throughput(session, event, settings)
            destination, language, patient = _resolve_destination(
                session,
                event,
                settings=settings,
            )
            flow = select_sms_flow(settings, str(event.template_key or ""), language)
            if not flow.approved_by_provider or not flow.dlt_template_id:
                raise SmsCancelled("This SMS workflow has no approved DLT template.")
            if not patient_allows_sms(patient, classification=flow.classification):
                raise SmsCancelled(
                    "The patient has not consented to SMS for this message."
                )
            resolved = resolve_sms_template(
                settings,
                flow_key=str(event.template_key or ""),
                values=_template_values(event),
                language=language,
            )
            try:
                enforce_sms_limits(
                    session,
                    tenant_id=event.tenant_id,
                    segments=resolved.segment_estimate.segments,
                )
            except HTTPException as exc:
                raise SmsCancelled(str(exc.detail)) from exc

            event.sender_id = resolved.template.sender_id
            event.template_external_id = resolved.template.dlt_template_id
            event.rendered_body_hash = resolved.body_hash
            event.segment_count = resolved.segment_estimate.segments
            session.add(event)
            session.commit()

            result = sender.send_sms(
                SmsSendRequest(
                    destination=destination,
                    body=resolved.body,
                    template=resolved.template,
                    client_reference=event.id,
                    campaign_name=str(event.template_key or ""),
                    callback_url=_callback_url(event),
                    unicode=resolved.segment_estimate.encoding == "unicode",
                ),
                credentials=runtime.credentials,
                mode=runtime.mode,
                api_url=runtime.api_url,
                timeout_seconds=runtime.timeout_seconds,
            )
            _save_result(session, event, result)
        except SmsDeferred as exc:
            _defer(session, event, str(exc))
        except SmsCancelled as exc:
            _cancel(session, event, str(exc))
        except SmsRetryable as exc:
            _save_result(
                session,
                event,
                SmsSendResult(False, "send_failed", str(exc), retryable=True),
            )
        except ValueError as exc:
            # Template/rendering problems are configuration faults: retrying
            # them unchanged would fail identically.
            _cancel(session, event, str(exc))
        except Exception:
            session.rollback()
            logger.exception(
                "sms.unexpected_delivery_error",
                extra={
                    "tenant_id": event.tenant_id,
                    "notification_id": event.id,
                    "flow_key": event.template_key,
                },
            )
            _save_result(
                session,
                event,
                SmsSendResult(
                    False,
                    "send_failed",
                    "An unexpected SMS delivery error occurred.",
                    retryable=True,
                ),
            )
        processed += 1
    return processed
