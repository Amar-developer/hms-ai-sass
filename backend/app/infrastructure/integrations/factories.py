"""Composition root for external integrations used by application services."""

from app.core.config import Settings
from app.infrastructure.integrations.adapters.cache.redis import create_redis_client
from app.infrastructure.integrations.adapters.email.smtp import SmtpEmailAdapter
from app.infrastructure.integrations.adapters.messaging.http_template import (
    HttpTemplateMessageGateway,
)
from app.infrastructure.integrations.adapters.sms.smscountry import SmsCountryGateway
from app.infrastructure.integrations.ports.cache import KeyValueStore
from app.infrastructure.integrations.ports.email import EmailSender
from app.infrastructure.integrations.ports.messaging import TemplateMessageGateway
from app.infrastructure.integrations.ports.sms import SmsGateway


def get_cache_store(
    settings: Settings | None = None,
    *,
    socket_connect_timeout: float | None = None,
    socket_timeout: float | None = None,
) -> KeyValueStore:
    return create_redis_client(
        settings,
        socket_connect_timeout=socket_connect_timeout,
        socket_timeout=socket_timeout,
    )


def get_email_sender(settings: Settings | None = None) -> EmailSender:
    return SmtpEmailAdapter(settings)


def get_template_message_gateway() -> TemplateMessageGateway:
    return HttpTemplateMessageGateway()


def get_sms_gateway(provider: str = "smscountry") -> SmsGateway:
    if provider == "smscountry":
        return SmsCountryGateway()
    raise ValueError(f"Unsupported SMS provider: {provider}")
