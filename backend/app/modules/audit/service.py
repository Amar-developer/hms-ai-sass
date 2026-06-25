from sqlmodel import Session

from app.modules.audit.models import AuditEvent


def record_audit_event(
    session: Session,
    *,
    tenant_id: str,
    action: str,
    resource_type: str,
    resource_id: str,
    branch_id: str | None = None,
    actor_user_id: str | None = None,
    actor_role: str | None = None,
    purpose: str | None = None,
    metadata_json: str = "{}",
    commit: bool = True,
) -> AuditEvent:
    event = AuditEvent(
        tenant_id=tenant_id,
        branch_id=branch_id,
        actor_user_id=actor_user_id,
        actor_role=actor_role,
        action=action,
        resource_type=resource_type,
        resource_id=resource_id,
        purpose=purpose,
        metadata_json=metadata_json,
    )
    session.add(event)
    if commit:
        session.commit()
        session.refresh(event)
    return event
