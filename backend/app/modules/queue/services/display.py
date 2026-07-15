from sqlmodel import Session, select

from app.core.access_control import (
    current_doctor_practitioner_id,
    enforce_entitlement,
    scoped_branch_id,
)
from app.modules.appointments.models import Appointment, AppointmentStatus
from app.modules.appointments.schemas import QueueDisplayRead
from app.modules.identity.models import User
from app.modules.queue.models import QueueEntry
from app.modules.queue.services.transitions import TERMINAL_STATUSES
from app.modules.settings.models import SettingKey
from app.modules.settings.service import resolve_setting


def token_language(session: Session, tenant_id: str, branch_id: str) -> str:
    value, _scope, _scope_id = resolve_setting(
        session,
        tenant_id=tenant_id,
        module="queue",
        branch_id=branch_id,
        key=SettingKey.TOKEN_LANGUAGE,
    )
    return str(value or "english").lower()


def token_call_message(token_number: str, language: str) -> str:
    if language in {"tamil", "ta", "ta-in"}:
        return f"Token {token_number}, maruththuva aalosanai araikku varavum."
    if language in {"both", "english_tamil", "ta_en"}:
        return f"Token {token_number}, please proceed for consultation. Token {token_number}, maruththuva aalosanai araikku varavum."
    return f"Token {token_number}, please proceed for consultation."


def _display_row(entry: QueueEntry, language: str) -> QueueDisplayRead:
    return QueueDisplayRead(
        id=entry.id,
        token_number=entry.token_number,
        patient_id=entry.patient_id,
        appointment_id=entry.appointment_id,
        priority=entry.priority.value,
        status=entry.status,
        queue_position=entry.queue_position,
        display_text=f"{entry.token_number} - {entry.status.value.replace('_', ' ').title()}",
        call_message=token_call_message(entry.token_number, language),
    )


def queue_display_rows(
    session: Session,
    *,
    tenant_id: str,
    branch_id: str | None,
    display_mode: str,
    actor: User,
) -> list[QueueDisplayRead]:
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
    statement = statement.where(QueueEntry.status.notin_(TERMINAL_STATUSES))
    rows = list(
        session.exec(
            statement.order_by(
                QueueEntry.queue_position,
                QueueEntry.created_at,
                QueueEntry.id,
            )
        ).all()
    )
    if display_mode == "called_only":
        rows = [row for row in rows if row.status == AppointmentStatus.CALLED]
    language = (
        token_language(session, tenant_id, branch_id or rows[0].branch_id)
        if rows or branch_id
        else "english"
    )
    return [_display_row(entry, language) for entry in rows]
