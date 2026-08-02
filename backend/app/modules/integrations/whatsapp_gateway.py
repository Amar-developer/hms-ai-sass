"""Compatibility facade for the provider-neutral template messaging adapter."""

from app.infrastructure.integrations.adapters.messaging.http_template import (
    HttpTemplateMessageGateway,
    normalize_mobile_number,
    validate_public_https_url,
)
from app.infrastructure.integrations.ports.messaging import TemplateMessageResult

WhatsAppGateway = HttpTemplateMessageGateway
WhatsAppGatewayResult = TemplateMessageResult
normalize_whatsapp_number = normalize_mobile_number

__all__ = [
    "WhatsAppGateway",
    "WhatsAppGatewayResult",
    "normalize_whatsapp_number",
    "validate_public_https_url",
]
