from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select

from app.core.access_control import (
    current_doctor_practitioner_id,
    enforce_entitlement,
    require_doctor_practitioner_access,
    require_user_branch_access,
    scoped_branch_id,
)
from app.core.auth import require_permission
from app.core.database import get_session
from app.core.tenant_context import require_tenant_id
from app.modules.appointments.models import Appointment, AppointmentStatus
from app.modules.appointments.schemas import (
    QueueDisplayRead,
    QueueEntryRead,
    QueueTransitionRequest,
    RequeueRequest,
)
from app.modules.notifications.models import NotificationEventType, NotificationProvider
from app.modules.notifications.service import queue_notification_if_allowed
from app.modules.identity import permissions
from app.modules.identity.models import User
from app.modules.queue.models import QueueEntry
from app.modules.queue.service import (
    enforce_no_show_threshold,
    requeue_entry,
    sync_transition,
)
from app.modules.settings.models import SettingKey
from app.modules.settings.service import resolve_setting

router = APIRouter(prefix="/queue")


def _token_language(session: Session, tenant_id: str, branch_id: str) -> str:
    value, _scope, _scope_id = resolve_setting(
        session,
        tenant_id=tenant_id,
        module="queue",
        branch_id=branch_id,
        key=SettingKey.TOKEN_LANGUAGE,
    )
    return str(value or "english").lower()


def _token_call_message(token_number: str, language: str) -> str:
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
        display_text=f"{entry.token_number} - {entry.status.value.replace('_', ' ').title()}",
        call_message=_token_call_message(entry.token_number, language),
    )


def _get_queue_entry_or_404(
    session: Session, tenant_id: str, entry_id: str
) -> QueueEntry:
    entry = session.get(QueueEntry, entry_id)
    if not entry or entry.tenant_id != tenant_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Queue entry not found"
        )
    return entry


def _get_appointment_for_entry(session: Session, entry: QueueEntry) -> Appointment:
    appointment = session.get(Appointment, entry.appointment_id)
    if not appointment or appointment.tenant_id != entry.tenant_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Appointment not found"
        )
    return appointment


@router.get(
    "",
    response_model=list[QueueEntryRead],
    dependencies=[Depends(require_permission(permissions.QUEUE_MANAGE))],
)
def list_queue(
    tenant_id: str = Depends(require_tenant_id),
    branch_id: str | None = None,
    include_completed: bool = False,
    current_user: User = Depends(require_permission(permissions.QUEUE_MANAGE)),
    session: Session = Depends(get_session),
) -> list[QueueEntry]:
    enforce_entitlement(session, tenant_id, "queue")
    branch_id = scoped_branch_id(current_user, branch_id)
    doctor_practitioner_id = current_doctor_practitioner_id(
        session, tenant_id, current_user
    )
    statement = select(QueueEntry).where(QueueEntry.tenant_id == tenant_id)
    if doctor_practitioner_id:
        statement = statement.join(
            Appointment, Appointment.id == QueueEntry.appointment_id
        ).where(Appointment.practitioner_id == doctor_practitioner_id)
    if branch_id:
        statement = statement.where(QueueEntry.branch_id == branch_id)
    if not include_completed:
        statement = statement.where(
            QueueEntry.status.notin_(
                [
                    AppointmentStatus.CANCELLED,
                    AppointmentStatus.NO_SHOW,
                    AppointmentStatus.CONSULTATION_COMPLETED,
                    AppointmentStatus.BILLED,
                ]
            )
        )
    return list(
        session.exec(
            statement.order_by(QueueEntry.token_number, QueueEntry.created_at)
        ).all()
    )


@router.get(
    "/display",
    response_model=list[QueueDisplayRead],
    dependencies=[Depends(require_permission(permissions.QUEUE_MANAGE))],
)
def queue_display(
    tenant_id: str = Depends(require_tenant_id),
    branch_id: str | None = None,
    display_mode: str = "reception",
    current_user: User = Depends(require_permission(permissions.QUEUE_MANAGE)),
    session: Session = Depends(get_session),
) -> list[QueueDisplayRead]:
    enforce_entitlement(session, tenant_id, "queue")
    branch_id = scoped_branch_id(current_user, branch_id)
    doctor_practitioner_id = current_doctor_practitioner_id(
        session, tenant_id, current_user
    )
    statement = select(QueueEntry).where(QueueEntry.tenant_id == tenant_id)
    if doctor_practitioner_id:
        statement = statement.join(
            Appointment, Appointment.id == QueueEntry.appointment_id
        ).where(Appointment.practitioner_id == doctor_practitioner_id)
    if branch_id:
        statement = statement.where(QueueEntry.branch_id == branch_id)
    statement = statement.where(
        QueueEntry.status.notin_(
            [
                AppointmentStatus.CANCELLED,
                AppointmentStatus.NO_SHOW,
                AppointmentStatus.CONSULTATION_COMPLETED,
                AppointmentStatus.BILLED,
            ]
        )
    )
    rows = list(
        session.exec(
            statement.order_by(QueueEntry.token_number, QueueEntry.created_at)
        ).all()
    )
    if display_mode == "called_only":
        rows = [row for row in rows if row.status == AppointmentStatus.CALLED]
    language = (
        _token_language(session, tenant_id, branch_id or rows[0].branch_id)
        if rows or branch_id
        else "english"
    )
    return [_display_row(entry, language) for entry in rows]


@router.post(
    "/{entry_id}/call",
    response_model=QueueEntryRead,
    dependencies=[Depends(require_permission(permissions.QUEUE_MANAGE))],
)
def call_token(
    entry_id: str,
    payload: QueueTransitionRequest,
    tenant_id: str = Depends(require_tenant_id),
    current_user: User = Depends(require_permission(permissions.QUEUE_MANAGE)),
    session: Session = Depends(get_session),
) -> QueueEntry:
    enforce_entitlement(session, tenant_id, "queue")
    entry = _get_queue_entry_or_404(session, tenant_id, entry_id)
    require_user_branch_access(current_user, entry.branch_id)
    appointment = _get_appointment_for_entry(session, entry)
    require_doctor_practitioner_access(
        session, tenant_id, current_user, appointment.practitioner_id
    )
    updated = sync_transition(
        session,
        entry=entry,
        appointment=appointment,
        to_status=AppointmentStatus.CALLED,
        action="queue.token_called",
        reason=payload.reason,
        actor_user_id=payload.actor_user_id,
    )
    language = _token_language(session, tenant_id, updated.branch_id)
    queue_notification_if_allowed(
        session,
        tenant_id=tenant_id,
        branch_id=updated.branch_id,
        provider=NotificationProvider.VOICE,
        event_type=NotificationEventType.QUEUE_TOKEN_CALL,
        recipient=f"branch:{updated.branch_id}:speaker",
        subject="Token call",
        message=_token_call_message(updated.token_number, language),
        resource_type="queue_entry",
        resource_id=updated.id,
        queued_by_user_id=payload.actor_user_id,
    )
    return updated


@router.post(
    "/{entry_id}/mark-not-available",
    response_model=QueueEntryRead,
    dependencies=[Depends(require_permission(permissions.QUEUE_MANAGE))],
)
def mark_not_available(
    entry_id: str,
    payload: QueueTransitionRequest,
    tenant_id: str = Depends(require_tenant_id),
    current_user: User = Depends(require_permission(permissions.QUEUE_MANAGE)),
    session: Session = Depends(get_session),
) -> QueueEntry:
    enforce_entitlement(session, tenant_id, "queue")
    entry = _get_queue_entry_or_404(session, tenant_id, entry_id)
    require_user_branch_access(current_user, entry.branch_id)
    appointment = _get_appointment_for_entry(session, entry)
    require_doctor_practitioner_access(
        session, tenant_id, current_user, appointment.practitioner_id
    )
    return sync_transition(
        session,
        entry=entry,
        appointment=appointment,
        to_status=AppointmentStatus.PATIENT_NOT_AVAILABLE,
        action="queue.patient_not_available",
        reason=payload.reason,
        actor_user_id=payload.actor_user_id,
    )


@router.post(
    "/{entry_id}/requeue",
    response_model=QueueEntryRead,
    dependencies=[Depends(require_permission(permissions.QUEUE_MANAGE))],
)
def requeue(
    entry_id: str,
    payload: RequeueRequest,
    tenant_id: str = Depends(require_tenant_id),
    current_user: User = Depends(require_permission(permissions.QUEUE_MANAGE)),
    session: Session = Depends(get_session),
) -> QueueEntry:
    enforce_entitlement(session, tenant_id, "queue")
    entry = _get_queue_entry_or_404(session, tenant_id, entry_id)
    require_user_branch_access(current_user, entry.branch_id)
    appointment = _get_appointment_for_entry(session, entry)
    require_doctor_practitioner_access(
        session, tenant_id, current_user, appointment.practitioner_id
    )
    return requeue_entry(
        session,
        entry=entry,
        appointment=appointment,
        reason=payload.reason,
        actor_user_id=payload.actor_user_id,
        place_at_end=payload.place_at_end,
    )


@router.post(
    "/{entry_id}/cancel",
    response_model=QueueEntryRead,
    dependencies=[Depends(require_permission(permissions.QUEUE_MANAGE))],
)
def cancel(
    entry_id: str,
    payload: QueueTransitionRequest,
    tenant_id: str = Depends(require_tenant_id),
    current_user: User = Depends(require_permission(permissions.QUEUE_MANAGE)),
    session: Session = Depends(get_session),
) -> QueueEntry:
    enforce_entitlement(session, tenant_id, "queue")
    entry = _get_queue_entry_or_404(session, tenant_id, entry_id)
    require_user_branch_access(current_user, entry.branch_id)
    appointment = _get_appointment_for_entry(session, entry)
    require_doctor_practitioner_access(
        session, tenant_id, current_user, appointment.practitioner_id
    )
    return sync_transition(
        session,
        entry=entry,
        appointment=appointment,
        to_status=AppointmentStatus.CANCELLED,
        action="appointment.cancelled",
        reason=payload.reason,
        actor_user_id=payload.actor_user_id,
    )


@router.post(
    "/{entry_id}/no-show",
    response_model=QueueEntryRead,
    dependencies=[Depends(require_permission(permissions.QUEUE_MANAGE))],
)
def mark_no_show(
    entry_id: str,
    payload: QueueTransitionRequest,
    tenant_id: str = Depends(require_tenant_id),
    current_user: User = Depends(require_permission(permissions.QUEUE_MANAGE)),
    session: Session = Depends(get_session),
) -> QueueEntry:
    enforce_entitlement(session, tenant_id, "queue")
    entry = _get_queue_entry_or_404(session, tenant_id, entry_id)
    require_user_branch_access(current_user, entry.branch_id)
    appointment = _get_appointment_for_entry(session, entry)
    require_doctor_practitioner_access(
        session, tenant_id, current_user, appointment.practitioner_id
    )
    enforce_no_show_threshold(session, entry)
    return sync_transition(
        session,
        entry=entry,
        appointment=appointment,
        to_status=AppointmentStatus.NO_SHOW,
        action="appointment.no_show",
        reason=payload.reason,
        actor_user_id=payload.actor_user_id,
    )


@router.post(
    "/{entry_id}/start-consultation",
    response_model=QueueEntryRead,
    dependencies=[Depends(require_permission(permissions.QUEUE_MANAGE))],
)
def start_consultation(
    entry_id: str,
    payload: QueueTransitionRequest,
    tenant_id: str = Depends(require_tenant_id),
    current_user: User = Depends(require_permission(permissions.QUEUE_MANAGE)),
    session: Session = Depends(get_session),
) -> QueueEntry:
    enforce_entitlement(session, tenant_id, "queue")
    entry = _get_queue_entry_or_404(session, tenant_id, entry_id)
    require_user_branch_access(current_user, entry.branch_id)
    appointment = _get_appointment_for_entry(session, entry)
    require_doctor_practitioner_access(
        session, tenant_id, current_user, appointment.practitioner_id
    )
    return sync_transition(
        session,
        entry=entry,
        appointment=appointment,
        to_status=AppointmentStatus.IN_CONSULTATION,
        action="consultation.started",
        reason=payload.reason,
        actor_user_id=payload.actor_user_id,
    )
