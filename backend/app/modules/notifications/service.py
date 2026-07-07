from fastapi import HTTPException, status
from sqlmodel import Session

from app.modules.audit.service import record_audit_event
from app.modules.notifications.models import (
    NotificationEvent,
    NotificationEventType,
    NotificationProvider,
)
from app.modules.notifications.repositories import NotificationEventRepository
from app.modules.settings.models import SettingKey
from app.modules.settings.service import resolve_setting
from app.modules.subscriptions.service import enforce_module_enabled


PROVIDER_MODULES = {
    NotificationProvider.WHATSAPP: "whatsapp",
    NotificationProvider.SMS: "sms",
    NotificationProvider.VOICE: "voice",
}


def enforce_notification_allowed(
    session: Session,
    *,
    tenant_id: str,
    branch_id: str | None,
    provider: NotificationProvider,
) -> None:
    module_key = PROVIDER_MODULES[provider]
    enforce_module_enabled(session, tenant_id, module_key)
    enabled_providers, _scope, _scope_id = resolve_setting(
        session,
        tenant_id=tenant_id,
        module="communication",
        key=SettingKey.COMMUNICATION_PROVIDERS_ENABLED,
        branch_id=branch_id,
    )
    enabled = set(enabled_providers or [])
    if provider.value not in enabled:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Communication provider {provider.value} is not enabled in settings",
        )


def enabled_communication_providers(
    session: Session,
    *,
    tenant_id: str,
    branch_id: str | None,
) -> list[NotificationProvider]:
    enabled_providers, _scope, _scope_id = resolve_setting(
        session,
        tenant_id=tenant_id,
        module="communication",
        key=SettingKey.COMMUNICATION_PROVIDERS_ENABLED,
        branch_id=branch_id,
    )
    providers = []
    for provider in enabled_providers or []:
        try:
            providers.append(NotificationProvider(provider))
        except ValueError:
            continue
    return providers


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
    try:
        enforce_notification_allowed(
            session,
            tenant_id=tenant_id,
            branch_id=branch_id,
            provider=provider,
        )
    except HTTPException:
        return None

    event = NotificationEvent(
        tenant_id=tenant_id,
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
    NotificationEventRepository(session).add(event)
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
        metadata_json=f'{{"provider": "{provider.value}", "event_type": "{event_type.value}"}}',
    )
    return event
