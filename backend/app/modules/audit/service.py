import json
from typing import Any

from sqlmodel import Session

from app.modules.audit.models import AuditEvent, DocumentComment
from app.modules.audit.repositories import AuditEventRepository, CommentRepository
from app.modules.identity.models import User


def diff_changes(
    before: dict[str, Any], after: dict[str, Any], labels: dict[str, str] | None = None
) -> list[dict[str, Any]]:
    """Compare two field snapshots and return only the changed ones.

    Each entry is shaped for ERPNext-style rendering:
    {"field": "status", "label": "Status", "old": "draft", "new": "paid"}.
    """
    labels = labels or {}
    changes: list[dict[str, Any]] = []
    for field, new_value in after.items():
        old_value = before.get(field)
        if old_value == new_value:
            continue
        changes.append(
            {
                "field": field,
                "label": labels.get(field, field.replace("_", " ").title()),
                "old": old_value,
                "new": new_value,
            }
        )
    return changes


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
    actor_name: str | None = None,
    actor_email: str | None = None,
    purpose: str | None = None,
    metadata_json: str = "{}",
    changes: list[dict[str, Any]] | None = None,
    commit: bool = True,
) -> AuditEvent:
    if actor_user_id and (actor_name is None or actor_email is None):
        actor = session.get(User, actor_user_id)
        if actor:
            actor_name = actor_name or actor.name
            actor_email = actor_email or actor.email

    if changes:
        try:
            payload = json.loads(metadata_json) if metadata_json else {}
        except (json.JSONDecodeError, TypeError):
            payload = {}
        payload["changes"] = changes
        metadata_json = json.dumps(payload, default=str)

    event = AuditEvent(
        tenant_id=tenant_id,
        branch_id=branch_id,
        actor_user_id=actor_user_id,
        actor_role=actor_role,
        actor_name=actor_name,
        actor_email=actor_email,
        action=action,
        resource_type=resource_type,
        resource_id=resource_id,
        purpose=purpose,
        metadata_json=metadata_json,
    )
    AuditEventRepository(session).add(event)
    if commit:
        session.commit()
        session.refresh(event)
    return event


def add_comment(
    session: Session,
    *,
    tenant_id: str,
    resource_type: str,
    resource_id: str,
    author: User,
    body: str,
    branch_id: str | None = None,
    commit: bool = True,
) -> DocumentComment:
    comment = DocumentComment(
        tenant_id=tenant_id,
        branch_id=branch_id,
        resource_type=resource_type,
        resource_id=resource_id,
        author_user_id=author.id,
        author_name=author.name,
        author_email=author.email,
        body=body,
    )
    CommentRepository(session).add(comment)
    if commit:
        session.commit()
        session.refresh(comment)
    return comment
