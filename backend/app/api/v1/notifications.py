from fastapi import APIRouter, Depends, Query, status
from sqlmodel import Session

from app.core.access_control import (
    require_branch_in_tenant,
    require_user_branch_access,
    scoped_branch_id,
)
from app.core.auth import get_current_user, require_any_permission
from app.core.database import get_session
from app.core.tenant_context import require_tenant_id
from app.modules.identity import permissions
from app.modules.identity.models import User
from app.modules.notifications.models import (
    InAppNotification,
    InAppNotificationCategory,
    NotificationEvent,
)
from app.modules.notifications.schemas import (
    InAppNotificationList,
    InAppNotificationRead,
    InAppNotificationUpdate,
    NotificationEventCreate,
    NotificationEventRead,
    ProductAnnouncementCreate,
    ProductAnnouncementRead,
)
from app.modules.notifications import service as notification_service
from app.modules.notifications.services.in_app import (
    list_for_user,
    mark_all_read,
    publish_announcement,
    update_for_user,
)

router = APIRouter(prefix="/notifications")


@router.post(
    "",
    response_model=NotificationEventRead,
    status_code=status.HTTP_201_CREATED,
    summary="Queue notification",
    dependencies=[
        Depends(
            require_any_permission(
                permissions.NOTIFICATIONS_MANAGE, permissions.NOTIFICATIONS_CREATE
            )
        )
    ],
)
def queue_notification(
    payload: NotificationEventCreate,
    tenant_id: str = Depends(require_tenant_id),
    current_user: User = Depends(
        require_any_permission(
            permissions.NOTIFICATIONS_MANAGE, permissions.NOTIFICATIONS_CREATE
        )
    ),
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
    dependencies=[
        Depends(
            require_any_permission(
                permissions.NOTIFICATIONS_MANAGE, permissions.NOTIFICATIONS_READ
            )
        )
    ],
)
def list_notifications(
    tenant_id: str = Depends(require_tenant_id),
    provider: str | None = None,
    status_filter: str | None = None,
    branch_id: str | None = None,
    current_user: User = Depends(
        require_any_permission(
            permissions.NOTIFICATIONS_MANAGE, permissions.NOTIFICATIONS_READ
        )
    ),
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


def _enforce_inbox_tenant(user: User, tenant_id: str) -> None:
    if not user.is_super_admin and user.tenant_id != tenant_id:
        from fastapi import HTTPException

        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Tenant access denied"
        )


@router.get(
    "/in-app",
    response_model=InAppNotificationList,
    summary="List the current user's in-app inbox",
)
def list_in_app_notifications(
    limit: int = Query(default=30, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    unread_only: bool = False,
    category: InAppNotificationCategory | None = None,
    include_archived: bool = False,
    tenant_id: str = Depends(require_tenant_id),
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> InAppNotificationList:
    _enforce_inbox_tenant(current_user, tenant_id)
    return list_for_user(
        session,
        user=current_user,
        limit=limit,
        offset=offset,
        unread_only=unread_only,
        category=category,
        include_archived=include_archived,
    )


@router.patch(
    "/in-app/{notification_id}",
    response_model=InAppNotificationRead,
    summary="Update read or archive state for an inbox item",
)
def update_in_app_notification(
    notification_id: str,
    payload: InAppNotificationUpdate,
    tenant_id: str = Depends(require_tenant_id),
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> InAppNotification:
    _enforce_inbox_tenant(current_user, tenant_id)
    return update_for_user(
        session,
        notification_id=notification_id,
        user=current_user,
        payload=payload,
    )


@router.post(
    "/in-app/read-all",
    summary="Mark every active inbox item as read",
)
def mark_all_in_app_notifications_read(
    tenant_id: str = Depends(require_tenant_id),
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> dict[str, int]:
    _enforce_inbox_tenant(current_user, tenant_id)
    return {"updated_count": mark_all_read(session, user=current_user)}


@router.post(
    "/in-app/announcements",
    response_model=ProductAnnouncementRead,
    status_code=status.HTTP_201_CREATED,
    summary="Publish a tenant or platform product announcement",
)
def create_product_announcement(
    payload: ProductAnnouncementCreate,
    tenant_id: str = Depends(require_tenant_id),
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> ProductAnnouncementRead:
    return publish_announcement(
        session,
        current_tenant_id=tenant_id,
        payload=payload,
        actor=current_user,
    )
