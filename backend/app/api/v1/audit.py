from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session

from app.core.auth import get_current_user, require_permission
from app.core.database import get_session
from app.core.tenant_context import require_tenant_id
from app.modules.identity import permissions
from app.modules.identity.models import User
from app.modules.audit.models import AuditEvent
from app.modules.audit.repositories import AuditEventRepository, CommentRepository
from app.modules.audit.schemas import (
    ActivityFeed,
    AuditEventCreate,
    AuditEventRead,
    CommentCreate,
    CommentRead,
)
from app.modules.audit.service import add_comment

router = APIRouter(prefix="/audit-events")
activity_router = APIRouter(prefix="/activity")


@router.post(
    "",
    response_model=AuditEventRead,
    status_code=status.HTTP_201_CREATED,
    summary="Create audit event",
    dependencies=[Depends(require_permission(permissions.AUDIT_READ))],
)
def create_audit_event(
    payload: AuditEventCreate,
    tenant_id: str = Depends(require_tenant_id),
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> AuditEvent:
    # The actor is always the authenticated caller — never a client-supplied
    # value — so an audit event cannot be forged in another user's name.
    event = AuditEvent.model_validate(
        payload,
        update={"tenant_id": tenant_id, "actor_user_id": current_user.id},
    )
    AuditEventRepository(session).add(event)
    session.commit()
    session.refresh(event)
    return event


@router.get(
    "",
    response_model=list[AuditEventRead],
    summary="List audit events",
    dependencies=[Depends(require_permission(permissions.AUDIT_READ))],
)
def list_audit_events(
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
) -> list[AuditEvent]:
    return AuditEventRepository(session).list_for_tenant(tenant_id)


@router.get(
    "/{event_id}",
    response_model=AuditEventRead,
    summary="Get audit event",
    dependencies=[Depends(require_permission(permissions.AUDIT_READ))],
)
def get_audit_event(
    event_id: str,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
) -> AuditEvent:
    event = AuditEventRepository(session).get_for_tenant(tenant_id, event_id)
    if not event:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Audit event not found"
        )
    return event


@activity_router.get(
    "/{resource_type}/{resource_id}",
    response_model=ActivityFeed,
    summary="Get the activity feed (events + comments) for a document",
)
def get_activity_feed(
    resource_type: str,
    resource_id: str,
    tenant_id: str = Depends(require_tenant_id),
    _current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> ActivityFeed:
    events = AuditEventRepository(session).list_for_resource(
        tenant_id, resource_type, resource_id
    )
    comments = CommentRepository(session).list_for_resource(
        tenant_id, resource_type, resource_id
    )
    return ActivityFeed(events=events, comments=comments)


@activity_router.post(
    "/{resource_type}/{resource_id}/comments",
    response_model=CommentRead,
    status_code=status.HTTP_201_CREATED,
    summary="Add a comment to a document",
)
def create_comment(
    resource_type: str,
    resource_id: str,
    payload: CommentCreate,
    tenant_id: str = Depends(require_tenant_id),
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> CommentRead:
    comment = add_comment(
        session,
        tenant_id=tenant_id,
        branch_id=current_user.branch_id,
        resource_type=resource_type,
        resource_id=resource_id,
        author=current_user,
        body=payload.body,
    )
    return comment
