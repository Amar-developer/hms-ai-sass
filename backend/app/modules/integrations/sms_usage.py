"""Tenant SMS volume accounting.

SMS bills per segment, not per message, so usage is tracked on both axes: the
message count drives tenant-facing limits and the segment count is what
reconciles against a provider invoice.
"""

from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import HTTPException, status
from sqlalchemy import func
from sqlmodel import Session, select

from app.modules.integrations.sms_schemas import SmsUsageRead
from app.modules.integrations.sms_service import get_sms_settings_model
from app.modules.notifications.models import (
    NotificationEvent,
    NotificationProvider,
    NotificationStatus,
)
from app.modules.subscriptions.services.tenant_subscriptions import (
    get_active_subscription,
)
from app.modules.subscriptions.services.usage_limits import (
    active_sms_segment_credits,
    effective_sms_segment_limit,
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


def _base_filters(tenant_id: str):
    return (
        NotificationEvent.tenant_id == tenant_id,
        NotificationEvent.provider == NotificationProvider.SMS,
        NotificationEvent.template_key.is_not(None),
        NotificationEvent.status != NotificationStatus.CANCELLED,
    )


def _counts(
    session: Session, tenant_id: str, start: datetime, end: datetime
) -> tuple[int, int]:
    row = session.exec(
        select(
            func.count(NotificationEvent.id),
            func.coalesce(func.sum(NotificationEvent.segment_count), 0),
        ).where(
            *_base_filters(tenant_id),
            NotificationEvent.created_at >= start,
            NotificationEvent.created_at < end,
        )
    ).one()
    messages = int(row[0] or 0)
    # Rows queued before a segment estimate existed still cost at least one.
    segments = int(row[1] or 0) or messages
    return messages, segments


def read_sms_usage(
    session: Session, *, tenant_id: str, now: datetime | None = None
) -> SmsUsageRead:
    _subscription, plan = get_active_subscription(session, tenant_id)
    tenant = session.get(Tenant, tenant_id)
    settings = get_sms_settings_model(session, tenant_id=tenant_id)
    start, end = _month_bounds(now, tenant.timezone if tenant else "UTC")
    messages, segments = _counts(session, tenant_id, start, end)

    current = now or now_utc()
    day_start = current - timedelta(hours=24)
    messages_today = int(
        session.exec(
            select(func.count())
            .select_from(NotificationEvent)
            .where(*_base_filters(tenant_id), NotificationEvent.created_at >= day_start)
        ).one()
    )

    message_limit = settings.daily_message_limit
    monthly_segment_limit = settings.monthly_segment_limit
    plan_credits = active_sms_segment_credits(session, tenant_id)
    # The plan's included segments plus any top-up credits: the hard ceiling
    # a tenant cannot raise by editing its own SMS settings. A plan with no
    # SMS entitlement configured (limit 0, no credits) blocks all sending,
    # the same fail-closed default WhatsApp's monthly_whatsapp_message_limit
    # already uses.
    plan_segment_limit = effective_sms_segment_limit(session, tenant_id, plan)

    segment_ceilings = [plan_segment_limit]
    if monthly_segment_limit:
        segment_ceilings.append(monthly_segment_limit)
    effective_segment_ceiling = min(segment_ceilings)
    segments_remaining = max(effective_segment_ceiling - segments, 0)

    cost_per_segment = settings.cost_per_segment_paise
    estimated_cost = segments * cost_per_segment if cost_per_segment else None

    limit_reached = bool(
        segments >= effective_segment_ceiling
        or (message_limit and messages_today >= message_limit)
    )
    return SmsUsageRead(
        plan_name=plan.name,
        monthly_segment_limit=monthly_segment_limit,
        daily_message_limit=message_limit,
        plan_segment_limit=plan_segment_limit,
        plan_segment_credits=plan_credits,
        messages_used=messages,
        segments_used=segments,
        messages_used_today=messages_today,
        segments_remaining=segments_remaining,
        limit_reached=limit_reached,
        cost_per_segment_paise=cost_per_segment,
        estimated_cost_paise=estimated_cost,
        period_start=start.isoformat(),
        period_end=end.isoformat(),
    )


def enforce_sms_limits(session: Session, *, tenant_id: str, segments: int = 1) -> None:
    """Reject a send that would cross the plan ceiling or a tenant's own,
    tighter self-imposed volume limit."""
    usage = read_sms_usage(session, tenant_id=tenant_id)
    if usage.segments_used + segments > usage.plan_segment_limit:
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail="Monthly SMS segment limit reached for this plan."
            " Upgrade the plan or purchase SMS segment credits to continue.",
        )
    if (
        usage.monthly_segment_limit
        and usage.segments_used + segments > usage.monthly_segment_limit
    ):
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail="Monthly SMS segment limit reached",
        )
    if (
        usage.daily_message_limit
        and usage.messages_used_today >= usage.daily_message_limit
    ):
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail="Daily SMS message limit reached",
        )
