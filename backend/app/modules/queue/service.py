from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy import func
from sqlmodel import Session, select

from app.modules.appointments.models import (
    Appointment,
    AppointmentStatus,
    AppointmentType,
)
from app.modules.audit.service import record_audit_event
from app.modules.queue.models import QueueEntry, QueueEvent, QueuePriority
from app.modules.settings.models import SettingKey
from app.modules.settings.service import resolve_setting
from app.modules.tenants.models import now_utc


TERMINAL_STATUSES = {
    AppointmentStatus.CANCELLED,
    AppointmentStatus.NO_SHOW,
    AppointmentStatus.BILLED,
    AppointmentStatus.CONSULTATION_COMPLETED,
}


def next_token_number(
    session: Session,
    *,
    tenant_id: str,
    branch_id: str,
    practitioner_id: str | None,
    department_id: str | None,
    appointment_date,
    emergency: bool,
) -> str:
    statement = (
        select(func.count())
        .select_from(QueueEntry)
        .join(Appointment, Appointment.id == QueueEntry.appointment_id)
        .where(QueueEntry.tenant_id == tenant_id, QueueEntry.branch_id == branch_id)
        .where(Appointment.appointment_date == appointment_date)
        .where(
            QueueEntry.priority
            == (QueuePriority.EMERGENCY if emergency else QueuePriority.NORMAL)
        )
    )
    if practitioner_id:
        statement = statement.where(Appointment.practitioner_id == practitioner_id)
    elif department_id:
        statement = statement.where(Appointment.department_id == department_id)
    count = session.exec(statement).one()
    if emergency:
        return f"E-{count + 1:03d}"
    return f"N-{count + 1:03d}"


def next_queue_position(session: Session, *, tenant_id: str, branch_id: str) -> int:
    current_max = session.exec(
        select(func.max(QueueEntry.queue_position)).where(
            QueueEntry.tenant_id == tenant_id,
            QueueEntry.branch_id == branch_id,
        )
    ).one()
    return int(current_max or 0) + 1


def queue_position_after_offset(
    session: Session,
    *,
    tenant_id: str,
    branch_id: str,
    current_position: int,
    offset: int,
) -> int:
    max_position = next_queue_position(
        session, tenant_id=tenant_id, branch_id=branch_id
    )
    return min(current_position + max(offset, 1), max_position)


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
    )
    appointment.status = AppointmentStatus.WAITING
    appointment.updated_at = now_utc()
    session.add(entry)
    session.add(appointment)
    session.commit()
    session.refresh(entry)
    session.refresh(appointment)
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


def sync_transition(
    session: Session,
    *,
    entry: QueueEntry,
    appointment: Appointment,
    to_status: AppointmentStatus,
    action: str,
    reason: str | None = None,
    actor_user_id: str | None = None,
) -> QueueEntry:
    if entry.status in TERMINAL_STATUSES:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Queue entry is already {entry.status.value}",
        )
    from_status = entry.status
    now = datetime.now(timezone.utc)
    entry.status = to_status
    entry.updated_at = now
    appointment.status = to_status
    appointment.updated_at = now
    if to_status == AppointmentStatus.CALLED:
        entry.called_at = now
    if to_status in {
        AppointmentStatus.CONSULTATION_COMPLETED,
        AppointmentStatus.BILLED,
        AppointmentStatus.CANCELLED,
        AppointmentStatus.NO_SHOW,
    }:
        entry.completed_at = now
    if to_status == AppointmentStatus.PATIENT_NOT_AVAILABLE:
        entry.missed_call_count += 1

    session.add(entry)
    session.add(appointment)
    session.commit()
    session.refresh(entry)
    session.refresh(appointment)
    record_queue_event(
        session,
        entry=entry,
        appointment=appointment,
        action=action,
        from_status=from_status,
        to_status=to_status,
        reason=reason,
        actor_user_id=actor_user_id,
    )
    return entry


def requeue_entry(
    session: Session,
    *,
    entry: QueueEntry,
    appointment: Appointment,
    reason: str | None = None,
    actor_user_id: str | None = None,
    place_at_end: bool = True,
) -> QueueEntry:
    if entry.status in TERMINAL_STATUSES:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Queue entry is already {entry.status.value}",
        )
    from_status = entry.status
    entry.status = AppointmentStatus.REQUEUED
    appointment.status = AppointmentStatus.REQUEUED
    if place_at_end:
        entry.queue_position = next_queue_position(
            session,
            tenant_id=entry.tenant_id,
            branch_id=entry.branch_id,
        )
    else:
        offset, _scope, _scope_id = resolve_setting(
            session,
            tenant_id=entry.tenant_id,
            module="queue",
            key=SettingKey.QUEUE_REQUEUE_AFTER_PATIENTS,
            branch_id=entry.branch_id,
        )
        entry.queue_position = queue_position_after_offset(
            session,
            tenant_id=entry.tenant_id,
            branch_id=entry.branch_id,
            current_position=entry.queue_position,
            offset=int(offset or 1),
        )
    entry.updated_at = now_utc()
    appointment.updated_at = now_utc()
    session.add(entry)
    session.add(appointment)
    session.commit()
    session.refresh(entry)
    session.refresh(appointment)
    record_queue_event(
        session,
        entry=entry,
        appointment=appointment,
        action="queue.patient_requeued",
        from_status=from_status,
        to_status=AppointmentStatus.REQUEUED,
        reason=reason,
        actor_user_id=actor_user_id,
    )
    return entry


def enforce_no_show_threshold(session: Session, entry: QueueEntry) -> None:
    threshold, _scope, _scope_id = resolve_setting(
        session,
        tenant_id=entry.tenant_id,
        module="queue",
        key=SettingKey.QUEUE_AUTO_NO_SHOW_AFTER_MISSED_CALLS,
        branch_id=entry.branch_id,
    )
    required = int(threshold or 1)
    if entry.missed_call_count < required:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"No-show requires at least {required} missed calls",
        )
