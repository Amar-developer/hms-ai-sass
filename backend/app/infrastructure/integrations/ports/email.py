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
    attachments: list[EmailAttachment] = field(default_factory=list)


class EmailSender(Protocol):
    def send_message(self, request: EmailMessageRequest) -> str: ...
