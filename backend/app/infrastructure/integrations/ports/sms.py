from dataclasses import dataclass
from typing import Literal, Protocol


SmsGatewayMode = Literal["rest", "http_legacy"]
SmsGatewayStatus = Literal[
    "accepted",
    "credential_rejected",
    "rate_limited",
    "request_rejected",
    "service_unavailable",
    "send_failed",
]


@dataclass(frozen=True)
class SmsGatewayCredentials:
    auth_key: str | None = None
    auth_token: str | None = None
    username: str | None = None
    password: str | None = None


@dataclass(frozen=True)
class SmsTemplateReference:
    flow_key: str
    dlt_entity_id: str
    dlt_template_id: str
    sender_id: str
    classification: str
    language: str = "en"


@dataclass(frozen=True)
class SmsSendRequest:
    destination: str
    body: str
    template: SmsTemplateReference
    client_reference: str
    campaign_name: str | None = None
    callback_url: str | None = None
    unicode: bool = False


@dataclass(frozen=True)
class SmsSendResult:
    success: bool
    status: SmsGatewayStatus
    message: str
    retryable: bool = False
    status_code: int | None = None
    external_message_id: str | None = None
    provider_status: str | None = None
    provider_error_code: str | None = None
    segment_count: int | None = None


class SmsGateway(Protocol):
    """Provider-neutral contract for DLT-approved SMS sending."""

    def send_sms(
        self,
        request: SmsSendRequest,
        *,
        credentials: SmsGatewayCredentials,
        mode: SmsGatewayMode,
        api_url: str | None = None,
        timeout_seconds: int = 15,
    ) -> SmsSendResult: ...
