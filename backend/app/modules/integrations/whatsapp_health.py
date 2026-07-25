from datetime import datetime, timedelta, timezone

from sqlalchemy import func
from sqlmodel import Session, select

from app.modules.integrations.whatsapp_schemas import WhatsAppHealthRead
from app.modules.notifications.models import (
    NotificationEvent,
    NotificationProvider,
    NotificationStatus,
)
from app.modules.tenants.models import now_utc


PROCESSING_STALE_MINUTES = 5


def _aware(value: datetime | None) -> datetime | None:
    if value is None or value.tzinfo:
        return value
    return value.replace(tzinfo=timezone.utc)


def read_whatsapp_health(
    session: Session, *, tenant_id: str, now: datetime | None = None
) -> WhatsAppHealthRead:
    current = now or now_utc()
    day_start = current - timedelta(hours=24)
    stale_before = current - timedelta(minutes=PROCESSING_STALE_MINUTES)
    base = (
        NotificationEvent.tenant_id == tenant_id,
        NotificationEvent.provider == NotificationProvider.WHATSAPP,
        NotificationEvent.template_key.is_not(None),
    )

    def count(*filters) -> int:
        return int(
            session.exec(
                select(func.count())
                .select_from(NotificationEvent)
                .where(*base, *filters)
            ).one()
        )

    sent_24h = count(
        NotificationEvent.status == NotificationStatus.SENT,
        NotificationEvent.sent_at >= day_start,
    )
    failed_24h = count(
        NotificationEvent.status == NotificationStatus.FAILED,
        NotificationEvent.updated_at >= day_start,
    )
    queued = count(
        NotificationEvent.status == NotificationStatus.QUEUED,
        NotificationEvent.processing_started_at.is_(None),
    )
    retry_pending = count(
        NotificationEvent.status == NotificationStatus.QUEUED,
        NotificationEvent.attempt_count > 0,
    )
    stuck_processing = count(
        NotificationEvent.status == NotificationStatus.QUEUED,
        NotificationEvent.processing_started_at.is_not(None),
        NotificationEvent.processing_started_at <= stale_before,
    )
    oldest_queued = _aware(
        session.exec(
            select(func.min(NotificationEvent.created_at)).where(
                *base,
                NotificationEvent.status == NotificationStatus.QUEUED,
                NotificationEvent.processing_started_at.is_(None),
            )
        ).one()
    )
    last_sent = _aware(
        session.exec(
            select(func.max(NotificationEvent.sent_at)).where(
                *base,
                NotificationEvent.status == NotificationStatus.SENT,
            )
        ).one()
    )
    oldest_age = (
        max(int((current - oldest_queued).total_seconds() // 60), 0)
        if oldest_queued
        else None
    )
    completed = sent_24h + failed_24h
    failure_rate = round((failed_24h / completed) * 100, 2) if completed else 0.0

    alerts: list[str] = []
    critical = False
    if stuck_processing:
        alerts.append(f"{stuck_processing} processing job(s) have exceeded the lease")
    if oldest_age is not None and oldest_age >= 15:
        alerts.append(f"The oldest queued notification has waited {oldest_age} minutes")
        critical = oldest_age >= 60
    if completed >= 5 and failure_rate >= 10:
        alerts.append(f"The 24-hour failure rate is {failure_rate:g}%")
        critical = critical or failure_rate >= 30
    if stuck_processing >= 3:
        critical = True

    return WhatsAppHealthRead(
        status="critical" if critical else "warning" if alerts else "healthy",
        sent_24h=sent_24h,
        failed_24h=failed_24h,
        failure_rate_24h=failure_rate,
        queued=queued,
        retry_pending=retry_pending,
        stuck_processing=stuck_processing,
        oldest_queued_age_minutes=oldest_age,
        last_sent_at=last_sent.isoformat() if last_sent else None,
        alerts=alerts,
    )
