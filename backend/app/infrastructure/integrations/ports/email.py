from dataclasses import dataclass, field
from typing import Protocol


@dataclass(frozen=True)
class EmailAttachment:
    filename: str
    content: bytes
    content_type: str = "application/octet-stream"


@dataclass(frozen=True)
class EmailMessageRequest:
    recipients: list[str]
    subject: str
    body: str
    cc: list[str] = field(default_factory=list)
    reply_to: str | None = None
    # Per-tenant sender identity. Falls back to the configured SMTP identity
    # when the tenant has no admin address on file.
    from_email: str | None = None
    from_name: str | None = None
    # Per-tenant SMTP server. When smtp_host is unset the deployment-wide
    # settings are used, so a tenant need only configure a server if it wants
    # to send through its own.
    smtp_host: str | None = None
    smtp_port: int | None = None
    smtp_username: str | None = None
    smtp_password: str | None = None
    smtp_use_tls: bool = True
    attachments: list[EmailAttachment] = field(default_factory=list)


class EmailSender(Protocol):
    def send_message(self, request: EmailMessageRequest) -> str: ...
