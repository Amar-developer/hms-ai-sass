from datetime import datetime
from functools import partial
import json
import logging

from fastapi import HTTPException
from sqlmodel import Session, select

from app.modules.audit.service import record_audit_event
from app.core.pagination import DEFAULT_LIST_LIMIT
from app.modules.notifications.models import (
    NotificationEvent,
    NotificationEventType,
    NotificationProvider,
    NotificationStatus,
)
from app.modules.notifications.repositories import NotificationEventRepository
from app.modules.notifications.schemas import NotificationEventCreate
from app.modules.notifications.services.providers import enforce_notification_allowed
from app.modules.integrations.models import TenantIntegrationPlugin
from app.modules.integrations.service import decode_config, get_tenant_plugin
from app.modules.integrations.whatsapp.schemas import (
    WhatsAppFlowSettings,
    audience_notifications_enabled,
    flow_audience,
)
from app.modules.integrations.whatsapp.consent import (
    patient_allows_whatsapp,
    patient_for_notification_resource,
    patient_notification_destination,
    patient_notification_language,
)
from app.modules.integrations.whatsapp.templates import resolve_template_identifier
from app.modules.integrations.whatsapp.usage import enforce_whatsapp_monthly_limit
from app.modules.subscriptions.service import enforce_module_enabled
from app.modules.tenants.models import now_utc


logger = logging.getLogger("medizinhub.notifications")


def queue_notification(
    session: Session,
    *,
    tenant_id: str,
    payload: NotificationEventCreate,
) -> NotificationEvent:
    enforce_notification_allowed(
        session,
        tenant_id=tenant_id,
        branch_id=payload.branch_id,
        provider=payload.provider,
    )
    event = NotificationEvent.model_validate(payload, update={"tenant_id": tenant_id})
    NotificationEventRepository(session).add(event)
    session.commit()
    session.refresh(event)
    record_audit_event(
        session,
        tenant_id=tenant_id,
        branch_id=event.branch_id,
        actor_user_id=payload.queued_by_user_id,
        action="notification.queued",
        resource_type="notification_event",
        resource_id=event.id,
        purpose="communication",
        metadata_json=f'{{"provider": "{event.provider.value}", "event_type": "{event.event_type.value}"}}',
    )
    return event


def queue_notification_if_allowed(
    session: Session,
    *,
    tenant_id: str,
    branch_id: str | None,
    provider: NotificationProvider,
    event_type: NotificationEventType,
    recipient: str | None,
    message: str,
    subject: str | None = None,
    resource_type: str | None = None,
    resource_id: str | None = None,
    queued_by_user_id: str | None = None,
) -> NotificationEvent | None:
    if not recipient:
        return None
    payload = NotificationEventCreate(
        branch_id=branch_id,
        provider=provider,
        event_type=event_type,
        recipient=recipient,
        subject=subject,
        message=message,
        resource_type=resource_type,
        resource_id=resource_id,
        queued_by_user_id=queued_by_user_id,
    )
    try:
        return queue_notification(session, tenant_id=tenant_id, payload=payload)
    except HTTPException:
        return None


def list_notifications(
    session: Session,
    *,
    tenant_id: str,
    branch_id: str | None = None,
    provider: str | None = None,
    status_filter: str | None = None,
    limit: int = DEFAULT_LIST_LIMIT,
    offset: int = 0,
) -> list[NotificationEvent]:
    return NotificationEventRepository(session).list_events(
        tenant_id=tenant_id,
        branch_id=branch_id,
        provider=provider,
        status_filter=status_filter,
        limit=limit,
        offset=offset,
    )


def _template_event_type(flow_key: str) -> NotificationEventType:
    return (
        NotificationEventType.APPOINTMENT_REMINDER
        if flow_key.startswith("appointment_")
        else NotificationEventType.PATIENT_MESSAGE
    )


def _record_blocked_template(
    session: Session,
    *,
    tenant_id: str,
    branch_id: str | None,
    flow_key: str,
    recipient: str | None,
    resource_type: str,
    resource_id: str,
    dedupe_key: str,
    queued_by_user_id: str | None,
    reason: str,
) -> None:
    """Leave a cancelled row explaining why a message was never queued.

    Without this the surprising refusals below — no mobile number, opted out,
    no approved template, monthly limit reached — produced no row, no log and
    no audit entry, so the delivery queue simply had nothing in it. Staff read
    that as "the message went out", and the success rate on the dashboard is
    computed only over messages that made it into the outbox, so it stayed
    green while nothing was being delivered.

    Recorded under a `blocked:` dedupe key of its own so it never collides
    with the real send: once the cause is fixed, the same trigger can still
    queue normally under the original key.
    """
    blocked_key = f"blocked:{dedupe_key}"
    already_recorded = session.exec(
        select(NotificationEvent).where(
            NotificationEvent.tenant_id == tenant_id,
            NotificationEvent.dedupe_key == blocked_key,
        )
    ).first()
    if already_recorded:
        return
    event = NotificationEvent(
        tenant_id=tenant_id,
        branch_id=branch_id,
        provider=NotificationProvider.WHATSAPP,
        event_type=_template_event_type(flow_key),
        # NOT NULL, and the whole point of one of these rows is that there was
        # no usable number; the queue masks it back to "Unavailable".
        recipient=recipient or "unavailable",
        subject="Template notification",
        message="Not queued for delivery.",
        template_key=flow_key,
        dedupe_key=blocked_key,
        resource_type=resource_type,
        resource_id=resource_id,
        queued_by_user_id=queued_by_user_id,
        status=NotificationStatus.CANCELLED,
        failure_reason=reason[:500],
    )
    session.add(event)
    session.commit()
    logger.info(
        "whatsapp.template_not_queued",
        extra={
            "tenant_id": tenant_id,
            "flow_key": flow_key,
            "reason": reason,
            "notification_id": event.id,
        },
    )


def queue_whatsapp_template_if_allowed(
    session: Session,
    *,
    tenant_id: str,
    branch_id: str | None,
    flow_key: str,
    recipient: str | None,
    resource_type: str,
    resource_id: str,
    dedupe_key: str,
    queued_by_user_id: str | None = None,
    artifact_file_id: str | None = None,
    artifact_version: int | None = None,
    not_before: datetime | None = None,
    context: dict[str, str] | None = None,
    recipient_name: str | None = None,
) -> NotificationEvent | None:
    """Persist a provider-neutral template outbox row when its tenant flow is on."""
    try:
        enforce_module_enabled(session, tenant_id, "whatsapp")
    except HTTPException:
        return None
    row: TenantIntegrationPlugin | None = get_tenant_plugin(
        session, tenant_id, "whatsapp"
    )
    if not row or not row.enabled or not row.secret_ciphertext:
        return None
    config = decode_config(row.config_json)
    flows = WhatsAppFlowSettings.model_validate(config.get("flows") or {})
    if not hasattr(flows, flow_key) or not getattr(flows, flow_key):
        return None
    if not audience_notifications_enabled(config, flow_key):
        return None
    # Everything below is a refusal an operator would not expect, so each one
    # leaves a visible row. The switched-off cases above stay silent on
    # purpose: a disabled flow producing cancelled rows is just noise.
    blocked = partial(
        _record_blocked_template,
        session,
        tenant_id=tenant_id,
        branch_id=branch_id,
        flow_key=flow_key,
        recipient=recipient,
        resource_type=resource_type,
        resource_id=resource_id,
        dedupe_key=dedupe_key,
        queued_by_user_id=queued_by_user_id,
    )
    patient = None
    if flow_audience(flow_key) == "patient":
        patient = patient_for_notification_resource(
            session,
            tenant_id=tenant_id,
            resource_type=resource_type,
            resource_id=resource_id,
        )
        if not patient_allows_whatsapp(patient):
            blocked(reason="The patient has opted out of WhatsApp communication.")
            return None
        recipient = patient_notification_destination(
            patient, str(config.get("default_country_code") or "+91")
        )
    if not recipient:
        blocked(reason="No valid mobile number is on record for this recipient.")
        return None
    template_identifier, _language = resolve_template_identifier(
        config,
        flow_key=flow_key,
        preferred_language=patient_notification_language(patient) if patient else None,
    )
    if not template_identifier:
        blocked(
            reason=(
                "No approved template identifier is configured for"
                f" '{flow_key}' in this language."
            )
        )
        return None
    existing = session.exec(
        select(NotificationEvent).where(
            NotificationEvent.tenant_id == tenant_id,
            NotificationEvent.dedupe_key == dedupe_key,
        )
    ).first()
    if existing:
        return existing
    try:
        enforce_whatsapp_monthly_limit(session, tenant_id=tenant_id)
    except HTTPException:
        # The most dangerous of these to lose: once the plan's monthly quota
        # is spent every flow stops at once, and the delivery queue used to
        # look calm and healthy while nothing was going out.
        blocked(
            reason=("The tenant's monthly WhatsApp message limit has been reached.")
        )
        return None
    event = NotificationEvent(
        tenant_id=tenant_id,
        branch_id=branch_id,
        provider=NotificationProvider.WHATSAPP,
        event_type=(
            NotificationEventType.APPOINTMENT_REMINDER
            if flow_key.startswith("appointment_")
            else NotificationEventType.PATIENT_MESSAGE
        ),
        recipient=recipient,
        subject="Template notification",
        message=(
            json.dumps({"recipient_name": recipient_name or "Tenant Admin", **context})
            if context is not None
            else "Template message queued."
        ),
        template_key=flow_key,
        dedupe_key=dedupe_key,
        resource_type=resource_type,
        resource_id=resource_id,
        artifact_file_id=artifact_file_id,
        artifact_version=artifact_version,
        queued_by_user_id=queued_by_user_id,
        max_attempts=int(config.get("max_attempts") or 5),
        next_attempt_at=not_before or now_utc(),
    )
    session.add(event)
    session.commit()
    session.refresh(event)
    record_audit_event(
        session,
        tenant_id=tenant_id,
        branch_id=branch_id,
        actor_user_id=queued_by_user_id,
        action="notification.queued",
        resource_type="notification_event",
        resource_id=event.id,
        purpose="communication",
        metadata_json=(f'{{"provider": "whatsapp", "flow_key": "{flow_key}"}}'),
    )
    return event


def whatsapp_template_integration_enabled(session: Session, tenant_id: str) -> bool:
    row = get_tenant_plugin(session, tenant_id, "whatsapp")
    return bool(row and row.enabled)
