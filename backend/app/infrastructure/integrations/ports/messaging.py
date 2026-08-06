from dataclasses import dataclass
from typing import Protocol


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
