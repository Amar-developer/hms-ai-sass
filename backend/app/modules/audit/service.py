import json
from typing import Any

from sqlalchemy import func, or_
from sqlmodel import Session, select

from app.modules.audit.models import (
    AuditEvent,
    DocumentComment,
    DocumentCommentMention,
)
from app.modules.audit.repositories import AuditEventRepository, CommentRepository
from app.modules.audit.schemas import CommentRead, MentionUserRead
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
        comparable_old = (
            None if isinstance(old_value, str) and not old_value.strip() else old_value
        )
        comparable_new = (
            None if isinstance(new_value, str) and not new_value.strip() else new_value
        )
        if comparable_old == comparable_new:
            continue
        changes.append(
            {
                "field": field,
                "label": labels.get(field, field.replace("_", " ").title()),
                "old": comparable_old,
                "new": comparable_new,
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
    mentioned_user_ids: list[str] | None = None,
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
    requested_ids = set(mentioned_user_ids or [])
    requested_ids.discard(author.id)
    mentioned_users = (
        list(
            session.exec(
                select(User).where(
                    User.id.in_(requested_ids),
                    User.tenant_id == tenant_id,
                    User.is_active == True,  # noqa: E712
                )
            ).all()
        )
        if requested_ids
        else []
    )
    # A client must include the selected user's visible @Name token. User IDs
    # remain the authoritative recipient identity, while this check prevents a
    # hidden mention ID from notifying somebody not shown in the comment.
    mentioned_users = [user for user in mentioned_users if f"@{user.name}" in body]
    for user in mentioned_users:
        session.add(
            DocumentCommentMention(
                tenant_id=tenant_id,
                comment_id=comment.id,
                mentioned_user_id=user.id,
            )
        )

    if mentioned_users:
        # Imported lazily because notification event helpers already use the
        # audit service for audit rows.
        from app.modules.notifications.models import (
            InAppNotificationCategory,
            InAppNotificationPriority,
        )
        from app.modules.notifications.services.in_app import create_for_users

        module_by_resource = {
            "appointment": "appointments",
            "consultation": "consultation",
            "patient": "patients",
            "invoice": "billing",
            "ip_admission": "ip",
            "physiotherapy_case": "physiotherapy",
            "home_care_booking": "home_care",
        }
        create_for_users(
            session,
            users=mentioned_users,
            tenant_id=tenant_id,
            branch_id=branch_id,
            category=InAppNotificationCategory.COMMENT,
            event_type="comment.mentioned",
            priority=InAppNotificationPriority.NORMAL,
            title=f"{author.name} mentioned you in a comment",
            message=body[:500],
            action_module=module_by_resource.get(resource_type),
            resource_type=resource_type,
            resource_id=resource_id,
            metadata={
                "comment_id": comment.id,
                "author_user_id": author.id,
            },
            dedupe_key=f"comment.mention:{comment.id}",
            created_by_user_id=author.id,
            commit=False,
        )
    if commit:
        session.commit()
        session.refresh(comment)
    return comment


def list_mention_users(
    session: Session,
    *,
    tenant_id: str,
    current_user_id: str,
    query: str = "",
    limit: int = 20,
) -> list[MentionUserRead]:
    statement = select(User).where(
        User.tenant_id == tenant_id,
        User.is_active == True,  # noqa: E712
        User.id != current_user_id,
    )
    normalized = query.strip().lower()
    if normalized:
        statement = statement.where(
            or_(
                func.lower(User.name).contains(normalized),
                func.lower(User.email).contains(normalized),
                func.lower(User.user_type).contains(normalized),
            )
        )
    users = list(session.exec(statement.order_by(User.name).limit(limit)).all())
    return [
        MentionUserRead.model_validate(user, from_attributes=True) for user in users
    ]


def comment_read(session: Session, comment: DocumentComment) -> CommentRead:
    users = list(
        session.exec(
            select(User)
            .join(
                DocumentCommentMention,
                DocumentCommentMention.mentioned_user_id == User.id,
            )
            .where(DocumentCommentMention.comment_id == comment.id)
            .order_by(User.name)
        ).all()
    )
    return CommentRead.model_validate(comment, from_attributes=True).model_copy(
        update={
            "mentions": [
                MentionUserRead.model_validate(user, from_attributes=True)
                for user in users
            ]
        },
    )
