from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlmodel import Session

from app.modules.appointments.models import Appointment, AppointmentStatus
from app.modules.queue.models import QueueEntry
from app.modules.queue.services.queue_events import record_queue_event
from app.modules.queue.services.token_numbering import (
    next_queue_position,
    queue_position_after_offset,
)
from app.modules.settings.models import SettingKey
from app.modules.settings.service import resolve_setting
from app.modules.tenants.models import now_utc

TERMINAL_STATUSES = {
    AppointmentStatus.CANCELLED,
    AppointmentStatus.NO_SHOW,
    AppointmentStatus.BILLED,
    AppointmentStatus.CONSULTATION_COMPLETED,
}


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
