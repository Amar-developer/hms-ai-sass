from sqlalchemy import func
from sqlmodel import Session, select

from app.modules.audit.models import AuditEvent, DocumentComment


class AuditEventRepository:
    def __init__(self, session: Session):
        self.session = session

    def add(self, event: AuditEvent) -> AuditEvent:
        self.session.add(event)
        return event

    def get_for_tenant(self, tenant_id: str, event_id: str) -> AuditEvent | None:
        event = self.session.get(AuditEvent, event_id)
        if not event or event.tenant_id != tenant_id:
            return None
        return event

    def list_for_tenant(
        self,
        tenant_id: str,
        *,
        offset: int = 0,
        limit: int | None = None,
        descending: bool = False,
    ) -> list[AuditEvent]:
        order = AuditEvent.created_at.desc() if descending else AuditEvent.created_at
        statement = (
            select(AuditEvent)
            .where(AuditEvent.tenant_id == tenant_id)
            .order_by(order)
            .offset(offset)
        )
        if limit is not None:
            statement = statement.limit(limit)
        return list(self.session.exec(statement).all())

    def count_for_tenant(self, tenant_id: str) -> int:
        return int(
            self.session.exec(
                select(func.count())
                .select_from(AuditEvent)
                .where(AuditEvent.tenant_id == tenant_id)
            ).one()
        )

    def list_for_resource(
        self, tenant_id: str, resource_type: str, resource_id: str
    ) -> list[AuditEvent]:
        # Read/view events (e.g. "patient.record.viewed") are recorded for
        # compliance access-logging but are noise in a document's Activity
        # feed, which should only show things that changed the document.
        return list(
            self.session.exec(
                select(AuditEvent)
                .where(
                    AuditEvent.tenant_id == tenant_id,
                    AuditEvent.resource_type == resource_type,
                    AuditEvent.resource_id == resource_id,
                    ~AuditEvent.action.endswith("viewed"),
                )
                .order_by(AuditEvent.created_at)
            ).all()
        )


class CommentRepository:
    def __init__(self, session: Session):
        self.session = session

    def add(self, comment: DocumentComment) -> DocumentComment:
        self.session.add(comment)
        return comment

    def list_for_resource(
        self, tenant_id: str, resource_type: str, resource_id: str
    ) -> list[DocumentComment]:
        return list(
            self.session.exec(
                select(DocumentComment)
                .where(
                    DocumentComment.tenant_id == tenant_id,
                    DocumentComment.resource_type == resource_type,
                    DocumentComment.resource_id == resource_id,
                )
                .order_by(DocumentComment.created_at)
            ).all()
        )
