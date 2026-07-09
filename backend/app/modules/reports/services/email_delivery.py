import smtplib
from email.message import EmailMessage

from app.core.config import get_settings


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
    settings = get_settings()
    if not settings.smtp_host:
        raise RuntimeError(
            "SMTP is not configured. Set MEDIZINHUB_SMTP_HOST and SMTP credentials."
        )
    message = EmailMessage()
    message["Subject"] = subject
    message["From"] = f"{settings.smtp_from_name} <{settings.smtp_from_email}>"
    message["To"] = ", ".join(recipients)
    if cc:
        message["Cc"] = ", ".join(cc)
    message.set_content(body)
    attachment_rows = list(attachments or [])
    if filename and content is not None:
        attachment_rows.append((filename, content))
    for attachment_filename, attachment_content in attachment_rows:
        message.add_attachment(
            attachment_content,
            maintype="application",
            subtype="vnd.ms-excel",
            filename=attachment_filename,
        )
    with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=30) as smtp:
        if settings.smtp_use_tls:
            smtp.starttls()
        if settings.smtp_username:
            smtp.login(settings.smtp_username, settings.smtp_password or "")
        smtp.send_message(message)
    return message["Message-ID"] or ""
