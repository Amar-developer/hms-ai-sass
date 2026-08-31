"""Provider-invoice reconciliation for SMS.

Compares what SMSCountry billed for a period against what this system
recorded as sent, so a discrepancy - a dropped delivery receipt, a
double-count, a provider billing error - surfaces before it becomes a
support ticket at month end.
"""

from datetime import date, datetime, time, timedelta, timezone

from fastapi import HTTPException, status
from sqlalchemy import func
from sqlmodel import Session, select

from app.modules.identity.models import User
from app.modules.integrations.models import SmsProviderReconciliation
from app.modules.integrations.sms_schemas import (
    SmsReconciliationCreate,
    SmsReconciliationRead,
)
from app.modules.integrations.sms_service import PLUGIN_KEY
from app.modules.notifications.models import (
    NotificationEvent,
    NotificationProvider,
    NotificationStatus,
)
from app.modules.subscriptions.service import enforce_module_enabled
from app.modules.tenants.models import now_utc


def _internal_segments(session: Session, tenant_id: str, start: date, end: date) -> int:
    start_at = datetime.combine(start, time.min, tzinfo=timezone.utc)
    end_at = datetime.combine(end + timedelta(days=1), time.min, tzinfo=timezone.utc)
    filters = (
        NotificationEvent.tenant_id == tenant_id,
        NotificationEvent.provider == NotificationProvider.SMS,
        NotificationEvent.template_key.is_not(None),
        NotificationEvent.status != NotificationStatus.CANCELLED,
        NotificationEvent.created_at >= start_at,
        NotificationEvent.created_at < end_at,
    )
    row = session.exec(
        select(
            func.count(NotificationEvent.id),
            func.coalesce(func.sum(NotificationEvent.segment_count), 0),
        ).where(*filters)
    ).one()
    messages = int(row[0] or 0)
    # A row not yet sent has no segment_count yet; it still costs at least
    # one segment once it does send, the same floor sms_usage.read_sms_usage
    # applies.
    return int(row[1] or 0) or messages


def _read(row: SmsProviderReconciliation) -> SmsReconciliationRead:
    return SmsReconciliationRead(
        id=row.id,
        period_start=row.period_start.isoformat(),
        period_end=row.period_end.isoformat(),
        provider_billed_segments=row.provider_billed_segments,
        provider_amount_paise=row.provider_amount_paise,
        internal_segments=row.internal_segments,
        variance_segments=row.variance_segments,
        notes=row.notes,
        recorded_by_user_id=row.recorded_by_user_id,
        created_at=row.created_at.isoformat(),
    )


def record_sms_reconciliation(
    session: Session,
    *,
    tenant_id: str,
    payload: SmsReconciliationCreate,
    actor: User,
) -> SmsReconciliationRead:
    enforce_module_enabled(session, tenant_id, PLUGIN_KEY)
    try:
        start = date.fromisoformat(payload.period_start)
        end = date.fromisoformat(payload.period_end)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="period_start and period_end must be ISO dates",
        ) from exc
    if end < start:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="period_end cannot be before period_start",
        )
    internal_segments = _internal_segments(session, tenant_id, start, end)
    row = SmsProviderReconciliation(
        tenant_id=tenant_id,
        period_start=start,
        period_end=end,
        provider_billed_segments=payload.provider_billed_segments,
        provider_amount_paise=payload.provider_amount_paise,
        internal_segments=internal_segments,
        variance_segments=payload.provider_billed_segments - internal_segments,
        notes=payload.notes,
        recorded_by_user_id=actor.id,
        created_at=now_utc(),
    )
    session.add(row)
    session.commit()
    session.refresh(row)
    return _read(row)


def list_sms_reconciliations(
    session: Session, *, tenant_id: str, limit: int = 24, offset: int = 0
) -> list[SmsReconciliationRead]:
    enforce_module_enabled(session, tenant_id, PLUGIN_KEY)
    rows = session.exec(
        select(SmsProviderReconciliation)
        .where(SmsProviderReconciliation.tenant_id == tenant_id)
        .order_by(SmsProviderReconciliation.period_start.desc())
        .offset(offset)
        .limit(limit)
    ).all()
    return [_read(row) for row in rows]
