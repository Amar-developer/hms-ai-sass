from fastapi import HTTPException, status
from sqlmodel import Session

from app.modules.notifications.models import NotificationProvider
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
