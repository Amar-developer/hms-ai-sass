from fastapi import HTTPException
from sqlmodel import Session

from app.modules.audit.service import record_audit_event
from app.modules.notifications.models import (
    NotificationEvent,
    NotificationEventType,
    NotificationProvider,
)
from app.modules.notifications.repositories import NotificationEventRepository
from app.modules.notifications.schemas import NotificationEventCreate
from app.modules.notifications.services.providers import enforce_notification_allowed


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
) -> list[NotificationEvent]:
    return NotificationEventRepository(session).list_events(
        tenant_id=tenant_id,
        branch_id=branch_id,
        provider=provider,
        status_filter=status_filter,
    )
