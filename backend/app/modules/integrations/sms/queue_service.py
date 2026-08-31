"""Administrative operations over the SMS outbox.

Rows are exposed with the recipient masked and no message body: an operator
needs to see whether a message moved, not what it said.
"""

import json
import re
from datetime import date, datetime, time, timedelta, timezone

from fastapi import HTTPException, status
from sqlalchemy import func, or_
from sqlmodel import Session, select

from app.modules.appointments.models import Appointment
from app.modules.audit.service import record_audit_event
from app.modules.billing.models import Invoice
from app.modules.consultations.models import Consultation
from app.modules.identity.models import User
from app.modules.integrations.service import get_tenant_plugin
from app.modules.integrations.sms.schemas import (
    SmsQueueCounts,
    SmsQueueItemRead,
    SmsQueueListRead,
)
from app.modules.integrations.sms.service import PLUGIN_KEY, get_sms_settings_model
from app.modules.integrations.sms.usage import enforce_sms_limits
from app.modules.lab.models import LabOrder
from app.modules.notifications.models import (
    NotificationEvent,
    NotificationProvider,
    NotificationStatus,
)
from app.modules.patients.models import Patient
from app.modules.subscriptions.service import enforce_module_enabled
from app.modules.tenants.models import now_utc


ALLOWED_STATUS_FILTERS = {item.value for item in NotificationStatus} | {"processing"}


def _enforce_access(session: Session, tenant_id: str) -> None:
    enforce_module_enabled(session, tenant_id, PLUGIN_KEY)


def _masked_recipient(value: str) -> str:
    digits = re.sub(r"\D", "", value or "")
    return f"••••{digits[-4:]}" if digits else "Unavailable"


def _date_bounds(from_date: date | None, to_date: date | None):
    start = (
        datetime.combine(from_date, time.min, tzinfo=timezone.utc)
        if from_date
        else None
    )
    end = (
        datetime.combine(to_date + timedelta(days=1), time.min, tzinfo=timezone.utc)
        if to_date
        else None
    )
    return start, end


def _base_filters(
    *,
    tenant_id: str,
    flow_key: str | None,
    q: str | None,
    from_date: date | None,
    to_date: date | None,
):
    filters = [
        NotificationEvent.tenant_id == tenant_id,
        NotificationEvent.provider == NotificationProvider.SMS,
        NotificationEvent.template_key.is_not(None),
    ]
    if flow_key:
        filters.append(NotificationEvent.template_key == flow_key)
    start, end = _date_bounds(from_date, to_date)
    if start:
        filters.append(NotificationEvent.created_at >= start)
    if end:
        filters.append(NotificationEvent.created_at < end)
    query = str(q or "").strip()
    if query:
        pattern = f"%{query.lower()}%"
        matching_patients = select(Patient.id).where(
            Patient.tenant_id == tenant_id,
            func.lower(Patient.full_name).like(pattern),
        )
        matching_appointments = select(Appointment.id).where(
            Appointment.tenant_id == tenant_id,
            Appointment.patient_id.in_(matching_patients),
        )
        matching_invoices = select(Invoice.id).where(
            Invoice.tenant_id == tenant_id,
            or_(
                Invoice.patient_id.in_(matching_patients),
                func.lower(Invoice.invoice_number).like(pattern),
            ),
        )
        matching_lab_orders = select(LabOrder.id).where(
            LabOrder.tenant_id == tenant_id,
            LabOrder.patient_id.in_(matching_patients),
        )
        matching_consultations = select(Consultation.id).where(
            Consultation.tenant_id == tenant_id,
            Consultation.patient_id.in_(matching_patients),
        )
        filters.append(
            or_(
                func.lower(NotificationEvent.recipient).like(pattern),
                func.lower(NotificationEvent.resource_id).like(pattern),
                NotificationEvent.resource_id.in_(matching_appointments),
                NotificationEvent.resource_id.in_(matching_invoices),
                NotificationEvent.resource_id.in_(matching_lab_orders),
                NotificationEvent.resource_id.in_(matching_consultations),
            )
        )
    return filters


def _display_context(
    session: Session, event: NotificationEvent
) -> tuple[str, str | None]:
    if event.resource_type == "appointment":
        appointment = session.get(Appointment, event.resource_id or "")
        if appointment and appointment.tenant_id == event.tenant_id:
            patient = session.get(Patient, appointment.patient_id)
            return (
                patient.full_name if patient else "Unknown patient",
                appointment.appointment_date.strftime("%d %b %Y"),
            )
    if event.resource_type == "invoice":
        invoice = session.get(Invoice, event.resource_id or "")
        if invoice and invoice.tenant_id == event.tenant_id:
            patient = session.get(Patient, invoice.patient_id)
            return (
                patient.full_name if patient else "Unknown patient",
                invoice.invoice_number,
            )
    if event.resource_type == "lab_order":
        order = session.get(LabOrder, event.resource_id or "")
        if order and order.tenant_id == event.tenant_id:
            patient = session.get(Patient, order.patient_id)
            return (
                patient.full_name if patient else "Unknown patient",
                order.lab_order_number or order.id,
            )
    if event.resource_type == "consultation":
        consultation = session.get(Consultation, event.resource_id or "")
        if consultation and consultation.tenant_id == event.tenant_id:
            patient = session.get(Patient, consultation.patient_id)
            return (
                patient.full_name if patient else "Unknown patient",
                consultation.created_at.strftime("%d %b %Y"),
            )
    if event.resource_type == "patient":
        patient = session.get(Patient, event.resource_id or "")
        if patient and patient.tenant_id == event.tenant_id:
            return patient.full_name, None
    return "Unknown recipient", event.resource_id


def _read_item(session: Session, event: NotificationEvent) -> SmsQueueItemRead:
    recipient_name, reference = _display_context(session, event)
    display_status = (
        "processing"
        if event.status == NotificationStatus.QUEUED and event.processing_started_at
        else event.status.value
    )
    return SmsQueueItemRead(
        id=event.id,
        flow_key=str(event.template_key or ""),
        recipient_name=recipient_name,
        recipient_masked=_masked_recipient(event.recipient),
        status=display_status,
        delivery_status=event.delivery_status,
        provider_status=event.provider_status,
        resource_type=event.resource_type,
        resource_reference=reference,
        sender_id=event.sender_id,
        segment_count=event.segment_count,
        attempt_count=event.attempt_count,
        max_attempts=event.max_attempts,
        next_attempt_at=(
            event.next_attempt_at.isoformat() if display_status == "queued" else None
        ),
        failure_reason=event.failure_reason,
        created_at=event.created_at.isoformat(),
        sent_at=event.sent_at.isoformat() if event.sent_at else None,
        delivered_at=event.delivered_at.isoformat() if event.delivered_at else None,
    )


def list_sms_queue(
    session: Session,
    *,
    tenant_id: str,
    status_filter: str | None = None,
    flow_key: str | None = None,
    q: str | None = None,
    from_date: date | None = None,
    to_date: date | None = None,
    limit: int = 20,
    offset: int = 0,
) -> SmsQueueListRead:
    _enforce_access(session, tenant_id)
    if status_filter and status_filter not in ALLOWED_STATUS_FILTERS:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Invalid notification status filter",
        )
    if from_date and to_date and from_date > to_date:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="From date cannot be after to date",
        )
    filters = _base_filters(
        tenant_id=tenant_id,
        flow_key=flow_key,
        q=q,
        from_date=from_date,
        to_date=to_date,
    )
    count_rows = session.exec(
        select(NotificationEvent.status, func.count())
        .where(*filters)
        .group_by(NotificationEvent.status)
    ).all()
    counts = {
        str(row[0].value if isinstance(row[0], NotificationStatus) else row[0]): int(
            row[1]
        )
        for row in count_rows
    }
    processing_count = int(
        session.exec(
            select(func.count())
            .select_from(NotificationEvent)
            .where(
                *filters,
                NotificationEvent.status == NotificationStatus.QUEUED,
                NotificationEvent.processing_started_at.is_not(None),
            )
        ).one()
    )
    counts["queued"] = max(counts.get("queued", 0) - processing_count, 0)
    item_filters = list(filters)
    if status_filter == "processing":
        item_filters.extend(
            [
                NotificationEvent.status == NotificationStatus.QUEUED,
                NotificationEvent.processing_started_at.is_not(None),
            ]
        )
    elif status_filter == "queued":
        item_filters.extend(
            [
                NotificationEvent.status == NotificationStatus.QUEUED,
                NotificationEvent.processing_started_at.is_(None),
            ]
        )
    elif status_filter:
        item_filters.append(NotificationEvent.status == status_filter)
    total = int(
        session.exec(
            select(func.count()).select_from(NotificationEvent).where(*item_filters)
        ).one()
    )
    rows = session.exec(
        select(NotificationEvent)
        .where(*item_filters)
        .order_by(NotificationEvent.created_at.desc())
        .offset(offset)
        .limit(limit)
    ).all()
    return SmsQueueListRead(
        items=[_read_item(session, row) for row in rows],
        total=total,
        limit=limit,
        offset=offset,
        counts=SmsQueueCounts(
            queued=counts.get("queued", 0),
            processing=processing_count,
            sent=counts.get("sent", 0),
            failed=counts.get("failed", 0),
            cancelled=counts.get("cancelled", 0),
        ),
    )


def _get_queue_event(session: Session, tenant_id: str, event_id: str):
    event = session.get(NotificationEvent, event_id)
    if (
        not event
        or event.tenant_id != tenant_id
        or event.provider != NotificationProvider.SMS
        or not event.template_key
    ):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="SMS notification not found"
        )
    return event


def retry_sms_notification(
    session: Session, *, tenant_id: str, event_id: str, actor: User
) -> SmsQueueItemRead:
    _enforce_access(session, tenant_id)
    event = _get_queue_event(session, tenant_id, event_id)
    if event.status not in {NotificationStatus.FAILED, NotificationStatus.CANCELLED}:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Only failed or cancelled SMS can be retried",
        )
    # A message the handset actually rejected will be rejected again; retrying
    # it only burns segments and, for a DND block, breaches the regulator rule.
    if event.delivery_status in {"blocked", "rejected"}:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "This SMS was blocked or rejected by the operator and cannot be "
                "retried to the same number"
            ),
        )
    integration = get_tenant_plugin(session, tenant_id, PLUGIN_KEY)
    if not integration or not integration.enabled:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Enable the tenant SMS integration before retrying",
        )
    settings = get_sms_settings_model(session, tenant_id=tenant_id)
    enforce_sms_limits(
        session, tenant_id=tenant_id, segments=int(event.segment_count or 1)
    )
    event.status = NotificationStatus.QUEUED
    event.attempt_count = 0
    event.max_attempts = settings.max_attempts
    event.next_attempt_at = now_utc()
    event.processing_started_at = None
    event.failure_reason = None
    event.provider_message_id = None
    event.provider_status = None
    event.provider_error_code = None
    event.delivery_status = None
    event.sent_at = None
    event.accepted_at = None
    event.delivered_at = None
    event.callback_updated_at = None
    event.updated_at = now_utc()
    session.add(event)
    session.commit()
    session.refresh(event)
    record_audit_event(
        session,
        tenant_id=tenant_id,
        branch_id=event.branch_id,
        actor_user_id=actor.id,
        action="notification.retry_requested",
        resource_type="notification_event",
        resource_id=event.id,
        purpose="communication_operations",
        metadata_json=json.dumps({"channel": "sms", "flow_key": event.template_key}),
    )
    return _read_item(session, event)


def cancel_sms_notification(
    session: Session, *, tenant_id: str, event_id: str, actor: User
) -> SmsQueueItemRead:
    _enforce_access(session, tenant_id)
    event = _get_queue_event(session, tenant_id, event_id)
    if event.status != NotificationStatus.QUEUED or event.processing_started_at:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Only queued SMS that are not processing can be cancelled",
        )
    event.status = NotificationStatus.CANCELLED
    event.failure_reason = "Cancelled by an administrator."
    event.updated_at = now_utc()
    session.add(event)
    session.commit()
    session.refresh(event)
    record_audit_event(
        session,
        tenant_id=tenant_id,
        branch_id=event.branch_id,
        actor_user_id=actor.id,
        action="notification.cancelled",
        resource_type="notification_event",
        resource_id=event.id,
        purpose="communication_operations",
        metadata_json=json.dumps({"channel": "sms", "flow_key": event.template_key}),
    )
    return _read_item(session, event)


# SMS integration domain package.
