from sqlmodel import Session, select

from app.core.pagination import DEFAULT_LIST_LIMIT
from app.modules.notifications.models import NotificationEvent


class NotificationEventRepository:
    def __init__(self, session: Session):
        self.session = session

    def add(self, event: NotificationEvent) -> NotificationEvent:
        self.session.add(event)
        return event

    def list_events(
        self,
        *,
        tenant_id: str,
        branch_id: str | None = None,
        provider: str | None = None,
        status_filter: str | None = None,
        limit: int = DEFAULT_LIST_LIMIT,
        offset: int = 0,
    ) -> list[NotificationEvent]:
        statement = select(NotificationEvent).where(
            NotificationEvent.tenant_id == tenant_id
        )
        if branch_id:
            statement = statement.where(NotificationEvent.branch_id == branch_id)
        if provider:
            statement = statement.where(NotificationEvent.provider == provider)
        if status_filter:
            statement = statement.where(NotificationEvent.status == status_filter)
        return list(
            self.session.exec(
                statement.order_by(NotificationEvent.created_at)
                .offset(offset)
                .limit(limit)
            ).all()
        )
