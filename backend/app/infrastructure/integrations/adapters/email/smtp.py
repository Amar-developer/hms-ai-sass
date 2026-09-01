import mimetypes
import smtplib
from email.message import EmailMessage
from email.utils import make_msgid

from app.core.config import Settings, get_settings
from app.infrastructure.integrations.ports.email import EmailMessageRequest


# SMTPS. Everything else (587 submission, 25 relay) negotiates TLS in-band.
IMPLICIT_TLS_PORT = 465


class SmtpEmailAdapter:
    def __init__(self, settings: Settings | None = None, *, timeout_seconds: int = 30):
        self.settings = settings or get_settings()
        self.timeout_seconds = timeout_seconds

    def send_message(self, request: EmailMessageRequest) -> str:
        settings = self.settings
        # A tenant with its own SMTP server overrides the deployment settings
        # for this one message; everything it leaves unset falls back to them.
        host = request.smtp_host or settings.smtp_host
        port = request.smtp_port or settings.smtp_port
        username = (
            request.smtp_username if request.smtp_host else settings.smtp_username
        )
        password = (
            request.smtp_password if request.smtp_host else settings.smtp_password
        )
        use_tls = request.smtp_use_tls if request.smtp_host else settings.smtp_use_tls
        if not host:
            raise RuntimeError("SMTP is not configured")
        message = EmailMessage()
        message["Subject"] = request.subject
        from_email = request.from_email or settings.smtp_from_email
        from_name = request.from_name or settings.smtp_from_name
        message["From"] = f"{from_name} <{from_email}>"
        # Generated here rather than read back after send: EmailMessage never
        # sets this header itself, so the id returned to the caller was always
        # empty and no delivery could be traced in the provider's logs.
        message["Message-ID"] = make_msgid(domain=from_email.rsplit("@", 1)[-1])
        message["To"] = ", ".join(request.recipients)
        if request.cc:
            message["Cc"] = ", ".join(request.cc)
        if request.reply_to:
            message["Reply-To"] = request.reply_to
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
        # Port 465 is implicit TLS: the connection is encrypted from the first
        # byte and there is no STARTTLS command. Speaking plain SMTP to it makes
        # the server hang up, which surfaces as "Connection unexpectedly
        # closed" rather than anything that names the real problem.
        if port == IMPLICIT_TLS_PORT:
            with smtplib.SMTP_SSL(host, port, timeout=self.timeout_seconds) as smtp:
                if username:
                    smtp.login(username, password or "")
                smtp.send_message(message)
            return message["Message-ID"] or ""
        with smtplib.SMTP(host, port, timeout=self.timeout_seconds) as smtp:
            if use_tls:
                smtp.starttls()
            if username:
                smtp.login(username, password or "")
            smtp.send_message(message)
        return message["Message-ID"] or ""
