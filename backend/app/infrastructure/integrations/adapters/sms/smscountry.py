import base64
import json
import re
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urlencode
from urllib.request import Request, urlopen

from app.infrastructure.integrations.ports.messaging import validate_public_https_url
from app.infrastructure.integrations.ports.sms import (
    SmsGatewayCredentials,
    SmsGatewayMode,
    SmsSendRequest,
    SmsSendResult,
)


MAX_RESPONSE_BYTES = 65_536


def _digits(value: str) -> str:
    return re.sub(r"\D", "", value or "")


def _decode_response(raw: bytes):
    text = raw.decode("utf-8", errors="replace").strip()
    if not text:
        return {}
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        return text


def _external_message_id(payload) -> str | None:
    if isinstance(payload, str):
        match = re.search(r"(?:OK|SUCCESS)[:\s-]+([A-Za-z0-9_.:@/-]{1,160})", payload)
        return match.group(1) if match else None
    if not isinstance(payload, dict):
        return None
    candidates = [
        payload.get("messageId"),
        payload.get("message_id"),
        payload.get("MessageId"),
        payload.get("SMS_Job_NO"),
        payload.get("jobId"),
        payload.get("id"),
    ]
    nested = payload.get("payload")
    if isinstance(nested, dict):
        candidates.extend(
            [
                nested.get("messageId"),
                nested.get("message_id"),
                nested.get("MessageId"),
                nested.get("SMS_Job_NO"),
                nested.get("jobId"),
                nested.get("id"),
            ]
        )
    for candidate in candidates:
        value = str(candidate or "").strip()
        if value and re.fullmatch(r"[A-Za-z0-9_.:@/-]{1,160}", value):
            return value
    return None


def _failure(status_code: int | None, message: str) -> SmsSendResult:
    if status_code in {401, 403}:
        return SmsSendResult(
            False,
            "credential_rejected",
            "The saved SMSCountry credential was rejected.",
            retryable=False,
            status_code=status_code,
        )
    if status_code == 429:
        return SmsSendResult(
            False,
            "rate_limited",
            "SMSCountry rate limit was reached.",
            retryable=True,
            status_code=status_code,
        )
    if status_code in {400, 404, 409, 422}:
        return SmsSendResult(
            False,
            "request_rejected",
            "SMSCountry rejected the SMS request. Check DLT/template values.",
            retryable=False,
            status_code=status_code,
        )
    if status_code is not None and status_code >= 500:
        return SmsSendResult(
            False,
            "service_unavailable",
            "SMSCountry is temporarily unavailable.",
            retryable=True,
            status_code=status_code,
        )
    return SmsSendResult(False, "send_failed", message, retryable=True)


class SmsCountryGateway:
    """SMSCountry adapter for approved SMS templates."""

    def send_sms(
        self,
        request: SmsSendRequest,
        *,
        credentials: SmsGatewayCredentials,
        mode: SmsGatewayMode,
        api_url: str | None = None,
        timeout_seconds: int = 15,
    ) -> SmsSendResult:
        if mode == "rest":
            return self._send_rest(
                request,
                credentials=credentials,
                api_url=api_url,
                timeout_seconds=timeout_seconds,
            )
        return self._send_legacy_http(
            request,
            credentials=credentials,
            api_url=api_url,
            timeout_seconds=timeout_seconds,
        )

    def _send_rest(
        self,
        request: SmsSendRequest,
        *,
        credentials: SmsGatewayCredentials,
        api_url: str | None,
        timeout_seconds: int,
    ) -> SmsSendResult:
        if not credentials.auth_key or not credentials.auth_token:
            raise ValueError("SMSCountry REST auth key and token are required")
        if not api_url:
            raise ValueError("SMSCountry API URL is required")
        # The tenant-configured URL may carry a literal {auth_key} placeholder
        # for SMSCountry's per-account path segment; formatting is a no-op for
        # URLs that don't use one.
        url = api_url.format(auth_key=quote(credentials.auth_key, safe=""))
        validate_public_https_url(url)
        auth = base64.b64encode(
            f"{credentials.auth_key}:{credentials.auth_token}".encode("utf-8")
        ).decode("ascii")
        payload: dict[str, object] = {
            "Text": request.body,
            "Number": _digits(request.destination),
            "SenderId": request.template.sender_id,
            "Tool": "API",
            "NameOfCampaign": request.campaign_name or request.template.flow_key,
            "ClientReference": request.client_reference,
            "DltTemplateId": request.template.dlt_template_id,
        }
        if request.template.dlt_entity_id:
            payload["DltEntityId"] = request.template.dlt_entity_id
        if request.callback_url:
            payload["DRNotifyUrl"] = request.callback_url
            payload["DRNotifyHttpMethod"] = "POST"
        http_request = Request(
            url,
            data=json.dumps(payload).encode("utf-8"),
            headers={
                "Content-Type": "application/json",
                "Accept": "application/json",
                "Authorization": f"Basic {auth}",
            },
            method="POST",
        )
        try:
            with urlopen(http_request, timeout=timeout_seconds) as response:
                raw = response.read(MAX_RESPONSE_BYTES + 1)
                if len(raw) > MAX_RESPONSE_BYTES:
                    return _failure(None, "SMSCountry returned an invalid response.")
                return self._success_or_rejection(
                    _decode_response(raw),
                    status_code=int(response.status),
                    segment_count=None,
                )
        except HTTPError as exc:
            return _failure(exc.code, "SMSCountry rejected the SMS request.")
        except (TimeoutError, URLError):
            return _failure(None, "SMSCountry could not be reached.")

    def _send_legacy_http(
        self,
        request: SmsSendRequest,
        *,
        credentials: SmsGatewayCredentials,
        api_url: str | None,
        timeout_seconds: int,
    ) -> SmsSendResult:
        if not credentials.username or not credentials.password:
            raise ValueError("SMSCountry legacy username and password are required")
        if not api_url:
            raise ValueError("SMSCountry API URL is required")
        validate_public_https_url(api_url)
        query = urlencode(
            {
                "User": credentials.username,
                "passwd": credentials.password,
                "mobilenumber": _digits(request.destination),
                "message": request.body,
                "sid": request.template.sender_id,
                "mtype": "OL" if request.unicode else "N",
                "DR": "Y" if request.callback_url else "N",
            }
        )
        separator = "&" if "?" in api_url else "?"
        url = f"{api_url}{separator}{query}"
        http_request = Request(url, method="GET", headers={"Accept": "text/plain"})
        try:
            with urlopen(http_request, timeout=timeout_seconds) as response:
                raw = response.read(MAX_RESPONSE_BYTES + 1)
                if len(raw) > MAX_RESPONSE_BYTES:
                    return _failure(None, "SMSCountry returned an invalid response.")
                return self._success_or_rejection(
                    _decode_response(raw),
                    status_code=int(response.status),
                    segment_count=None,
                )
        except HTTPError as exc:
            return _failure(exc.code, "SMSCountry rejected the SMS request.")
        except (TimeoutError, URLError):
            return _failure(None, "SMSCountry could not be reached.")

    def _success_or_rejection(
        self,
        payload,
        *,
        status_code: int,
        segment_count: int | None,
    ) -> SmsSendResult:
        error_code = ""
        if isinstance(payload, bool):
            accepted = payload
            provider_status = str(payload)
        elif isinstance(payload, str):
            provider_status = payload[:120]
            accepted = payload.upper().startswith(("OK", "SUCCESS", "TRUE"))
        elif isinstance(payload, dict):
            provider_status = str(
                payload.get("status")
                or payload.get("Status")
                or payload.get("message")
                or payload.get("Message")
                or ""
            )[:120]
            error_code = str(payload.get("errorCode") or payload.get("ErrorCode") or "")
            accepted = (
                status_code < 400
                and not error_code
                and provider_status.lower()
                not in {"failed", "failure", "error", "false", "rejected"}
            )
        else:
            provider_status = ""
            accepted = status_code < 400
        if accepted:
            return SmsSendResult(
                True,
                "accepted",
                "SMS accepted by SMSCountry.",
                retryable=False,
                status_code=status_code,
                external_message_id=_external_message_id(payload),
                provider_status=provider_status or None,
                segment_count=segment_count,
            )
        return SmsSendResult(
            False,
            "request_rejected",
            "SMSCountry rejected the SMS request.",
            retryable=False,
            status_code=status_code,
            external_message_id=_external_message_id(payload),
            provider_status=provider_status or None,
            provider_error_code=error_code or None,
            segment_count=segment_count,
        )
