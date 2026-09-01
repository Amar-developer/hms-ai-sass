from dataclasses import dataclass
import ipaddress
import re
import socket
from typing import Protocol
from urllib.parse import urlparse


@dataclass(frozen=True)
class TemplateMessageResult:
    success: bool
    status: str
    message: str
    status_code: int | None = None
    external_message_id: str | None = None


class TemplateMessageGateway(Protocol):
    """Provider-neutral contract for an approved template message channel."""

    def send_template(
        self,
        *,
        api_url: str,
        api_key: str,
        campaign_name: str,
        destination: str,
        recipient_name: str,
        template_parameters: list[str],
        timeout_seconds: int,
        media_url: str | None = None,
        media_filename: str | None = None,
    ) -> TemplateMessageResult: ...


def normalize_mobile_number(value: str, default_country_code: str) -> str:
    raw = str(value or "").strip()
    if raw.startswith("00"):
        raw = f"+{raw[2:]}"
    has_plus = raw.startswith("+")
    digits = re.sub(r"\D", "", raw)
    country_digits = re.sub(r"\D", "", default_country_code)
    if not has_plus and not digits.startswith(country_digits):
        digits = f"{country_digits}{digits}"
    normalized = f"+{digits}"
    if not re.fullmatch(r"\+[1-9]\d{7,14}", normalized):
        raise ValueError("Enter a valid mobile number with country code")
    return normalized


def validate_public_https_url(value: str) -> None:
    parsed = urlparse(value)
    if parsed.scheme != "https" or not parsed.hostname or parsed.username:
        raise ValueError("The outbound URL must be a public HTTPS URL")
    if parsed.hostname.lower() == "localhost":
        raise ValueError("The outbound URL must be a public HTTPS URL")
    try:
        addresses = socket.getaddrinfo(parsed.hostname, parsed.port or 443)
    except socket.gaierror as exc:
        raise ValueError("The outbound URL hostname could not be resolved") from exc
    if not addresses:
        raise ValueError("The outbound URL hostname could not be resolved")
    for address in addresses:
        ip = ipaddress.ip_address(address[4][0])
        if not ip.is_global:
            raise ValueError("The outbound URL must not resolve to a private address")
