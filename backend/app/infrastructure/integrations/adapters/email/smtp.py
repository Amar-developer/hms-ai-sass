import mimetypes
import smtplib
from email.message import EmailMessage

from app.core.config import Settings, get_settings
from app.infrastructure.integrations.ports.email import EmailMessageRequest


class SmtpEmailAdapter:
    def __init__(self, settings: Settings | None = None, *, timeout_seconds: int = 30):
        self.settings = settings or get_settings()
        self.timeout_seconds = timeout_seconds

    def send_message(self, request: EmailMessageRequest) -> str:
        settings = self.settings
        if not settings.smtp_host:
            raise RuntimeError("SMTP is not configured")
        message = EmailMessage()
        message["Subject"] = request.subject
        message["From"] = f"{settings.smtp_from_name} <{settings.smtp_from_email}>"
        message["To"] = ", ".join(request.recipients)
        if request.cc:
            message["Cc"] = ", ".join(request.cc)
        message.set_content(request.body)
        for attachment in request.attachments:
            guessed = (
                attachment.content_type or mimetypes.guess_type(attachment.filename)[0]
            )
            maintype, subtype = (guessed or "application/octet-stream").split("/", 1)
            message.add_attachment(
                attachment.content,
                maintype=maintype,
                subtype=subtype,
                filename=attachment.filename,
            )
        with smtplib.SMTP(
            settings.smtp_host, settings.smtp_port, timeout=self.timeout_seconds
        ) as smtp:
            if settings.smtp_use_tls:
                smtp.starttls()
            if settings.smtp_username:
                smtp.login(settings.smtp_username, settings.smtp_password or "")
            smtp.send_message(message)
        return message["Message-ID"] or ""
