from datetime import timedelta
from decimal import Decimal
import json
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
from app.modules.home_care.models import HomeCareBooking, HomeCareBookingItem
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
from app.modules.integrations.whatsapp_entity_fields import build_entity_context
from app.modules.integrations.whatsapp_field_catalog import (
    default_field_order,
    normalize_saved_field_order,
)
from app.modules.integrations.whatsapp_schemas import (
    WhatsAppCustomTemplateSettings,
    WhatsAppFlowSettings,
)
from app.modules.integrations.whatsapp_templates import (
    DEFAULT_WHATSAPP_LANGUAGE,
    resolve_template_identifier,
)
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
from app.modules.patient_intelligence.models import (
    EngagementActionStatus,
    PatientEngagementAction,
    PatientMetricSnapshot,
)
from app.modules.patient_subscriptions.models import (
    PatientSubscriptionEnrollment,
    PatientSubscriptionEnrollmentStatus,
    PatientSubscriptionPlan,
)
from app.modules.patient_subscriptions.services.reminder_summary import (
    available_membership_benefits_summary,
)
from app.modules.integrations.whatsapp_consent import patient_allows_engagement_whatsapp
from app.modules.practitioners.models import Practitioner
from app.modules.pharmacy.models import PharmacyIssue
from app.modules.queue.models import QueueEvent
from app.modules.subscriptions.service import enforce_module_enabled
from app.modules.tenants.models import Tenant, now_utc


PROCESSING_LEASE_MINUTES = 5
RETRYABLE_STATUSES = {"rate_limited", "service_unavailable", "send_failed"}
logger = logging.getLogger("medizinhub.whatsapp")


class NotificationCancelled(ValueError):
    pass


class NotificationRetryable(RuntimeError):
    pass


def _money(value: Decimal) -> str:
    return f"{value:.2f}".rstrip("0").rstrip(".")


def _tenant_scoped(session: Session, model, row_id, tenant_id):
    """Load a row only if it belongs to this tenant.

    Placeholder values are read straight off these rows, so a row from another
    tenant must never reach a message. Pass tenant_id=None for the Tenant row
    itself, whose id is the tenant.
    """
    if not row_id:
        return None
    row = session.get(model, row_id)
    if row is None:
        return None
    if tenant_id is not None and getattr(row, "tenant_id", None) != tenant_id:
        return None
    return row


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
    row = (
        session.get(FileDocument, event.artifact_file_id)
        if event.artifact_file_id
        else None
    )
    if row and not (
        row.tenant_id == event.tenant_id
        and row.document_status == "ready"
        and (
            event.artifact_version is None
            or row.document_version == event.artifact_version
        )
    ):
        row = None
    if not event.artifact_file_id:
        # Compatibility for notification rows queued before artifact pinning
        # existed (or any future caller that forgets to pin one) — same
        # fallback pattern _invoice_media() uses: resolve the latest ready
        # report document directly instead of silently sending with no
        # attachment (which the provider rejects for a document-type
        # template rather than failing loudly and actionably here).
        row = session.exec(
            select(FileDocument)
            .where(
                FileDocument.tenant_id == event.tenant_id,
                FileDocument.attached_to_doctype == "LabOrder",
                FileDocument.attached_to_name == event.resource_id,
                FileDocument.attached_to_field == "report_url",
                FileDocument.category == "lab_report",
                FileDocument.document_status == "ready",
                FileDocument.is_active == True,  # noqa: E712
            )
            .order_by(FileDocument.document_version.desc())
        ).first()
    if not row:
        raise NotificationCancelled(
            "The lab report document is missing. Upload the report before it"
            " can be sent."
        )
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


def _message_context(
    session: Session, event: NotificationEvent, config: dict
) -> tuple[str, dict[str, str], str | None, str | None, str | None]:
    """Build the named placeholder values available for this event's flow.

    Returns (recipient_full_name, context, media_url, media_filename,
    preferred_language). `context` is keyed by the field names declared in
    `FLOW_FIELD_CATALOG` for this flow — the built-in default parameter
    order and any custom-template override both read from this same dict,
    so a flow's available fields only need to be listed once.
    """
    language = None
    if event.template_key == "admin_daily_report":
        try:
            stored = json.loads(event.message or "{}")
        except (TypeError, ValueError) as exc:
            raise NotificationCancelled(
                "The saved daily report snapshot is invalid."
            ) from exc
        required = default_field_order("admin_daily_report")
        if not isinstance(stored, dict) or any(key not in stored for key in required):
            raise NotificationCancelled(
                "The saved daily report snapshot is incomplete."
            )
        recipient_name = str(stored.get("recipient_name") or "Tenant Admin")
        return (
            recipient_name,
            {key: str(stored[key]) for key in required},
            None,
            None,
            None,
        )
    if not str(event.template_key or "").endswith("_doctor"):
        patient = patient_for_notification_resource(
            session,
            tenant_id=event.tenant_id,
            resource_type=event.resource_type or "",
            resource_id=event.resource_id or "",
        )
        intelligence_engagement = event.resource_type == "patient_engagement_action"
        if intelligence_engagement and not patient_allows_engagement_whatsapp(patient):
            raise NotificationCancelled(
                "The patient has not explicitly opted in to engagement messages."
            )
        if not intelligence_engagement and not patient_allows_whatsapp(patient):
            raise NotificationCancelled(
                "The patient has opted out of WhatsApp communication."
            )
        language = patient_notification_language(patient) if patient else None
    if event.resource_type == "patient_engagement_action":
        action = session.get(PatientEngagementAction, event.resource_id or "")
        if not action or action.tenant_id != event.tenant_id:
            raise NotificationCancelled("The engagement action no longer exists.")
        if action.status in {
            EngagementActionStatus.CANCELLED,
            EngagementActionStatus.SUPPRESSED,
            EngagementActionStatus.FAILED,
        }:
            raise NotificationCancelled("The engagement action is no longer active.")
        patient = session.get(Patient, action.patient_id)
        if not patient or patient.tenant_id != event.tenant_id:
            raise NotificationCancelled("The engagement patient no longer exists.")
        tenant = session.get(Tenant, event.tenant_id)
        snapshot = session.exec(
            select(PatientMetricSnapshot).where(
                PatientMetricSnapshot.tenant_id == event.tenant_id,
                PatientMetricSnapshot.patient_id == patient.id,
            )
        ).first()
        membership = session.exec(
            select(PatientSubscriptionEnrollment)
            .where(
                PatientSubscriptionEnrollment.tenant_id == event.tenant_id,
                PatientSubscriptionEnrollment.patient_id == patient.id,
                PatientSubscriptionEnrollment.status
                == PatientSubscriptionEnrollmentStatus.ACTIVE,
            )
            .order_by(PatientSubscriptionEnrollment.ends_on.desc())
        ).first()
        membership_plan = (
            session.get(PatientSubscriptionPlan, membership.plan_id)
            if membership
            else None
        )
        membership_invoice = (
            session.get(Invoice, membership.purchase_invoice_id)
            if membership and membership.purchase_invoice_id
            else None
        )
        latest_pharmacy_issue = session.exec(
            select(PharmacyIssue)
            .where(
                PharmacyIssue.tenant_id == event.tenant_id,
                PharmacyIssue.patient_id == patient.id,
            )
            .order_by(PharmacyIssue.created_at.desc())
        ).first()
        latest_lab_order = session.exec(
            select(LabOrder)
            .where(
                LabOrder.tenant_id == event.tenant_id,
                LabOrder.patient_id == patient.id,
            )
            .order_by(LabOrder.created_at.desc())
        ).first()
        values = json.loads(action.personalization_json or "{}")
        entity_values = build_entity_context(
            action.template_key,
            {
                "patient": patient,
                "clinic": tenant,
                "intelligence": snapshot,
                "membership": membership,
                "membership_plan": membership_plan,
                "invoice": membership_invoice,
                "pharmacy_issue": latest_pharmacy_issue,
                "lab_order": latest_lab_order,
                "engagement_action": action,
            },
        )
        context = {
            **entity_values,
            "recipient_name": patient.full_name,
            "clinic_name": tenant.name if tenant else "",
            "action_key": action.action_key,
            "action_channel": action.channel,
            "action_template_key": action.template_key,
            "action_status": action.status.value,
            "action_reason": action.reason,
            **{str(key): str(value) for key, value in values.items()},
        }
        if (
            action.template_key == "unused_benefit_patient"
            and membership
            and membership_plan
        ):
            # Usage can change between action creation and delivery. Resolve the
            # remaining-benefits parameter again so the patient never receives
            # an already-consumed benefit in the monthly reminder.
            context["unused_benefits_summary"] = available_membership_benefits_summary(
                session,
                enrollment=membership,
                plan=membership_plan,
            )
        return patient.full_name, context, None, None, language
    if event.template_key in {
        "home_care_booking_patient",
        "home_visit_booking_patient",
    }:
        booking = session.get(HomeCareBooking, event.resource_id or "")
        if not booking or booking.tenant_id != event.tenant_id:
            raise NotificationCancelled("The home care booking no longer exists.")
        allowed_types = (
            {"home_visit"}
            if event.template_key == "home_visit_booking_patient"
            else {"home_care", "home_visit"}
        )
        if booking.booking_type not in allowed_types:
            raise NotificationCancelled(
                "The booking type does not match the notification flow."
            )
        patient = session.get(Patient, booking.patient_id)
        if not patient or patient.tenant_id != event.tenant_id:
            raise NotificationCancelled("The booking patient no longer exists.")
        tenant = session.get(Tenant, event.tenant_id)
        items = session.exec(
            select(HomeCareBookingItem)
            .where(
                HomeCareBookingItem.tenant_id == event.tenant_id,
                HomeCareBookingItem.booking_id == booking.id,
            )
            .order_by(HomeCareBookingItem.created_at, HomeCareBookingItem.id)
        ).all()
        service_description = ", ".join(
            dict.fromkeys(
                item.description.strip()
                for item in items
                if item.description and item.description.strip()
            )
        )
        if not service_description:
            service_description = booking.booking_type.replace("_", " ").title()
        end_date = booking.end_date or booking.start_date
        return (
            patient.full_name,
            {
                **build_entity_context(
                    event.template_key,
                    {
                        "patient": patient,
                        "clinic": tenant,
                        "home_care_booking": booking,
                    },
                ),
                "recipient_name": patient.full_name,
                "clinic_name": tenant.name if tenant else "",
                "service_description": service_description[:500],
                "booking_start_date": booking.start_date.strftime("%d %B %Y"),
                "booking_end_date": end_date.strftime("%d %B %Y"),
            },
            None,
            None,
            language,
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
        # Resolve every module row this flow can draw placeholders from, so a
        # template can reference any of their exposed fields (a patient's date
        # of birth, the doctor's specialty) without further code here.
        practitioner = _tenant_scoped(
            session, Practitioner, appointment.practitioner_id, event.tenant_id
        )
        appointment_patient = _tenant_scoped(
            session, Patient, appointment.patient_id, event.tenant_id
        )
        entity_context = build_entity_context(
            event.template_key,
            {
                "patient": appointment_patient,
                "appointment": appointment,
                "doctor": practitioner,
                "clinic": _tenant_scoped(session, Tenant, event.tenant_id, None),
            },
        )
        if event.template_key == "appointment_booked_doctor":
            appointment_view_url = str(config.get("appointment_view_url") or "").strip()
            if not appointment_view_url:
                raise NotificationCancelled("The doctor application URL is missing.")
            context = {
                "recipient_name": recipient.full_name,
                "appointment_status": "booked",
                "appointment_id": appointment.id,
                "appointment_date": appointment.appointment_date.strftime("%d %B %Y"),
                "appointment_time": appointment_time,
                "appointment_view_url": appointment_view_url,
            }
        else:
            # Approved patient templates commonly name the doctor and the
            # clinic ("Doctor: {{2}} ... Hospital/Clinic: {{5}}"), so keep flat
            # keys for those alongside the namespaced module fields — existing
            # saved templates reference the flat ones.
            clinic = _tenant_scoped(session, Tenant, event.tenant_id, None)
            context = {
                "recipient_name": recipient.full_name,
                "appointment_date": appointment.appointment_date.strftime("%d %B %Y"),
                "appointment_time": appointment_time,
                "doctor_name": practitioner.full_name if practitioner else "Doctor",
                "clinic_name": clinic.name if clinic else "",
                "appointment_id": appointment.id,
            }
        # Flat keys win on collision: they are what existing templates saved.
        context = {**entity_context, **context}
        if event.template_key.startswith("appointment_cancelled_"):
            cancellation = session.exec(
                select(QueueEvent)
                .where(
                    QueueEvent.appointment_id == appointment.id,
                    QueueEvent.to_status == "cancelled",
                )
                .order_by(QueueEvent.created_at.desc())
            ).first()
            context["cancellation_reason"] = (
                cancellation.reason
                if cancellation and cancellation.reason
                else "Cancelled"
            )
        return recipient.full_name, context, None, None, language
    if event.template_key in {"invoice_paid_patient", "payment_pending_patient"}:
        invoice = session.get(Invoice, event.resource_id or "")
        if not invoice or invoice.tenant_id != event.tenant_id:
            raise NotificationCancelled("The invoice no longer exists.")
        patient = session.get(Patient, invoice.patient_id)
        if not patient or patient.tenant_id != event.tenant_id:
            raise NotificationCancelled("The invoice patient no longer exists.")
        invoice_entities = build_entity_context(
            event.template_key,
            {
                "patient": patient,
                "invoice": invoice,
                "clinic": _tenant_scoped(session, Tenant, event.tenant_id, None),
            },
        )
        if event.template_key == "payment_pending_patient":
            return (
                patient.full_name,
                {
                    **invoice_entities,
                    "recipient_name": patient.full_name,
                    "invoice_number": invoice.invoice_number,
                    "paid_amount": _money(invoice.paid_amount),
                    "balance_amount": _money(invoice.balance_amount),
                },
                None,
                None,
                language,
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
            {
                **invoice_entities,
                "recipient_name": patient.full_name,
                "invoice_number": invoice.invoice_number,
                "service_description": service[:500] or "Healthcare services",
                "total_amount": _money(invoice.total_amount),
            },
            media_url,
            media_filename,
            language,
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
            {
                "recipient_name": patient.full_name,
                "invoice_number": invoice.invoice_number,
                "refund_amount": _money(credit.amount),
            },
            None,
            None,
            language,
        )
    if event.template_key == "lab_report_ready_patient":
        order = session.get(LabOrder, event.resource_id or "")
        if not order or order.tenant_id != event.tenant_id:
            raise NotificationCancelled("The lab order no longer exists.")
        patient = session.get(Patient, order.patient_id)
        if not patient or patient.tenant_id != event.tenant_id:
            raise NotificationCancelled("The lab patient no longer exists.")
        tenant = session.get(Tenant, event.tenant_id)
        media_url, media_filename = _artifact_media(
            session, event, str(config.get("public_media_base_url") or "")
        )
        report_date = order.result_ready_at or order.created_at
        return (
            patient.full_name,
            {
                **build_entity_context(
                    event.template_key,
                    {"patient": patient, "clinic": tenant, "lab_order": order},
                ),
                "recipient_name": patient.full_name,
                "report_name": order.tests[:500],
                "clinic_name": tenant.name if tenant else "",
                "report_date": report_date.strftime("%d %B %Y"),
            },
            media_url,
            media_filename,
            language,
        )
    if event.template_key in {"prescription_ready_patient", "follow_up_advice_patient"}:
        consultation = session.get(Consultation, event.resource_id or "")
        if not consultation or consultation.tenant_id != event.tenant_id:
            raise NotificationCancelled("The consultation no longer exists.")
        patient = session.get(Patient, consultation.patient_id)
        if not patient or patient.tenant_id != event.tenant_id:
            raise NotificationCancelled("The consultation patient no longer exists.")
        if event.template_key == "follow_up_advice_patient":
            practitioner = session.get(Practitioner, consultation.practitioner_id or "")
            return (
                patient.full_name,
                {
                    **build_entity_context(
                        event.template_key,
                        {
                            "patient": patient,
                            "doctor": practitioner,
                            "clinic": _tenant_scoped(
                                session, Tenant, event.tenant_id, None
                            ),
                            "consultation": consultation,
                        },
                    ),
                    "recipient_name": patient.full_name,
                    "follow_up_advice": consultation.follow_up_advice
                    or "Follow up as advised",
                },
                None,
                None,
                language,
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
            {
                **build_entity_context(
                    event.template_key,
                    {
                        "patient": patient,
                        "doctor": practitioner,
                        "clinic": _tenant_scoped(
                            session, Tenant, event.tenant_id, None
                        ),
                        "consultation": consultation,
                    },
                ),
                "recipient_name": patient.full_name,
                "consultation_date": consultation_date,
                "doctor_name": practitioner.full_name if practitioner else "Doctor",
            },
            None,
            None,
            language,
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
    if event.resource_type == "patient_engagement_action":
        action = session.get(PatientEngagementAction, event.resource_id or "")
        if action and action.tenant_id == event.tenant_id:
            action.status = EngagementActionStatus.CANCELLED
            action.reason = reason[:1000]
            action.updated_at = now_utc()
            session.add(action)
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
) -> tuple[TenantIntegrationPlugin, dict]:
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
    if flow_key != "admin_daily_report" and not config.get(
        "doctor_notifications_enabled"
        if is_doctor
        else "patient_notifications_enabled",
        True,
    ):
        raise NotificationCancelled(
            "Notifications for this recipient type are disabled."
        )
    return row, config


def _select_custom_template_override(
    config: dict, *, flow_key: str
) -> WhatsAppCustomTemplateSettings | None:
    for item in config.get("custom_templates") or []:
        template = WhatsAppCustomTemplateSettings.model_validate(item)
        if template.enabled and template.trigger_key == flow_key:
            return template
    return None


def _resolve_campaign_and_params(
    config: dict,
    *,
    flow_key: str,
    preferred_language: str | None,
    context: dict[str, str],
) -> tuple[str, list[str]]:
    """Pick the campaign identifier + ordered parameter values to send.

    An enabled custom template attached to this trigger takes precedence
    over the flow's built-in identifier/parameter order — it fully
    redefines how this trigger sends, so the two are mutually exclusive per
    trigger (enforced by `WhatsAppIntegrationUpdate.unique_custom_templates`
    at save time).
    """
    override = _select_custom_template_override(config, flow_key=flow_key)
    if override:
        default_language = str(
            config.get("default_language") or DEFAULT_WHATSAPP_LANGUAGE
        )
        requested_language = str(preferred_language or default_language)
        campaign_name = (
            override.identifiers.get(requested_language)
            or override.identifiers.get(default_language)
            or next(iter(override.identifiers.values()), "")
        )
        if not campaign_name:
            raise NotificationCancelled(
                f"The custom template '{override.name}' has no template"
                " identifier for this language."
            )
        return campaign_name, [context.get(field, "") for field in override.parameters]

    campaign_name, _resolved_language = resolve_template_identifier(
        config,
        flow_key=flow_key,
        preferred_language=preferred_language,
    )
    if not campaign_name:
        raise NotificationCancelled("The notification template identifier is missing.")
    configured_fields = normalize_saved_field_order(
        flow_key,
        (config.get("template_field_mappings") or {}).get(flow_key),
    ) or default_field_order(flow_key)
    return campaign_name, [context.get(field, "") for field in configured_fields]


def _delivery_recipient(session: Session, event: NotificationEvent) -> str:
    if event.template_key == "admin_daily_report":
        return event.recipient
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
            "The patient does not have a valid primary, secondary, or legacy guardian mobile number."
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
    if event.resource_type == "patient_engagement_action":
        action = session.get(PatientEngagementAction, event.resource_id or "")
        if action and action.tenant_id == event.tenant_id:
            action.status = (
                EngagementActionStatus.SENT
                if result.success
                else (
                    EngagementActionStatus.QUEUED
                    if event.status == NotificationStatus.QUEUED
                    else EngagementActionStatus.FAILED
                )
            )
            action.reason = event.failure_reason or action.reason
            action.updated_at = now
            session.add(action)
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
            row, config = _load_connection(session, event)
            recipient_name, context, media_url, media_filename, language = (
                _message_context(session, event, config)
            )
            campaign_name, values = _resolve_campaign_and_params(
                config,
                flow_key=str(event.template_key or ""),
                preferred_language=language,
                context=context,
            )
            api_key = decrypt_credential(row.secret_ciphertext)
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
