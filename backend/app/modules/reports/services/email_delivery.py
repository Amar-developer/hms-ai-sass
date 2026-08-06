from app.infrastructure.integrations.factories import get_email_sender
from app.infrastructure.integrations.ports.email import (
    EmailAttachment,
    EmailMessageRequest,
)


def send_report_email(
    *,
    recipients: list[str],
    cc: list[str],
    subject: str,
    body: str,
    filename: str | None = None,
    content: bytes | None = None,
    attachments: list[tuple[str, bytes]] | None = None,
) -> str:
    attachment_rows = list(attachments or [])
    if filename and content is not None:
        attachment_rows.append((filename, content))
    return get_email_sender().send_message(
        EmailMessageRequest(
            recipients=recipients,
            cc=cc,
            subject=subject,
            body=body,
            attachments=[
                EmailAttachment(
                    filename=attachment_filename,
                    content=attachment_content,
                    content_type="application/vnd.ms-excel",
                )
                for attachment_filename, attachment_content in attachment_rows
            ],
        )
    )
