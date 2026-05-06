from fastapi import APIRouter, Depends, status
from sqlmodel import Session, select

from app.core.access_control import require_branch_in_tenant, require_user_branch_access, scoped_branch_id
from app.core.auth import require_permission
from app.core.database import get_session
from app.core.tenant_context import require_tenant_id
from app.modules.identity import permissions
from app.modules.identity.models import User
from app.modules.audit.service import record_audit_event
from app.modules.notifications.models import NotificationEvent
from app.modules.notifications.schemas import NotificationEventCreate, NotificationEventRead
from app.modules.notifications.service import enforce_notification_allowed

router = APIRouter(prefix="/notifications")


@router.post(
    "",
    response_model=NotificationEventRead,
    status_code=status.HTTP_201_CREATED,
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
    enforce_notification_allowed(
        session,
        tenant_id=tenant_id,
        branch_id=payload.branch_id,
        provider=payload.provider,
    )
    event = NotificationEvent.model_validate(payload, update={"tenant_id": tenant_id})
    session.add(event)
    session.commit()
    session.refresh(event)
    record_audit_event(
        session,
        tenant_id=tenant_id,
        branch_id=event.branch_id,
        actor_user_id=payload.queued_by_user_id,
        action="notification.queued",
        resource_type="notification_event",
        resource_id=event.id,
        purpose="communication",
        metadata_json=f'{{"provider": "{event.provider.value}", "event_type": "{event.event_type.value}"}}',
    )
    return event


@router.get(
    "",
    response_model=list[NotificationEventRead],
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
    statement = select(NotificationEvent).where(NotificationEvent.tenant_id == tenant_id)
    if branch_id:
        statement = statement.where(NotificationEvent.branch_id == branch_id)
    if provider:
        statement = statement.where(NotificationEvent.provider == provider)
    if status_filter:
        statement = statement.where(NotificationEvent.status == status_filter)
    return list(session.exec(statement.order_by(NotificationEvent.created_at)).all())
