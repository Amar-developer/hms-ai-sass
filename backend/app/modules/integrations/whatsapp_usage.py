from datetime import datetime, timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import HTTPException, status
from sqlalchemy import func
from sqlmodel import Session, select

from app.modules.integrations.whatsapp_schemas import WhatsAppUsageRead
from app.modules.notifications.models import (
    NotificationEvent,
    NotificationProvider,
    NotificationStatus,
)
from app.modules.subscriptions.models import TenantSubscription
from app.modules.subscriptions.services.tenant_subscriptions import (
    get_active_subscription,
)
from app.modules.tenants.models import Tenant, now_utc


def _month_bounds(
    now: datetime | None = None, timezone_name: str = "UTC"
) -> tuple[datetime, datetime]:
    try:
        tenant_timezone = ZoneInfo(timezone_name)
    except ZoneInfoNotFoundError:
        tenant_timezone = timezone.utc
    current = (now or now_utc()).astimezone(tenant_timezone)
    start = datetime(current.year, current.month, 1, tzinfo=tenant_timezone)
    if current.month == 12:
        end = datetime(current.year + 1, 1, 1, tzinfo=tenant_timezone)
    else:
        end = datetime(current.year, current.month + 1, 1, tzinfo=tenant_timezone)
    return start.astimezone(timezone.utc), end.astimezone(timezone.utc)


def _used_messages(
    session: Session, tenant_id: str, start: datetime, end: datetime
) -> int:
    return int(
        session.exec(
            select(func.count())
            .select_from(NotificationEvent)
            .where(
                NotificationEvent.tenant_id == tenant_id,
                NotificationEvent.provider == NotificationProvider.WHATSAPP,
                NotificationEvent.template_key.is_not(None),
                NotificationEvent.status != NotificationStatus.CANCELLED,
                NotificationEvent.created_at >= start,
                NotificationEvent.created_at < end,
            )
        ).one()
    )


def read_whatsapp_usage(
    session: Session, *, tenant_id: str, now: datetime | None = None
) -> WhatsAppUsageRead:
    _subscription, plan = get_active_subscription(session, tenant_id)
    tenant = session.get(Tenant, tenant_id)
    start, end = _month_bounds(now, tenant.timezone if tenant else "UTC")
    used = _used_messages(session, tenant_id, start, end)
    limit = int(plan.monthly_whatsapp_message_limit or 0)
    remaining = max(limit - used, 0)
    percentage = round((used / limit) * 100, 2) if limit else 100.0
    return WhatsAppUsageRead(
        plan_name=plan.name,
        monthly_limit=limit,
        used=used,
        remaining=remaining,
        usage_percentage=percentage,
        limit_reached=used >= limit,
        period_start=start.isoformat(),
        period_end=end.isoformat(),
    )


def enforce_whatsapp_monthly_limit(session: Session, *, tenant_id: str) -> None:
    active_subscription, plan = get_active_subscription(session, tenant_id)
    # Serialize quota checks for this tenant until the caller commits
    # the new outbox row. SQLite safely ignores this lock in local tests.
    session.exec(
        select(TenantSubscription)
        .where(TenantSubscription.id == active_subscription.id)
        .with_for_update()
    ).one()
    tenant = session.get(Tenant, tenant_id)
    start, end = _month_bounds(None, tenant.timezone if tenant else "UTC")
    used = _used_messages(session, tenant_id, start, end)
    if used >= int(plan.monthly_whatsapp_message_limit or 0):
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail="Monthly WhatsApp notification limit reached",
        )
