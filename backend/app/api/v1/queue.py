from fastapi import APIRouter, Depends
from sqlmodel import Session

from app.core.auth import require_permission
from app.core.database import get_session
from app.core.tenant_context import require_tenant_id
from app.modules.appointments.schemas import (
    QueueDisplayRead,
    QueueEntryRead,
    QueueTransitionRequest,
    RequeueRequest,
)
from app.modules.identity import permissions
from app.modules.identity.models import User
from app.modules.queue import service as queue_service
from app.modules.queue.models import QueueEntry

router = APIRouter(prefix="/queue")


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
    return queue_service.list_queue_entries(
        session,
        tenant_id=tenant_id,
        branch_id=branch_id,
        include_completed=include_completed,
        actor=current_user,
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
    return queue_service.queue_display_rows(
        session,
        tenant_id=tenant_id,
        branch_id=branch_id,
        display_mode=display_mode,
        actor=current_user,
    )


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
    return queue_service.call_token(
        session,
        tenant_id=tenant_id,
        entry_id=entry_id,
        reason=payload.reason,
        actor_user_id=payload.actor_user_id,
        actor=current_user,
    )


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
    return queue_service.mark_not_available(
        session,
        tenant_id=tenant_id,
        entry_id=entry_id,
        reason=payload.reason,
        actor_user_id=payload.actor_user_id,
        actor=current_user,
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
    return queue_service.requeue(
        session,
        tenant_id=tenant_id,
        entry_id=entry_id,
        reason=payload.reason,
        actor_user_id=payload.actor_user_id,
        place_at_end=payload.place_at_end,
        actor=current_user,
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
    return queue_service.cancel(
        session,
        tenant_id=tenant_id,
        entry_id=entry_id,
        reason=payload.reason,
        actor_user_id=payload.actor_user_id,
        actor=current_user,
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
    return queue_service.mark_no_show(
        session,
        tenant_id=tenant_id,
        entry_id=entry_id,
        reason=payload.reason,
        actor_user_id=payload.actor_user_id,
        actor=current_user,
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
    return queue_service.start_consultation(
        session,
        tenant_id=tenant_id,
        entry_id=entry_id,
        reason=payload.reason,
        actor_user_id=payload.actor_user_id,
        actor=current_user,
    )
