from sqlmodel import Session

from app.modules.appointments.models import AppointmentStatus
from app.modules.identity.models import User
from app.modules.notifications.models import NotificationEventType, NotificationProvider
from app.modules.notifications.service import (
    queue_notification_if_allowed,
    queue_sms_template_if_allowed,
    queue_whatsapp_template_if_allowed,
)
from app.modules.patients.models import Patient
from app.modules.practitioners.models import Practitioner
from app.modules.notifications.services.in_app import notify_appointment_status
from app.modules.queue.models import QueueEntry
from app.modules.queue.services.display import token_call_message, token_language
from app.modules.queue.services.queries import authorize_entry
from app.modules.queue.services.transitions import (
    enforce_no_show_threshold,
    requeue_entry,
    sync_transition,
)


def call_token(
    session: Session,
    *,
    tenant_id: str,
    entry_id: str,
    reason: str | None,
    actor_user_id: str | None,
    actor: User,
) -> QueueEntry:
    entry, appointment = authorize_entry(
        session, tenant_id=tenant_id, entry_id=entry_id, actor=actor
    )
    updated = sync_transition(
        session,
        entry=entry,
        appointment=appointment,
        to_status=AppointmentStatus.CALLED,
        action="queue.token_called",
        reason=reason,
        actor_user_id=actor_user_id,
    )
    language = token_language(session, tenant_id, updated.branch_id)
    queue_notification_if_allowed(
        session,
        tenant_id=tenant_id,
        branch_id=updated.branch_id,
        provider=NotificationProvider.VOICE,
        event_type=NotificationEventType.QUEUE_TOKEN_CALL,
        recipient=f"branch:{updated.branch_id}:speaker",
        subject="Token call",
        message=token_call_message(updated.token_number, language),
        resource_type="queue_entry",
        resource_id=updated.id,
        queued_by_user_id=actor_user_id,
    )
    patient = session.get(Patient, appointment.patient_id)
    queue_sms_template_if_allowed(
        session,
        tenant_id=tenant_id,
        branch_id=updated.branch_id,
        flow_key="queue_token_alert_patient",
        patient=patient,
        resource_type="queue_entry",
        resource_id=updated.id,
        dedupe_key=f"sms:queue_entry:{updated.id}:called",
        variables={
            "patient_name": patient.full_name if patient else "",
            "token_number": updated.token_number,
        },
        queued_by_user_id=actor_user_id,
    )
    return updated


def mark_not_available(
    session: Session,
    *,
    tenant_id: str,
    entry_id: str,
    reason: str | None,
    actor_user_id: str | None,
    actor: User,
) -> QueueEntry:
    entry, appointment = authorize_entry(
        session, tenant_id=tenant_id, entry_id=entry_id, actor=actor
    )
    updated = sync_transition(
        session,
        entry=entry,
        appointment=appointment,
        to_status=AppointmentStatus.PATIENT_NOT_AVAILABLE,
        action="queue.patient_not_available",
        reason=reason,
        actor_user_id=actor_user_id,
    )
    notify_appointment_status(
        session,
        appointment=appointment,
        token_number=updated.token_number,
        status_value="patient_not_available",
        actor_user_id=actor.id,
        reason=reason,
    )
    return updated


def requeue(
    session: Session,
    *,
    tenant_id: str,
    entry_id: str,
    reason: str | None,
    actor_user_id: str | None,
    place_at_end: bool,
    actor: User,
) -> QueueEntry:
    entry, appointment = authorize_entry(
        session, tenant_id=tenant_id, entry_id=entry_id, actor=actor
    )
    updated = requeue_entry(
        session,
        entry=entry,
        appointment=appointment,
        reason=reason,
        actor_user_id=actor_user_id,
        place_at_end=place_at_end,
    )
    notify_appointment_status(
        session,
        appointment=appointment,
        token_number=updated.token_number,
        status_value="requeued",
        actor_user_id=actor.id,
        reason=reason,
    )
    return updated


def cancel(
    session: Session,
    *,
    tenant_id: str,
    entry_id: str,
    reason: str | None,
    actor_user_id: str | None,
    actor: User,
) -> QueueEntry:
    entry, appointment = authorize_entry(
        session, tenant_id=tenant_id, entry_id=entry_id, actor=actor
    )
    updated = sync_transition(
        session,
        entry=entry,
        appointment=appointment,
        to_status=AppointmentStatus.CANCELLED,
        action="appointment.cancelled",
        reason=reason,
        actor_user_id=actor_user_id,
    )
    notify_appointment_status(
        session,
        appointment=appointment,
        token_number=updated.token_number,
        status_value="cancelled",
        actor_user_id=actor.id,
        reason=reason,
    )
    patient = session.get(Patient, appointment.patient_id)
    queue_whatsapp_template_if_allowed(
        session,
        tenant_id=tenant_id,
        branch_id=updated.branch_id,
        flow_key="appointment_cancelled_patient",
        recipient=patient.mobile if patient else None,
        resource_type="appointment",
        resource_id=appointment.id,
        dedupe_key=f"whatsapp:appointment:{appointment.id}:cancelled:patient",
        queued_by_user_id=actor_user_id,
    )
    queue_sms_template_if_allowed(
        session,
        tenant_id=tenant_id,
        branch_id=updated.branch_id,
        flow_key="appointment_cancelled_patient",
        patient=patient,
        resource_type="appointment",
        resource_id=appointment.id,
        dedupe_key=f"sms:appointment:{appointment.id}:cancelled",
        variables={
            "patient_name": patient.full_name if patient else "",
            "token_number": updated.token_number,
        },
        queued_by_user_id=actor_user_id,
    )
    practitioner = (
        session.get(Practitioner, appointment.practitioner_id)
        if appointment.practitioner_id
        else None
    )
    queue_whatsapp_template_if_allowed(
        session,
        tenant_id=tenant_id,
        branch_id=updated.branch_id,
        flow_key="appointment_cancelled_doctor",
        recipient=practitioner.mobile if practitioner else None,
        resource_type="appointment",
        resource_id=appointment.id,
        dedupe_key=f"whatsapp:appointment:{appointment.id}:cancelled:doctor",
        queued_by_user_id=actor_user_id,
    )
    return updated


def mark_no_show(
    session: Session,
    *,
    tenant_id: str,
    entry_id: str,
    reason: str | None,
    actor_user_id: str | None,
    actor: User,
) -> QueueEntry:
    entry, appointment = authorize_entry(
        session, tenant_id=tenant_id, entry_id=entry_id, actor=actor
    )
    enforce_no_show_threshold(session, entry)
    updated = sync_transition(
        session,
        entry=entry,
        appointment=appointment,
        to_status=AppointmentStatus.NO_SHOW,
        action="appointment.no_show",
        reason=reason,
        actor_user_id=actor_user_id,
    )
    notify_appointment_status(
        session,
        appointment=appointment,
        token_number=updated.token_number,
        status_value="no_show",
        actor_user_id=actor.id,
        reason=reason,
    )
    return updated


def start_consultation(
    session: Session,
    *,
    tenant_id: str,
    entry_id: str,
    reason: str | None,
    actor_user_id: str | None,
    actor: User,
) -> QueueEntry:
    entry, appointment = authorize_entry(
        session, tenant_id=tenant_id, entry_id=entry_id, actor=actor
    )
    return sync_transition(
        session,
        entry=entry,
        appointment=appointment,
        to_status=AppointmentStatus.IN_CONSULTATION,
        action="consultation.started",
        reason=reason,
        actor_user_id=actor_user_id,
    )
