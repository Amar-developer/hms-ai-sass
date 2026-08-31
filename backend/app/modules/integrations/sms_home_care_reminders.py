"""Scheduled home-care visit reminder SMS (P1).

The planned visit calendar for a booking is not stored directly - it is
derived from start_date/end_date/visit_day_mode, the same derivation billing
and the booking read model already use (visit_days.planned_visit_dates), so
this reminder can never disagree with what the tenant was actually billed
or shown as scheduled.
"""

from datetime import datetime, timedelta
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from sqlmodel import Session, select

from app.modules.home_care.models import HomeCareBooking
from app.modules.home_care.visit_days import parse_weekdays, planned_visit_dates
from app.modules.integrations.models import TenantIntegrationPlugin
from app.modules.integrations.sms_service import PLUGIN_KEY, get_sms_settings_model
from app.modules.notifications.models import NotificationEvent
from app.modules.notifications.services.sms_events import queue_sms_template_if_allowed
from app.modules.patients.models import Patient
from app.modules.tenants.models import Tenant, now_utc


REMINDER_LEAD_DAYS = 1
FLOW_KEY = "home_care_visit_reminder_patient"
ELIGIBLE_BOOKING_STATUSES = {"scheduled", "assigned", "in_progress"}


def _tenant_timezone(value: str) -> ZoneInfo:
    try:
        return ZoneInfo(value)
    except ZoneInfoNotFoundError:
        return ZoneInfo("UTC")


def queue_due_sms_home_care_visit_reminders(
    session: Session,
    *,
    now: datetime | None = None,
    lead_days: int = REMINDER_LEAD_DAYS,
) -> int:
    current = now or now_utc()
    queued = 0
    integrations = session.exec(
        select(TenantIntegrationPlugin).where(
            TenantIntegrationPlugin.plugin_key == PLUGIN_KEY,
            TenantIntegrationPlugin.enabled == True,  # noqa: E712
        )
    ).all()
    for integration in integrations:
        try:
            settings = get_sms_settings_model(session, tenant_id=integration.tenant_id)
        except Exception:
            continue
        if not settings.patient_notifications_enabled:
            continue
        flow = next(
            (
                item
                for item in settings.flows
                if item.flow_key == FLOW_KEY and item.enabled
            ),
            None,
        )
        if not flow:
            continue
        tenant = session.get(Tenant, integration.tenant_id)
        if not tenant:
            continue
        target_date = current.astimezone(
            _tenant_timezone(tenant.timezone)
        ).date() + timedelta(days=lead_days)
        bookings = session.exec(
            select(HomeCareBooking).where(
                HomeCareBooking.tenant_id == tenant.id,
                HomeCareBooking.status.in_(ELIGIBLE_BOOKING_STATUSES),
                HomeCareBooking.start_date <= target_date,
                (
                    HomeCareBooking.end_date.is_(None)
                    | (HomeCareBooking.end_date >= target_date)
                ),
            )
        ).all()
        for booking in bookings:
            visit_dates = planned_visit_dates(
                start_date=booking.start_date,
                end_date=booking.end_date,
                visit_day_mode=booking.visit_day_mode,
                visit_weekdays=parse_weekdays(booking.visit_weekdays_json),
            )
            if target_date not in visit_dates:
                continue
            dedupe_key = (
                f"sms:home_care_booking:{booking.id}:visit:{target_date.isoformat()}"
            )
            exists = session.exec(
                select(NotificationEvent).where(
                    NotificationEvent.tenant_id == tenant.id,
                    NotificationEvent.dedupe_key == dedupe_key,
                )
            ).first()
            if exists:
                continue
            patient = session.get(Patient, booking.patient_id)
            if not patient:
                continue
            reminder = queue_sms_template_if_allowed(
                session,
                tenant_id=tenant.id,
                branch_id=booking.branch_id,
                flow_key=FLOW_KEY,
                patient=patient,
                resource_type="home_care_booking",
                resource_id=booking.id,
                dedupe_key=dedupe_key,
                variables={
                    "patient_name": patient.full_name,
                    "visit_date": target_date.strftime("%d %b %Y"),
                },
            )
            if reminder:
                queued += 1
    return queued
