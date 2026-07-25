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
from app.modules.integrations.models import TenantIntegrationPlugin
from app.modules.integrations.invoice_receipts import (
    create_signed_invoice_receipt_url,
)
from app.modules.integrations.service import decode_config, get_tenant_plugin
from app.modules.integrations.whatsapp_gateway import (
    WhatsAppGateway,
    WhatsAppGatewayResult,
    normalize_whatsapp_number,
)
from app.modules.integrations.whatsapp_schemas import (
    WhatsAppFlowSettings,
)
from app.modules.integrations.whatsapp_templates import resolve_template_identifier
from app.modules.integrations.whatsapp_consent import (
    patient_allows_whatsapp,
    patient_for_notification_resource,
    patient_notification_language,
    patient_notification_mobile,
)
from app.modules.notifications.models import (
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
    session: Session, invoice: Invoice, public_base_url: str
) -> tuple[str, str]:
    row = session.exec(
        select(FileDocument)
        .where(
            FileDocument.tenant_id == invoice.tenant_id,
            FileDocument.attached_to_doctype == "Invoice",
            FileDocument.attached_to_name == invoice.id,
            FileDocument.attached_to_field == "invoice_pdf",
            FileDocument.is_active == True,  # noqa: E712
        )
        .order_by(FileDocument.created_at.desc())
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
    return (
        create_signed_invoice_receipt_url(
            public_base_url=public_base_url,
            tenant_id=invoice.tenant_id,
            invoice_id=invoice.id,
        ),
        f"invoice-{invoice.invoice_number}.pdf",
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
            session, invoice, str(config.get("public_media_base_url") or "")
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
        return (
            patient.full_name,
            [
                patient.full_name,
                order.lab_order_number or order.id,
                order.tests[:500],
            ],
            None,
            None,
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
    recipient = patient_notification_mobile(patient)
    if not recipient:
        raise NotificationCancelled(
            "The patient does not have a primary or alternate mobile number."
        )
    return recipient


def _save_result(
    session: Session,
    event: NotificationEvent,
    result: WhatsAppGatewayResult,
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
    gateway: WhatsAppGateway | None = None,
) -> int:
    processed = 0
    sender = gateway or WhatsAppGateway()
    for _index in range(limit):
        event = _claim_next(session)
        if not event:
            break
        try:
            _row, config, campaign_name, api_key = _load_connection(session, event)
            recipient_name, values, media_url, media_filename = _message_values(
                session, event, config
            )
            destination = normalize_whatsapp_number(
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
        except ValueError as exc:
            _save_result(
                session,
                event,
                WhatsAppGatewayResult(False, "invalid_configuration", str(exc)),
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
                WhatsAppGatewayResult(
                    False,
                    "send_failed",
                    "An unexpected delivery error occurred.",
                ),
            )
        processed += 1
    return processed
