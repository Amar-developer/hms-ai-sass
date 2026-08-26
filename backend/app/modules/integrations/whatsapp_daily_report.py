"""Queue the tenant administrator's end-of-day WhatsApp clinic report."""

import logging
from datetime import date, datetime, timezone
from decimal import Decimal
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from sqlmodel import Session, select

from app.modules.appointments.models import Appointment, AppointmentStatus
from app.modules.billing.models import Invoice, InvoiceStatus
from app.modules.home_care.models import HomeCareBooking, HomeCareVisitLog
from app.modules.home_care.visit_days import parse_weekdays, planned_visit_dates
from app.modules.identity.models import User
from app.modules.integrations.service import decode_config, get_tenant_plugin
from app.modules.lab.models import LabOrder, LabOrderStatus
from app.modules.notifications.models import NotificationEvent
from app.modules.notifications.services.events import queue_whatsapp_template_if_allowed
from app.modules.tenants.models import Tenant, TenantStatus, now_utc


FLOW_KEY = "admin_daily_report"
SEND_HOUR = 22
logger = logging.getLogger("medizinhub.whatsapp_daily_report")


def build_daily_report_context(
    session: Session, *, tenant_id: str, report_date: date
) -> dict[str, str]:
    """Freeze the eight approved template values for one tenant and date."""
    appointments = session.exec(
        select(Appointment).where(
            Appointment.tenant_id == tenant_id,
            Appointment.appointment_date == report_date,
        )
    ).all()
    completed_appointments = sum(
        item.status
        in {AppointmentStatus.CONSULTATION_COMPLETED, AppointmentStatus.BILLED}
        for item in appointments
    )

    lab_orders = session.exec(
        select(LabOrder).where(
            LabOrder.tenant_id == tenant_id,
            LabOrder.order_date == report_date,
        )
    ).all()
    completed_labs = sum(
        item.status in {LabOrderStatus.RESULT_READY, LabOrderStatus.REPORT_DELIVERED}
        for item in lab_orders
    )

    bookings = session.exec(
        select(HomeCareBooking).where(
            HomeCareBooking.tenant_id == tenant_id,
            HomeCareBooking.start_date <= report_date,
            (HomeCareBooking.end_date.is_(None))
            | (HomeCareBooking.end_date >= report_date),
            HomeCareBooking.status != "cancelled",
        )
    ).all()
    due_booking_ids = {
        booking.id
        for booking in bookings
        if report_date
        in planned_visit_dates(
            start_date=booking.start_date,
            end_date=booking.end_date,
            visit_day_mode=booking.visit_day_mode,
            visit_weekdays=parse_weekdays(booking.visit_weekdays_json),
        )
    }
    completed_homecare_ids = set(
        session.exec(
            select(HomeCareVisitLog.booking_id).where(
                HomeCareVisitLog.tenant_id == tenant_id,
                HomeCareVisitLog.visit_date == report_date,
                HomeCareVisitLog.status == "completed",
                HomeCareVisitLog.booking_id.in_(due_booking_ids),
            )
        ).all()
        if due_booking_ids
        else []
    )

    pending_invoices = session.exec(
        select(Invoice).where(
            Invoice.tenant_id == tenant_id,
            Invoice.balance_amount > Decimal("0"),
            Invoice.status.notin_([InvoiceStatus.CANCELLED, InvoiceStatus.REFUNDED]),
        )
    ).all()

    return {
        "report_date": report_date.strftime("%d %B %Y"),
        "appointments_completed": str(completed_appointments),
        "appointments_not_completed": str(len(appointments) - completed_appointments),
        "lab_bookings_completed": str(completed_labs),
        "lab_bookings_not_completed": str(len(lab_orders) - completed_labs),
        "homecare_completed": str(len(completed_homecare_ids)),
        "homecare_not_completed": str(len(due_booking_ids - completed_homecare_ids)),
        "pending_invoices": str(len(pending_invoices)),
    }


def selected_admin_recipients(
    session: Session, tenant_id: str, user_ids: list[str]
) -> list[User]:
    if not user_ids:
        return []
    users = session.exec(
        select(User).where(
            User.tenant_id == tenant_id,
            User.id.in_(user_ids),
            User.is_active == True,  # noqa: E712
            User.mobile.is_not(None),
        )
    ).all()
    by_id = {user.id: user for user in users if str(user.mobile or "").strip()}
    return [by_id[user_id] for user_id in user_ids if user_id in by_id]


def queue_due_whatsapp_admin_daily_reports(
    session: Session, *, now: datetime | None = None
) -> int:
    """Queue each local day's report once after 22:00 in the tenant timezone."""
    current = now or now_utc()
    if current.tzinfo is None:
        current = current.replace(tzinfo=timezone.utc)
    queued = 0
    tenants = session.exec(
        select(Tenant).where(Tenant.status != TenantStatus.SUSPENDED)
    ).all()
    for tenant in tenants:
        try:
            local_now = current.astimezone(ZoneInfo(tenant.timezone))
        except ZoneInfoNotFoundError:
            logger.warning(
                "whatsapp_daily_report.invalid_tenant_timezone",
                extra={"tenant_id": tenant.id, "timezone": tenant.timezone},
            )
            local_now = current.astimezone(timezone.utc)
        if local_now.hour < SEND_HOUR:
            continue

        report_date = local_now.date()
        integration = get_tenant_plugin(session, tenant.id, "whatsapp")
        config = decode_config(integration.config_json) if integration else {}
        recipients = selected_admin_recipients(
            session,
            tenant.id,
            list(config.get("admin_recipient_user_ids") or []),
        )
        if not recipients:
            continue
        context = build_daily_report_context(
            session, tenant_id=tenant.id, report_date=report_date
        )
        for recipient in recipients:
            dedupe_key = (
                f"whatsapp:{FLOW_KEY}:{tenant.id}:{recipient.id}:"
                f"{report_date.isoformat()}"
            )
            existed = session.exec(
                select(NotificationEvent.id).where(
                    NotificationEvent.tenant_id == tenant.id,
                    NotificationEvent.dedupe_key == dedupe_key,
                )
            ).first()
            event = queue_whatsapp_template_if_allowed(
                session,
                tenant_id=tenant.id,
                branch_id=None,
                flow_key=FLOW_KEY,
                recipient=recipient.mobile,
                recipient_name=recipient.name,
                resource_type="tenant",
                resource_id=tenant.id,
                dedupe_key=dedupe_key,
                context=context,
            )
            if event is not None and not existed:
                queued += 1
    return queued
