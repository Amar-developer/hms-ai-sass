"""Operational health of the tenant SMS pipeline.

Distinguishes two failure modes an operator has to treat differently: sends the
gateway refused (a configuration or provider problem) and sends the gateway
accepted that the handset never confirmed (a delivery problem the provider owns).
"""

from datetime import datetime, timedelta, timezone

from sqlalchemy import func
from sqlmodel import Session, select

from app.modules.integrations.sms.schemas import SmsHealthRead
from app.modules.notifications.models import (
    NotificationEvent,
    NotificationProvider,
    NotificationStatus,
)
from app.modules.tenants.models import now_utc


PROCESSING_STALE_MINUTES = 5
# How long an accepted SMS may sit without a delivery receipt before the queue
# is treated as waiting on the provider rather than on us.
RECEIPT_GRACE_MINUTES = 30


def _aware(value: datetime | None) -> datetime | None:
    if value is None or value.tzinfo:
        return value
    return value.replace(tzinfo=timezone.utc)


def read_sms_health(
    session: Session, *, tenant_id: str, now: datetime | None = None
) -> SmsHealthRead:
    current = now or now_utc()
    day_start = current - timedelta(hours=24)
    stale_before = current - timedelta(minutes=PROCESSING_STALE_MINUTES)
    receipt_due_before = current - timedelta(minutes=RECEIPT_GRACE_MINUTES)
    base = (
        NotificationEvent.tenant_id == tenant_id,
        NotificationEvent.provider == NotificationProvider.SMS,
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
        NotificationEvent.sent_at >= day_start,
        NotificationEvent.sent_at.is_not(None),
    )
    delivered_24h = count(
        NotificationEvent.delivery_status == "delivered",
        NotificationEvent.delivered_at >= day_start,
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
    awaiting_receipt = count(
        NotificationEvent.status == NotificationStatus.SENT,
        NotificationEvent.delivery_status == "accepted",
        NotificationEvent.sent_at <= receipt_due_before,
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
                *base, NotificationEvent.sent_at.is_not(None)
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
    delivery_rate = round((delivered_24h / sent_24h) * 100, 2) if sent_24h else 0.0

    alerts: list[str] = []
    critical = False
    if stuck_processing:
        alerts.append(f"{stuck_processing} SMS job(s) have exceeded the lease")
        critical = stuck_processing >= 3
    if oldest_age is not None and oldest_age >= 15:
        alerts.append(f"The oldest queued SMS has waited {oldest_age} minutes")
        critical = critical or oldest_age >= 60
    if completed >= 5 and failure_rate >= 10:
        alerts.append(f"The 24-hour SMS failure rate is {failure_rate:g}%")
        critical = critical or failure_rate >= 30
    if awaiting_receipt:
        alerts.append(
            f"{awaiting_receipt} accepted SMS have no delivery receipt after "
            f"{RECEIPT_GRACE_MINUTES} minutes"
        )
    if sent_24h >= 10 and delivery_rate and delivery_rate <= 70:
        alerts.append(f"Only {delivery_rate:g}% of sent SMS were confirmed delivered")
        critical = critical or delivery_rate <= 50

    return SmsHealthRead(
        status="critical" if critical else "warning" if alerts else "healthy",
        sent_24h=sent_24h,
        delivered_24h=delivered_24h,
        failed_24h=failed_24h,
        failure_rate_24h=failure_rate,
        delivery_rate_24h=delivery_rate,
        queued=queued,
        retry_pending=retry_pending,
        stuck_processing=stuck_processing,
        awaiting_receipt=awaiting_receipt,
        oldest_queued_age_minutes=oldest_age,
        last_sent_at=last_sent.isoformat() if last_sent else None,
        alerts=alerts,
    )


# SMS integration domain package.
