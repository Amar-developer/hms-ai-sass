from datetime import datetime

from sqlalchemy import func, or_
from sqlmodel import Session, select

from app.modules.error_logs.models import ErrorLog


class ErrorLogRepository:
    def __init__(self, session: Session):
        self.session = session

    def add(self, row: ErrorLog) -> ErrorLog:
        self.session.add(row)
        return row

    def get(self, error_log_id: str) -> ErrorLog | None:
        return self.session.get(ErrorLog, error_log_id)

    def find_open_duplicate(
        self, tenant_id: str | None, fingerprint: str
    ) -> ErrorLog | None:
        tenant_clause = (
            ErrorLog.tenant_id == tenant_id
            if tenant_id is not None
            else ErrorLog.tenant_id.is_(None)
        )
        return self.session.exec(
            select(ErrorLog)
            .where(
                tenant_clause,
                ErrorLog.fingerprint == fingerprint,
                ErrorLog.is_resolved == False,  # noqa: E712
            )
            .order_by(ErrorLog.last_seen_at.desc())
        ).first()

    def list(
        self,
        *,
        tenant_id: str,
        include_global: bool = False,
        level: str | None = None,
        source: str | None = None,
        category: str | None = None,
        resolved: bool | None = None,
        status_code: int | None = None,
        query: str | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> tuple[list[ErrorLog], int]:
        tenant_clause = (
            or_(ErrorLog.tenant_id == tenant_id, ErrorLog.tenant_id.is_(None))
            if include_global
            else ErrorLog.tenant_id == tenant_id
        )
        filters = [tenant_clause]
        if level:
            filters.append(ErrorLog.level == level)
        if source:
            filters.append(ErrorLog.source == source)
        if category:
            filters.append(ErrorLog.category == category)
        if resolved is not None:
            filters.append(ErrorLog.is_resolved == resolved)
        if status_code is not None:
            filters.append(ErrorLog.status_code == status_code)
        if query:
            needle = f"%{query.strip()}%"
            filters.append(
                or_(
                    ErrorLog.event.ilike(needle),
                    ErrorLog.message.ilike(needle),
                    ErrorLog.module.ilike(needle),
                    ErrorLog.route.ilike(needle),
                    ErrorLog.request_id.ilike(needle),
                )
            )

        rows = list(
            self.session.exec(
                select(ErrorLog)
                .where(*filters)
                .order_by(ErrorLog.last_seen_at.desc())
                .offset(offset)
                .limit(limit)
            ).all()
        )
        total = int(
            self.session.exec(
                select(func.count()).select_from(ErrorLog).where(*filters)
            ).one()
        )
        return rows, total

    def delete(self, row: ErrorLog) -> None:
        self.session.delete(row)

    def touch(
        self,
        row: ErrorLog,
        *,
        now: datetime,
        request_id: str | None,
        user_id: str | None,
        stack_trace: str | None,
        metadata_json: str,
    ) -> ErrorLog:
        row.occurrence_count += 1
        row.last_seen_at = now
        row.request_id = request_id or row.request_id
        row.user_id = user_id or row.user_id
        row.stack_trace = stack_trace or row.stack_trace
        row.metadata_json = metadata_json or row.metadata_json
        self.session.add(row)
        return row
