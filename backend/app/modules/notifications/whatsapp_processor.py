from datetime import timedelta
from decimal import Decimal
import logging
from urllib.parse import urlparse

from fastapi import HTTPException
from sqlmodel import Session, select

from app.core.credentials import decrypt_credential
from app.modules.appointments.models import Appointment, AppointmentStatus
from app.modules.audit.service import record_audit_event
from app.modules.billing.models import CreditNote, Invoice, InvoiceItem
from app.modules.consultations.models import Consultation
from app.modules.files.models import FileDocument
from app.modules.files.storage.factory import get_storage_backend_for_document
from app.modules.integrations.models import TenantIntegrationPlugin
from app.modules.integrations.invoice_receipts import (
    create_signed_invoice_receipt_url,
)
from app.modules.integrations.document_links import create_signed_document_url
from app.modules.integrations.service import decode_config, get_tenant_plugin
from app.infrastructure.integrations.adapters.messaging.http_template import (
    normalize_mobile_number,
)
from app.infrastructure.integrations.factories import get_template_message_gateway
from app.infrastructure.integrations.ports.messaging import (
    TemplateMessageGateway,
    TemplateMessageResult,
)
from app.modules.integrations.whatsapp_schemas import (
    WhatsAppFlowSettings,
)
from app.modules.integrations.whatsapp_templates import resolve_template_identifier
from app.modules.integrations.whatsapp_consent import (
    patient_allows_whatsapp,
    patient_for_notification_resource,
    patient_notification_destination,
    patient_notification_language,
)
from app.modules.notifications.models import (
    DocumentDelivery,
    DocumentDeliveryStatus,
    NotificationEvent,
    NotificationProvider,
    NotificationStatus,
)
from app.modules.lab.models import LabOrder
from app.modules.patients.models import Patient
from app.modules.practitioners.models import Practitioner
from app.modules.queue.models import QueueEvent
from app.modules.subscriptions.service import enforce_module_enabled
from app.modules.tenants.models import now_utc


PROCESSING_LEASE_MINUTES = 5
RETRYABLE_STATUSES = {"rate_limited", "service_unavailable", "send_failed"}
logger = logging.getLogger("medizinhub.whatsapp")


class NotificationCancelled(ValueError):
    pass


class NotificationRetryable(RuntimeError):
    pass


def _money(value: Decimal) -> str:
    return f"{value:.2f}".rstrip("0").rstrip(".")


def _public_file_url(row: FileDocument | None) -> tuple[str | None, str | None]:
    if not row or row.is_private or not row.is_active:
        return None, None
    parsed = urlparse(row.file_url)
    if parsed.scheme != "https" or not parsed.hostname:
        return None, None
    return row.file_url, row.file_name


def _invoice_media(
    session: Session,
    invoice: Invoice,
    public_base_url: str,
    *,
    artifact_file_id: str | None = None,
    artifact_version: int | None = None,
) -> tuple[str, str]:
    row = session.get(FileDocument, artifact_file_id) if artifact_file_id else None
    if row and not (
        row.tenant_id == invoice.tenant_id
        and row.attached_to_doctype == "Invoice"
        and row.attached_to_name == invoice.id
        and row.attached_to_field == "invoice_pdf"
        and row.artifact_type == "final"
        and row.document_status == "ready"
        and (artifact_version is None or row.document_version == artifact_version)
    ):
        row = None
    if not artifact_file_id:
        # Compatibility for notification rows queued before artifact pinning existed.
        row = session.exec(
            select(FileDocument)
            .where(
                FileDocument.tenant_id == invoice.tenant_id,
                FileDocument.attached_to_doctype == "Invoice",
                FileDocument.attached_to_name == invoice.id,
                FileDocument.attached_to_field == "invoice_pdf",
                FileDocument.is_active == True,  # noqa: E712
            )
            .order_by(FileDocument.document_version.desc())
        ).first()
    existing_url, existing_name = _public_file_url(row)
    if existing_url:
        return existing_url, existing_name or f"invoice-{invoice.invoice_number}.pdf"
    if not row:
        raise NotificationCancelled(
            "The printed invoice PDF is missing. Use Send Invoice after payment."
        )
    if not public_base_url:
        raise NotificationCancelled("The public receipt base URL is missing.")
    if row.storage_backend == "s3" and row.storage_key:
        try:
            backend = get_storage_backend_for_document(row)
            stored = backend.head(key=row.storage_key)
            if stored.size <= 0:
                raise NotificationCancelled("The stored invoice PDF is empty.")
            if stored.content_type and stored.content_type != "application/pdf":
                raise NotificationCancelled(
                    "The stored invoice artifact is not a PDF document."
                )
        except NotificationCancelled:
            raise
        except Exception as exc:
            raise NotificationRetryable(
                "The stored invoice PDF is temporarily unavailable for delivery."
            ) from exc
    # WhatsApp providers fetch media asynchronously and can lag well past a
    # short-lived S3 presigned URL's expiry, leaving the message marked
    # "sent" with a broken attachment. Route through our own long-lived
    # signed receipt endpoint (server-side S3 fetch) instead of a raw URL.
    return (
        create_signed_invoice_receipt_url(
            public_base_url=public_base_url,
            tenant_id=invoice.tenant_id,
            invoice_id=invoice.id,
            # Pre-Phase-3 rows used the default "original" artifact type. Keep
            # their legacy signed URL valid; all newly finalized invoices pin a
            # cryptographically signed final artifact ID.
            file_id=row.id if row.artifact_type == "final" else None,
        ),
        f"invoice-{invoice.invoice_number}.pdf",
    )


def _artifact_media(
    session: Session,
    event: NotificationEvent,
    public_base_url: str,
) -> tuple[str | None, str | None]:
    if not event.artifact_file_id:
        return None, None
    row = session.get(FileDocument, event.artifact_file_id)
    if not (
        row
        and row.tenant_id == event.tenant_id
        and row.document_status == "ready"
        and row.document_version == event.artifact_version
    ):
        raise NotificationCancelled("The pinned document artifact is unavailable.")
    if not public_base_url:
        raise NotificationCancelled("The public document base URL is missing.")
    return (
        create_signed_document_url(
            public_base_url=public_base_url,
            tenant_id=row.tenant_id,
            file_id=row.id,
        ),
        row.file_name,
    )


def _message_values(
    session: Session, event: NotificationEvent, config: dict
) -> tuple[str, list[str], str | None, str | None]:
    if not str(event.template_key or "").endswith("_doctor"):
        patient = patient_for_notification_resource(
            session,
            tenant_id=event.tenant_id,
            resource_type=event.resource_type or "",
            resource_id=event.resource_id or "",
        )
        if not patient_allows_whatsapp(patient):
            raise NotificationCancelled(
                "The patient has opted out of WhatsApp notifications."
            )
    if event.template_key in {
        "appointment_booked_patient",
        "appointment_booked_doctor",
        "appointment_cancelled_patient",
        "appointment_cancelled_doctor",
        "appointment_reminder_patient",
    }:
        appointment = session.get(Appointment, event.resource_id or "")
        if not appointment or appointment.tenant_id != event.tenant_id:
            raise NotificationCancelled("The appointment no longer exists.")
        if (
            event.template_key == "appointment_reminder_patient"
            and appointment.status
            not in {AppointmentStatus.SCHEDULED, AppointmentStatus.CONFIRMED}
        ):
            raise NotificationCancelled("The appointment is no longer upcoming.")
        if event.template_key in {
            "appointment_booked_doctor",
            "appointment_cancelled_doctor",
        }:
            recipient = session.get(Practitioner, appointment.practitioner_id or "")
        else:
            recipient = session.get(Patient, appointment.patient_id)
        if not recipient or recipient.tenant_id != event.tenant_id:
            raise NotificationCancelled("The notification recipient no longer exists.")
        appointment_time = (
            appointment.appointment_time.strftime("%I:%M %p")
            if appointment.appointment_time
            else "Scheduled time"
        )
        if event.template_key == "appointment_booked_doctor":
            appointment_view_url = str(config.get("appointment_view_url") or "").strip()
            if not appointment_view_url:
                raise NotificationCancelled("The doctor application URL is missing.")
            values = [
                recipient.full_name,
                "booked",
                appointment.id,
                appointment.appointment_date.strftime("%d %B %Y"),
                appointment_time,
                appointment_view_url,
            ]
        else:
            values = [
                recipient.full_name,
                appointment.appointment_date.strftime("%d %B %Y"),
                appointment_time,
            ]
        if event.template_key.startswith("appointment_cancelled_"):
            cancellation = session.exec(
                select(QueueEvent)
                .where(
                    QueueEvent.appointment_id == appointment.id,
                    QueueEvent.to_status == "cancelled",
                )
                .order_by(QueueEvent.created_at.desc())
            ).first()
            values.append(
                cancellation.reason
                if cancellation and cancellation.reason
                else "Cancelled"
            )
        return recipient.full_name, values, None, None
    if event.template_key in {"invoice_paid_patient", "payment_pending_patient"}:
        invoice = session.get(Invoice, event.resource_id or "")
        if not invoice or invoice.tenant_id != event.tenant_id:
            raise NotificationCancelled("The invoice no longer exists.")
        patient = session.get(Patient, invoice.patient_id)
        if not patient or patient.tenant_id != event.tenant_id:
            raise NotificationCancelled("The invoice patient no longer exists.")
        if event.template_key == "payment_pending_patient":
            return (
                patient.full_name,
                [
                    patient.full_name,
                    invoice.invoice_number,
                    _money(invoice.paid_amount),
                    _money(invoice.balance_amount),
                ],
                None,
                None,
            )
        items = session.exec(
            select(InvoiceItem)
            .where(InvoiceItem.invoice_id == invoice.id)
            .order_by(InvoiceItem.created_at)
        ).all()
        service = ", ".join(dict.fromkeys(item.description for item in items))
        media_url, media_filename = _invoice_media(
            session,
            invoice,
            str(config.get("public_media_base_url") or ""),
            artifact_file_id=event.artifact_file_id,
            artifact_version=event.artifact_version,
        )
        return (
            patient.full_name,
            [
                patient.full_name,
                invoice.invoice_number,
                service[:500] or "Healthcare services",
                _money(invoice.total_amount),
            ],
            media_url,
            media_filename,
        )
    if event.template_key == "invoice_refunded_patient":
        credit = session.get(CreditNote, event.resource_id or "")
        if not credit or credit.tenant_id != event.tenant_id:
            raise NotificationCancelled("The refund record no longer exists.")
        invoice = session.get(Invoice, credit.invoice_id)
        if not invoice or invoice.tenant_id != event.tenant_id:
            raise NotificationCancelled("The refunded invoice no longer exists.")
        patient = session.get(Patient, invoice.patient_id)
        if not patient or patient.tenant_id != event.tenant_id:
            raise NotificationCancelled("The invoice patient no longer exists.")
        return (
            patient.full_name,
            [patient.full_name, invoice.invoice_number, _money(credit.amount)],
            None,
            None,
        )
    if event.template_key == "lab_report_ready_patient":
        order = session.get(LabOrder, event.resource_id or "")
        if not order or order.tenant_id != event.tenant_id:
            raise NotificationCancelled("The lab order no longer exists.")
        patient = session.get(Patient, order.patient_id)
        if not patient or patient.tenant_id != event.tenant_id:
            raise NotificationCancelled("The lab patient no longer exists.")
        media_url, media_filename = _artifact_media(
            session, event, str(config.get("public_media_base_url") or "")
        )
        return (
            patient.full_name,
            [
                patient.full_name,
                order.lab_order_number or order.id,
                order.tests[:500],
            ],
            media_url,
            media_filename,
        )
    if event.template_key in {"prescription_ready_patient", "follow_up_advice_patient"}:
        consultation = session.get(Consultation, event.resource_id or "")
        if not consultation or consultation.tenant_id != event.tenant_id:
            raise NotificationCancelled("The consultation no longer exists.")
        patient = session.get(Patient, consultation.patient_id)
        if not patient or patient.tenant_id != event.tenant_id:
            raise NotificationCancelled("The consultation patient no longer exists.")
        if event.template_key == "follow_up_advice_patient":
            return (
                patient.full_name,
                [
                    patient.full_name,
                    consultation.follow_up_advice or "Follow up as advised",
                ],
                None,
                None,
            )
        appointment = session.get(Appointment, consultation.appointment_id)
        practitioner = session.get(Practitioner, consultation.practitioner_id or "")
        consultation_date = (
            appointment.appointment_date.strftime("%d %B %Y")
            if appointment
            else consultation.created_at.strftime("%d %B %Y")
        )
        return (
            patient.full_name,
            [
                patient.full_name,
                consultation_date,
                practitioner.full_name if practitioner else "Doctor",
            ],
            None,
            None,
        )
    raise NotificationCancelled("The notification flow is not supported.")


def _claim_next(session: Session) -> NotificationEvent | None:
    now = now_utc()
    lease_expired = now - timedelta(minutes=PROCESSING_LEASE_MINUTES)
    event = session.exec(
        select(NotificationEvent)
        .where(
            NotificationEvent.provider == NotificationProvider.WHATSAPP,
            NotificationEvent.status == NotificationStatus.QUEUED,
            NotificationEvent.template_key.is_not(None),
            NotificationEvent.next_attempt_at <= now,
            (
                NotificationEvent.processing_started_at.is_(None)
                | (NotificationEvent.processing_started_at <= lease_expired)
            ),
        )
        .order_by(NotificationEvent.next_attempt_at, NotificationEvent.created_at)
        .with_for_update(skip_locked=True)
    ).first()
    if not event:
        return None
    event.processing_started_at = now
    session.add(event)
    session.commit()
    session.refresh(event)
    return event


def _cancel(session: Session, event: NotificationEvent, reason: str) -> None:
    event.status = NotificationStatus.CANCELLED
    event.failure_reason = reason[:500]
    event.processing_started_at = None
    event.updated_at = now_utc()
    session.add(event)
    delivery = session.exec(
        select(DocumentDelivery).where(
            DocumentDelivery.notification_event_id == event.id
        )
    ).first()
    if delivery:
        delivery.status = DocumentDeliveryStatus.CANCELLED
        delivery.failure_reason = reason[:1000]
        delivery.processing_started_at = None
        delivery.updated_at = now_utc()
        session.add(delivery)
    session.commit()


def _load_connection(
    session: Session, event: NotificationEvent
) -> tuple[TenantIntegrationPlugin, dict, str, str]:
    try:
        enforce_module_enabled(session, event.tenant_id, "whatsapp")
    except HTTPException as exc:
        raise NotificationCancelled(
            "The tenant subscription no longer enables this integration."
        ) from exc
    row = get_tenant_plugin(session, event.tenant_id, "whatsapp")
    if not row or not row.enabled or not row.secret_ciphertext:
        raise NotificationCancelled("The tenant integration is disabled or incomplete.")
    config = decode_config(row.config_json)
    flows = WhatsAppFlowSettings.model_validate(config.get("flows") or {})
    flow_key = str(event.template_key or "")
    if not hasattr(flows, flow_key) or not getattr(flows, flow_key):
        raise NotificationCancelled("The notification flow is disabled.")
    is_doctor = flow_key in {
        "appointment_booked_doctor",
        "appointment_cancelled_doctor",
    }
    if not config.get(
        "doctor_notifications_enabled"
        if is_doctor
        else "patient_notifications_enabled",
        True,
    ):
        raise NotificationCancelled(
            "Notifications for this recipient type are disabled."
        )
    patient = None
    if not is_doctor:
        patient = patient_for_notification_resource(
            session,
            tenant_id=event.tenant_id,
            resource_type=event.resource_type or "",
            resource_id=event.resource_id or "",
        )
    campaign_name, _resolved_language = resolve_template_identifier(
        config,
        flow_key=flow_key,
        preferred_language=patient_notification_language(patient) if patient else None,
    )
    if not campaign_name:
        raise NotificationCancelled("The notification template identifier is missing.")
    return row, config, campaign_name, decrypt_credential(row.secret_ciphertext)


def _delivery_recipient(session: Session, event: NotificationEvent) -> str:
    if str(event.template_key or "").endswith("_doctor"):
        return event.recipient
    patient = patient_for_notification_resource(
        session,
        tenant_id=event.tenant_id,
        resource_type=event.resource_type or "",
        resource_id=event.resource_id or "",
    )
    integration = get_tenant_plugin(session, event.tenant_id, "whatsapp")
    config = decode_config(integration.config_json) if integration else {}
    recipient = patient_notification_destination(
        patient, str(config.get("default_country_code") or "+91")
    )
    if not recipient:
        raise NotificationCancelled(
            "The patient does not have a valid primary or alternate mobile number."
        )
    return recipient


def _save_result(
    session: Session,
    event: NotificationEvent,
    result: TemplateMessageResult,
) -> None:
    now = now_utc()
    event.attempt_count += 1
    event.processing_started_at = None
    event.updated_at = now
    event.provider_message_id = result.external_message_id
    if result.success:
        event.status = NotificationStatus.SENT
        event.failure_reason = None
        event.sent_at = now
    elif (
        result.status in RETRYABLE_STATUSES and event.attempt_count < event.max_attempts
    ):
        delay_seconds = min(60 * (5 ** (event.attempt_count - 1)), 3600)
        event.status = NotificationStatus.QUEUED
        event.failure_reason = result.message[:500]
        event.next_attempt_at = now + timedelta(seconds=delay_seconds)
    else:
        event.status = NotificationStatus.FAILED
        event.failure_reason = result.message[:500]
    session.add(event)
    delivery = session.exec(
        select(DocumentDelivery).where(
            DocumentDelivery.notification_event_id == event.id
        )
    ).first()
    if delivery:
        delivery.attempt_count = event.attempt_count
        delivery.provider_message_id = event.provider_message_id
        delivery.failure_reason = event.failure_reason
        delivery.processing_started_at = None
        delivery.updated_at = now
        delivery.sent_at = event.sent_at
        delivery.status = {
            NotificationStatus.SENT: DocumentDeliveryStatus.SENT,
            NotificationStatus.FAILED: DocumentDeliveryStatus.FAILED,
            NotificationStatus.CANCELLED: DocumentDeliveryStatus.CANCELLED,
        }.get(event.status, DocumentDeliveryStatus.QUEUED)
        session.add(delivery)
    session.commit()
    record_audit_event(
        session,
        tenant_id=event.tenant_id,
        branch_id=event.branch_id,
        action=(
            "notification.sent" if result.success else "notification.delivery_failed"
        ),
        resource_type="notification_event",
        resource_id=event.id,
        purpose="communication",
        metadata_json=(
            f'{{"flow_key": "{event.template_key}", "status": "{result.status}", '
            f'"attempt": {event.attempt_count}}}'
        ),
    )


def process_due_whatsapp_notifications(
    session: Session,
    *,
    limit: int = 10,
    gateway: TemplateMessageGateway | None = None,
) -> int:
    processed = 0
    sender = gateway or get_template_message_gateway()
    for _index in range(limit):
        event = _claim_next(session)
        if not event:
            break
        try:
            _row, config, campaign_name, api_key = _load_connection(session, event)
            recipient_name, values, media_url, media_filename = _message_values(
                session, event, config
            )
            destination = normalize_mobile_number(
                _delivery_recipient(session, event),
                str(config.get("default_country_code") or "+91"),
            )
            result = sender.send_template(
                api_url=str(config.get("api_url") or ""),
                api_key=api_key,
                campaign_name=campaign_name,
                destination=destination,
                recipient_name=recipient_name,
                template_parameters=values,
                timeout_seconds=int(config.get("timeout_seconds") or 15),
                media_url=media_url,
                media_filename=media_filename,
            )
            _save_result(session, event, result)
        except NotificationCancelled as exc:
            _cancel(session, event, str(exc))
        except NotificationRetryable as exc:
            _save_result(
                session,
                event,
                TemplateMessageResult(False, "send_failed", str(exc)),
            )
        except ValueError as exc:
            _save_result(
                session,
                event,
                TemplateMessageResult(False, "invalid_configuration", str(exc)),
            )
        except Exception:
            session.rollback()
            logger.exception(
                "Unexpected WhatsApp delivery error",
                extra={
                    "tenant_id": event.tenant_id,
                    "notification_id": event.id,
                    "flow_key": event.template_key,
                },
            )
            _save_result(
                session,
                event,
                TemplateMessageResult(
                    False,
                    "send_failed",
                    "An unexpected delivery error occurred.",
                ),
            )
        processed += 1
    return processed
