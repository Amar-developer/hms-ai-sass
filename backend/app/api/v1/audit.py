from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session

from app.core.auth import get_current_user, require_permission
from app.core.database import get_session
from app.core.tenant_context import require_tenant_id
from app.modules.identity import permissions
from app.modules.identity.models import User
from app.modules.audit.models import AuditEvent
from app.modules.audit.repositories import AuditEventRepository
from app.modules.audit.schemas import AuditEventCreate, AuditEventRead

router = APIRouter(prefix="/audit-events")


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
