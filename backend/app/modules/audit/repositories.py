from sqlmodel import Session, select

from app.modules.audit.models import AuditEvent


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

    def list_for_tenant(self, tenant_id: str) -> list[AuditEvent]:
        return list(
            self.session.exec(
                select(AuditEvent)
                .where(AuditEvent.tenant_id == tenant_id)
                .order_by(AuditEvent.created_at)
            ).all()
        )
