from fastapi import HTTPException, status
from sqlmodel import Session, select

from app.core.access_control import (
    current_doctor_practitioner_id,
    enforce_entitlement,
    require_doctor_practitioner_access,
    require_user_branch_access,
    scoped_branch_id,
)
from app.modules.appointments.models import Appointment
from app.modules.identity.models import User
from app.modules.queue.models import QueueEntry
from app.modules.queue.services.transitions import TERMINAL_STATUSES


def get_queue_entry_or_404(
    session: Session, tenant_id: str, entry_id: str
) -> QueueEntry:
    entry = session.get(QueueEntry, entry_id)
    if not entry or entry.tenant_id != tenant_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Queue entry not found"
        )
    return entry


def get_appointment_for_entry(session: Session, entry: QueueEntry) -> Appointment:
    appointment = session.get(Appointment, entry.appointment_id)
    if not appointment or appointment.tenant_id != entry.tenant_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Appointment not found"
        )
    return appointment


def authorize_entry(
    session: Session, *, tenant_id: str, entry_id: str, actor: User
) -> tuple[QueueEntry, Appointment]:
    enforce_entitlement(session, tenant_id, "queue")
    entry = get_queue_entry_or_404(session, tenant_id, entry_id)
    require_user_branch_access(actor, entry.branch_id)
    appointment = get_appointment_for_entry(session, entry)
    require_doctor_practitioner_access(
        session, tenant_id, actor, appointment.practitioner_id
    )
    return entry, appointment


def list_queue_entries(
    session: Session,
    *,
    tenant_id: str,
    branch_id: str | None,
    include_completed: bool,
    actor: User,
) -> list[QueueEntry]:
    enforce_entitlement(session, tenant_id, "queue")
    branch_id = scoped_branch_id(actor, branch_id)
    doctor_practitioner_id = current_doctor_practitioner_id(session, tenant_id, actor)
    statement = select(QueueEntry).where(QueueEntry.tenant_id == tenant_id)
    if doctor_practitioner_id:
        statement = statement.join(
            Appointment, Appointment.id == QueueEntry.appointment_id
        ).where(Appointment.practitioner_id == doctor_practitioner_id)
    if branch_id:
        statement = statement.where(QueueEntry.branch_id == branch_id)
    if not include_completed:
        statement = statement.where(QueueEntry.status.notin_(TERMINAL_STATUSES))
    return list(
        session.exec(
            statement.order_by(
                QueueEntry.queue_position,
                QueueEntry.created_at,
                QueueEntry.id,
            )
        ).all()
    )
