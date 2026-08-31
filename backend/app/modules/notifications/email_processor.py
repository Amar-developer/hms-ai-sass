import json
import logging
from dataclasses import dataclass
from datetime import timedelta

from sqlmodel import Session, select

from app.infrastructure.integrations.factories import get_email_sender
from app.infrastructure.integrations.ports.email import (
    EmailAttachment,
    EmailMessageRequest,
)
from app.modules.audit.service import record_audit_event
from app.modules.files.models import FileDocument
from app.modules.files.services.artifact_service import ArtifactService
from app.modules.identity.models import User
from app.modules.integrations.email.service import (
    EmailRuntimeSettings,
    get_email_runtime_settings,
)
from app.modules.notifications.models import (
    DocumentDelivery,
    DocumentDeliveryChannel,
    DocumentDeliveryStatus,
)
from app.modules.reports.models import ReportJob, ReportJobStatus
from app.modules.reports.services.config_service import mark_report_period_sent
from app.modules.reports.services.period import report_period_key
from app.modules.tenants.models import now_utc


logger = logging.getLogger("medizinhub.email")
PROCESSING_LEASE_MINUTES = 5


class SmtpEmailSender:
    def send(
        self,
        *,
        recipient: str,
        subject: str,
        body: str,
        attachments: list[tuple[str, str, bytes]],
        cc: list[str] | None = None,
        reply_to: str | None = None,
        from_email: str | None = None,
        from_name: str | None = None,
        smtp: EmailRuntimeSettings | None = None,
    ) -> str:
        return get_email_sender().send_message(
            EmailMessageRequest(
                recipients=_email_list(recipient),
                cc=cc or [],
                reply_to=reply_to,
                from_email=from_email,
                from_name=from_name,
                smtp_host=None if not smtp or smtp.uses_platform_smtp else smtp.host,
                smtp_port=None if not smtp or smtp.uses_platform_smtp else smtp.port,
                smtp_username=None if not smtp else smtp.username,
                smtp_password=None if not smtp else smtp.password,
                smtp_use_tls=True if not smtp else smtp.use_tls,
                subject=subject,
                body=body,
                attachments=[
                    EmailAttachment(
                        filename=filename,
                        content_type=content_type,
                        content=content,
                    )
                    for filename, content_type, content in attachments
                ],
            )
        )


def _email_list(value: str | list[str] | None) -> list[str]:
    if isinstance(value, list):
        values = value
    else:
        values = str(value or "").split(",")
    return [email.strip() for email in values if email and email.strip()]


@dataclass(frozen=True)
class DeliveryEmailFields:
    recipients: list[str]
    cc: list[str]
    reply_to: str | None
    from_email: str | None
    from_name: str | None
    smtp: EmailRuntimeSettings


def _tenant_admin_email(session: Session, tenant_id: str) -> str | None:
    admin = session.exec(
        select(User)
        .where(
            User.tenant_id == tenant_id,
            User.user_type == "tenant_admin",
            User.is_active == True,  # noqa: E712
        )
        .order_by(User.created_at)
    ).first()
    return admin.email if admin and admin.email else None


def _delivery_email_fields(
    session: Session, delivery: DocumentDelivery
) -> DeliveryEmailFields:
    recipients = _email_list(delivery.recipient)
    cc: list[str] = []
    reply_to: str | None = None
    if delivery.resource_type == "report_job":
        job = session.get(ReportJob, delivery.resource_id)
        if job and job.tenant_id == delivery.tenant_id:
            recipients = _email_list(json.loads(job.recipients_json or "[]"))
            cc = _email_list(json.loads(job.cc_json or "[]"))
    if delivery.queued_by_user_id:
        actor = session.get(User, delivery.queued_by_user_id)
        if actor and actor.is_active and actor.email:
            reply_to = actor.email
    # Sender identity and SMTP server both come from the tenant's email
    # integration, which falls back to the deployment settings when the tenant
    # has not configured its own.
    smtp = get_email_runtime_settings(session, tenant_id=delivery.tenant_id)
    return DeliveryEmailFields(
        recipients=recipients,
        cc=cc,
        reply_to=reply_to
        or smtp.reply_to
        or _tenant_admin_email(session, delivery.tenant_id),
        from_email=smtp.from_email,
        from_name=smtp.from_name,
        smtp=smtp,
    )


def _claim_next(session: Session) -> DocumentDelivery | None:
    now = now_utc()
    lease_expired = now - timedelta(minutes=PROCESSING_LEASE_MINUTES)
    row = session.exec(
        select(DocumentDelivery)
        .where(
            DocumentDelivery.channel == DocumentDeliveryChannel.EMAIL,
            DocumentDelivery.status.in_(
                [DocumentDeliveryStatus.QUEUED, DocumentDeliveryStatus.PROCESSING]
            ),
            DocumentDelivery.next_attempt_at <= now,
            (
                DocumentDelivery.processing_started_at.is_(None)
                | (DocumentDelivery.processing_started_at <= lease_expired)
            ),
        )
        .order_by(DocumentDelivery.next_attempt_at, DocumentDelivery.created_at)
        .with_for_update(skip_locked=True)
    ).first()
    if not row:
        return None
    row.status = DocumentDeliveryStatus.PROCESSING
    row.processing_started_at = now
    row.updated_at = now
    session.add(row)
    session.commit()
    session.refresh(row)
    return row


def _attachments(session: Session, row: DocumentDelivery):
    file_ids = json.loads(row.artifact_file_ids_json or "[]") or [row.artifact_file_id]
    attachments = []
    for file_id in file_ids:
        artifact = session.get(FileDocument, file_id)
        if not (
            artifact
            and artifact.tenant_id == row.tenant_id
            and artifact.document_status == "ready"
        ):
            raise ValueError("Pinned delivery artifact is missing or not ready")
        attachments.append(
            (
                artifact.file_name,
                artifact.content_type or "application/octet-stream",
                ArtifactService.read_bytes(artifact),
            )
        )
    return attachments


def _update_report_job(session: Session, delivery: DocumentDelivery) -> None:
    if delivery.resource_type != "report_job":
        return
    job = session.get(ReportJob, delivery.resource_id)
    if not job or job.tenant_id != delivery.tenant_id:
        return
    if delivery.status == DocumentDeliveryStatus.SENT:
        job.status = ReportJobStatus.SENT
        job.sent_at = delivery.sent_at
        job.provider_message_id = delivery.provider_message_id
        job.failure_reason = None
        from datetime import date

        mark_report_period_sent(
            session,
            tenant_id=job.tenant_id,
            period_key=report_period_key(
                date.fromisoformat(job.period_start), date.fromisoformat(job.period_end)
            ),
            actor_user_id=job.queued_by_user_id,
        )
    elif delivery.status == DocumentDeliveryStatus.FAILED:
        job.status = ReportJobStatus.FAILED
        job.failure_reason = delivery.failure_reason
    job.updated_at = now_utc()
    session.add(job)


def process_due_email_deliveries(
    session: Session, *, limit: int = 10, sender=None
) -> int:
    email_sender = sender or SmtpEmailSender()
    processed = 0
    for _ in range(limit):
        delivery = _claim_next(session)
        if not delivery:
            break
        try:
            fields = _delivery_email_fields(session, delivery)
            provider_id = email_sender.send(
                recipient=", ".join(fields.recipients),
                cc=fields.cc,
                reply_to=fields.reply_to,
                from_email=fields.from_email,
                from_name=fields.from_name,
                smtp=fields.smtp,
                subject=delivery.subject or "Your MedizinHub document",
                body=delivery.message or "Please find your document attached.",
                attachments=_attachments(session, delivery),
            )
            delivery.attempt_count += 1
            delivery.status = DocumentDeliveryStatus.SENT
            delivery.provider_message_id = provider_id
            delivery.failure_reason = None
            delivery.sent_at = now_utc()
        except Exception as exc:
            session.rollback()
            delivery = session.get(DocumentDelivery, delivery.id)
            delivery.attempt_count += 1
            delivery.failure_reason = str(exc)[:1000]
            if delivery.attempt_count < delivery.max_attempts:
                delivery.status = DocumentDeliveryStatus.QUEUED
                delay = min(60 * (5 ** (delivery.attempt_count - 1)), 3600)
                delivery.next_attempt_at = now_utc() + timedelta(seconds=delay)
            else:
                delivery.status = DocumentDeliveryStatus.FAILED
        delivery.processing_started_at = None
        delivery.updated_at = now_utc()
        session.add(delivery)
        _update_report_job(session, delivery)
        session.commit()
        record_audit_event(
            session,
            tenant_id=delivery.tenant_id,
            branch_id=delivery.branch_id,
            action=(
                "document_delivery.sent"
                if delivery.status == DocumentDeliveryStatus.SENT
                else "document_delivery.failed"
            ),
            resource_type=delivery.resource_type,
            resource_id=delivery.resource_id,
            purpose="document_delivery",
            metadata_json=json.dumps(
                {
                    "delivery_id": delivery.id,
                    "channel": delivery.channel.value,
                    "attempt": delivery.attempt_count,
                }
            ),
        )
        processed += 1
    return processed
