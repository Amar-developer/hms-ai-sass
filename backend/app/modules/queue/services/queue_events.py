from sqlmodel import Session

from app.modules.appointments.models import (
    Appointment,
    AppointmentStatus,
    AppointmentType,
)
from app.modules.audit.service import record_audit_event
from app.modules.queue.models import QueueEntry, QueueEvent, QueuePriority
from app.modules.queue.services.token_numbering import (
    next_queue_position,
    next_token_number,
)
from app.modules.tenants.models import now_utc


def create_queue_entry_for_appointment(
    session: Session, appointment: Appointment
) -> QueueEntry:
    emergency = appointment.appointment_type == AppointmentType.EMERGENCY
    entry = QueueEntry(
        tenant_id=appointment.tenant_id,
        branch_id=appointment.branch_id,
        appointment_id=appointment.id,
        patient_id=appointment.patient_id,
        token_number=next_token_number(
            session,
            tenant_id=appointment.tenant_id,
            branch_id=appointment.branch_id,
            practitioner_id=appointment.practitioner_id,
            department_id=appointment.department_id,
            appointment_date=appointment.appointment_date,
            emergency=emergency,
        ),
        priority=QueuePriority.EMERGENCY if emergency else QueuePriority.NORMAL,
        priority_rank=1 if emergency else 2,
        queue_position=next_queue_position(
            session,
            tenant_id=appointment.tenant_id,
            branch_id=appointment.branch_id,
        ),
        status=AppointmentStatus.WAITING,
        created_by_user_id=appointment.created_by_user_id,
        updated_by_user_id=appointment.updated_by_user_id
        or appointment.created_by_user_id,
    )
    appointment.status = AppointmentStatus.WAITING
    appointment.updated_at = now_utc()
    appointment.updated_by_user_id = (
        appointment.updated_by_user_id or appointment.created_by_user_id
    )
    session.add(entry)
    session.add(appointment)
    session.commit()
    session.refresh(entry)
    session.refresh(appointment)
    # A newly booked emergency must be promoted ahead of normal waiting
    # tokens immediately, not only after the next queue action.
    from app.modules.queue.services.transitions import normalize_queue_positions

    normalize_queue_positions(
        session,
        tenant_id=entry.tenant_id,
        branch_id=entry.branch_id,
    )
    session.refresh(entry)
    record_queue_event(
        session,
        entry=entry,
        appointment=appointment,
        action="queue.entry.created",
        from_status=AppointmentStatus.SCHEDULED,
        to_status=AppointmentStatus.WAITING,
        reason="Appointment booked and added to queue",
    )
    return entry


def record_queue_event(
    session: Session,
    *,
    entry: QueueEntry,
    appointment: Appointment,
    action: str,
    from_status: AppointmentStatus | None,
    to_status: AppointmentStatus,
    reason: str | None = None,
    actor_user_id: str | None = None,
) -> QueueEvent:
    event = QueueEvent(
        tenant_id=entry.tenant_id,
        branch_id=entry.branch_id,
        queue_entry_id=entry.id,
        appointment_id=appointment.id,
        action=action,
        from_status=from_status,
        to_status=to_status,
        reason=reason,
        actor_user_id=actor_user_id,
        created_by_user_id=actor_user_id,
    )
    session.add(event)
    record_audit_event(
        session,
        tenant_id=entry.tenant_id,
        branch_id=entry.branch_id,
        actor_user_id=actor_user_id,
        action=action,
        resource_type="queue_entry",
        resource_id=entry.id,
        purpose="queue_management",
        metadata_json=f'{{"appointment_id": "{appointment.id}", "to_status": "{to_status.value}"}}',
        commit=False,
    )
    session.commit()
    session.refresh(event)
    return event
