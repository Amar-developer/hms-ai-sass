import ipaddress
import json
import logging
import re
import socket
from urllib.error import HTTPError, URLError
from urllib.parse import urlparse
from urllib.request import HTTPRedirectHandler, Request, build_opener

from app.infrastructure.integrations.ports.messaging import TemplateMessageResult


MAX_RESPONSE_BYTES = 65_536
MAX_LOGGED_ERROR_BODY = 2_000

logger = logging.getLogger("medizinhub.whatsapp")


def _mask_destination(destination: str) -> str:
    digits = re.sub(r"\D", "", destination or "")
    return f"***{digits[-4:]}" if len(digits) >= 4 else "***"


class _NoRedirectHandler(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


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


def _safe_message_id(payload) -> str | None:
    if not isinstance(payload, dict):
        return None
    candidates = [
        payload.get("messageId"),
        payload.get("message_id"),
        payload.get("id"),
    ]
    data = payload.get("data")
    if isinstance(data, dict):
        candidates.extend(
            [data.get("messageId"), data.get("message_id"), data.get("id")]
        )
    for candidate in candidates:
        value = str(candidate or "").strip()
        if value and re.fullmatch(r"[A-Za-z0-9_.:@/-]{1,160}", value):
            return value
    return None


def _decode_json(raw: bytes):
    try:
        return json.loads(raw.decode("utf-8")) if raw else {}
    except (UnicodeDecodeError, json.JSONDecodeError):
        return {}


def _failure(status_code: int | None, message: str) -> TemplateMessageResult:
    if status_code in {401, 403}:
        status, safe_message = "credential_rejected", "The saved API key was rejected."
    elif status_code == 429:
        status, safe_message = (
            "rate_limited",
            "The messaging service rate limit was reached.",
        )
    elif status_code in {400, 404, 409, 422}:
        status, safe_message = (
            "request_rejected",
            "The template message request was rejected. Check the identifier and values.",
        )
    elif status_code is not None and status_code >= 500:
        status, safe_message = (
            "service_unavailable",
            "The messaging service is temporarily unavailable.",
        )
    else:
        status, safe_message = "send_failed", message
    return TemplateMessageResult(False, status, safe_message, status_code)


class HttpTemplateMessageGateway:
    """Generic HTTPS adapter for approved template/campaign message APIs."""

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
    ) -> TemplateMessageResult:
        validate_public_https_url(api_url)
        payload: dict[str, object] = {
            "apiKey": api_key,
            "campaignName": campaign_name,
            "destination": destination,
            "userName": recipient_name,
            "source": "MedizinHub HMS",
            "templateParams": template_parameters,
        }
        if media_url:
            validate_public_https_url(media_url)
            payload["media"] = {
                "url": media_url,
                "filename": media_filename or "invoice.pdf",
            }
        request = Request(
            api_url,
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json", "Accept": "application/json"},
            method="POST",
        )
        opener = build_opener(_NoRedirectHandler())
        try:
            with opener.open(request, timeout=timeout_seconds) as response:
                raw = response.read(MAX_RESPONSE_BYTES + 1)
                if len(raw) > MAX_RESPONSE_BYTES:
                    return _failure(
                        None, "The messaging service returned an invalid response."
                    )
                response_payload = _decode_json(raw)
                return TemplateMessageResult(
                    True,
                    "sent",
                    "Test message sent successfully.",
                    int(response.status),
                    _safe_message_id(response_payload),
                )
        except HTTPError as exc:
            try:
                error_body = exc.read(MAX_LOGGED_ERROR_BODY).decode(
                    "utf-8", errors="replace"
                )
            except Exception:
                error_body = ""
            logger.warning(
                "WhatsApp template message rejected by provider",
                extra={
                    "status_code": exc.code,
                    "campaign_name": campaign_name,
                    "destination": _mask_destination(destination),
                    "provider_response": error_body,
                },
            )
            return _failure(exc.code, "The messaging service rejected the request.")
        except (TimeoutError, socket.timeout):
            return _failure(None, "The messaging service request timed out.")
        except URLError:
            return _failure(None, "The messaging service could not be reached.")
