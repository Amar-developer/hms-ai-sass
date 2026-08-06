from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import func
from sqlmodel import Session, select

from app.modules.notifications.models import (
    DocumentDelivery,
    DocumentDeliveryStatus,
    NotificationEvent,
    NotificationStatus,
)
from app.modules.reports.models import ReportJob, ReportJobStatus
from app.modules.reports.queue import read_worker_heartbeat


def _aware(value: datetime | None) -> datetime | None:
    if value is None or value.tzinfo:
        return value
    return value.replace(tzinfo=timezone.utc)


def _queue_snapshot(
    session: Session,
    *,
    model,
    statuses: list,
) -> dict[str, object]:
    count, oldest = session.exec(
        select(func.count(), func.min(model.created_at)).where(
            model.status.in_(statuses)
        )
    ).one()
    oldest = _aware(oldest)
    age_seconds = (
        max(int((datetime.now(timezone.utc) - oldest).total_seconds()), 0)
        if oldest
        else None
    )
    return {
        "depth": int(count or 0),
        "oldest_age_seconds": age_seconds,
        "oldest_created_at": oldest.isoformat() if oldest else None,
    }


def read_queue_metrics(session: Session) -> dict[str, dict[str, object]]:
    """Return global queue health for platform operators without row payloads."""
    return {
        "notification_events": _queue_snapshot(
            session,
            model=NotificationEvent,
            statuses=[NotificationStatus.QUEUED],
        ),
        "document_deliveries": _queue_snapshot(
            session,
            model=DocumentDelivery,
            statuses=[
                DocumentDeliveryStatus.QUEUED,
                DocumentDeliveryStatus.PROCESSING,
            ],
        ),
        "report_jobs": _queue_snapshot(
            session,
            model=ReportJob,
            statuses=[
                ReportJobStatus.QUEUED,
                ReportJobStatus.RUNNING,
                ReportJobStatus.DELIVERING,
            ],
        ),
    }


def read_worker_metrics() -> dict[str, object]:
    """Return best-effort worker liveness without making metrics unavailable."""
    try:
        heartbeat = read_worker_heartbeat()
    except Exception:
        return {"status": "unavailable", "last_heartbeat_at": None}
    return {
        "status": "healthy" if heartbeat else "stale",
        "last_heartbeat_at": heartbeat,
    }
