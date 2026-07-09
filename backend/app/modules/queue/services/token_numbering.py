from sqlmodel import Session, select
from sqlalchemy import func

from app.modules.appointments.models import Appointment
from app.modules.queue.models import QueueEntry, QueuePriority
from app.modules.tenants.models import Branch


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
    # Serialize token issuance within a branch by locking the branch row, so two
    # concurrent bookings can't both read the same count and mint duplicate
    # token numbers. (No-op on single-writer SQLite.)
    session.exec(select(Branch).where(Branch.id == branch_id).with_for_update()).first()
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
