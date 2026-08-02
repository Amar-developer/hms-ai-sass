"""Composition root for external integrations used by application services."""

from app.core.config import Settings
from app.infrastructure.integrations.adapters.cache.redis import create_redis_client
from app.infrastructure.integrations.adapters.email.smtp import SmtpEmailAdapter
from app.infrastructure.integrations.adapters.messaging.http_template import (
    HttpTemplateMessageGateway,
)
from app.infrastructure.integrations.ports.cache import KeyValueStore
from app.infrastructure.integrations.ports.email import EmailSender
from app.infrastructure.integrations.ports.messaging import TemplateMessageGateway


def get_cache_store(settings: Settings | None = None) -> KeyValueStore:
    return create_redis_client(settings)


def get_email_sender(settings: Settings | None = None) -> EmailSender:
    return SmtpEmailAdapter(settings)


def get_template_message_gateway() -> TemplateMessageGateway:
    return HttpTemplateMessageGateway()
