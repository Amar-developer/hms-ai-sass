from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlmodel import Session, select

from app.modules.appointments.models import Appointment, AppointmentStatus
from app.modules.queue.models import QueueEntry
from app.modules.queue.services.queue_events import record_queue_event
from app.modules.settings.models import SettingKey
from app.modules.settings.service import resolve_setting
from app.modules.tenants.models import now_utc

TERMINAL_STATUSES = {
    AppointmentStatus.CANCELLED,
    AppointmentStatus.NO_SHOW,
    AppointmentStatus.BILLED,
    AppointmentStatus.CONSULTATION_COMPLETED,
}


def _status_rank(entry: QueueEntry) -> int:
    if entry.status == AppointmentStatus.CALLED:
        return 0
    if entry.status in {AppointmentStatus.WAITING, AppointmentStatus.REQUEUED}:
        return 1
    return 2


def normalize_queue_positions(
    session: Session, *, tenant_id: str, branch_id: str
) -> list[QueueEntry]:
    """Keep active queue positions contiguous and deterministic."""
    rows = list(
        session.exec(
            select(QueueEntry).where(
                QueueEntry.tenant_id == tenant_id,
                QueueEntry.branch_id == branch_id,
                QueueEntry.status.notin_(TERMINAL_STATUSES),
            )
        ).all()
    )
    rows.sort(
        key=lambda row: (
            _status_rank(row),
            int(row.priority_rank or 2),
            int(row.queue_position or 0),
            row.created_at,
            row.id,
        )
    )
    for position, row in enumerate(rows, start=1):
        if row.queue_position != position:
            row.queue_position = position
            session.add(row)
    session.commit()
    return rows


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
    entry.updated_by_user_id = actor_user_id
    appointment.status = to_status
    appointment.updated_at = now
    appointment.updated_by_user_id = actor_user_id
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
    normalize_queue_positions(
        session, tenant_id=entry.tenant_id, branch_id=entry.branch_id
    )
    session.refresh(entry)
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
    original_position = max(int(entry.queue_position or 1), 1)
    entry.status = AppointmentStatus.REQUEUED
    entry.updated_by_user_id = actor_user_id
    appointment.status = AppointmentStatus.REQUEUED
    active_rows = normalize_queue_positions(
        session, tenant_id=entry.tenant_id, branch_id=entry.branch_id
    )
    active_rows = [row for row in active_rows if row.id != entry.id]
    if place_at_end:
        insert_at = len(active_rows)
    else:
        offset, _scope, _scope_id = resolve_setting(
            session,
            tenant_id=entry.tenant_id,
            module="queue",
            key=SettingKey.QUEUE_REQUEUE_AFTER_PATIENTS,
            branch_id=entry.branch_id,
        )
        current_index = original_position - 1
        insert_at = min(current_index + int(offset or 1), len(active_rows))
    active_rows.insert(insert_at, entry)
    for position, row in enumerate(active_rows, start=1):
        row.queue_position = position
        session.add(row)
    entry.updated_at = now_utc()
    appointment.updated_at = now_utc()
    appointment.updated_by_user_id = actor_user_id
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
