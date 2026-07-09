from fastapi import APIRouter, Depends, status
from sqlmodel import Session

from app.core.access_control import (
    require_branch_in_tenant,
    require_user_branch_access,
    scoped_branch_id,
)
from app.core.auth import require_permission
from app.core.database import get_session
from app.core.tenant_context import require_tenant_id
from app.modules.identity import permissions
from app.modules.identity.models import User
from app.modules.notifications.models import NotificationEvent
from app.modules.notifications.schemas import (
    NotificationEventCreate,
    NotificationEventRead,
)
from app.modules.notifications import service as notification_service

router = APIRouter(prefix="/notifications")


@router.post(
    "",
    response_model=NotificationEventRead,
    status_code=status.HTTP_201_CREATED,
    summary="Queue notification",
    dependencies=[Depends(require_permission(permissions.NOTIFICATIONS_MANAGE))],
)
def queue_notification(
    payload: NotificationEventCreate,
    tenant_id: str = Depends(require_tenant_id),
    current_user: User = Depends(require_permission(permissions.NOTIFICATIONS_MANAGE)),
    session: Session = Depends(get_session),
) -> NotificationEvent:
    require_branch_in_tenant(session, tenant_id, payload.branch_id)
    require_user_branch_access(current_user, payload.branch_id)
    return notification_service.queue_notification(
        session, tenant_id=tenant_id, payload=payload
    )


@router.get(
    "",
    response_model=list[NotificationEventRead],
    summary="List notifications",
    dependencies=[Depends(require_permission(permissions.NOTIFICATIONS_MANAGE))],
)
def list_notifications(
    tenant_id: str = Depends(require_tenant_id),
    provider: str | None = None,
    status_filter: str | None = None,
    branch_id: str | None = None,
    current_user: User = Depends(require_permission(permissions.NOTIFICATIONS_MANAGE)),
    session: Session = Depends(get_session),
) -> list[NotificationEvent]:
    branch_id = scoped_branch_id(current_user, branch_id)
    return notification_service.list_notifications(
        session,
        tenant_id=tenant_id,
        branch_id=branch_id,
        provider=provider,
        status_filter=status_filter,
    )
