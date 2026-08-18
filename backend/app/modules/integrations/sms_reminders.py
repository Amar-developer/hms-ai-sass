"""Scheduled appointment reminder SMS.

Mirrors `whatsapp_reminders.queue_due_whatsapp_appointment_reminders` but at a
single fixed offset: SMS has no per-tenant reminder-window configuration (that
is a WhatsApp-only setting), so every tenant with the flow enabled is reminded
at one offset rather than the WhatsApp 24h/2h pair.
"""

from datetime import datetime, timedelta
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from sqlmodel import Session, select

from app.modules.appointments.models import Appointment, AppointmentStatus
from app.modules.integrations.models import TenantIntegrationPlugin
from app.modules.integrations.sms_service import PLUGIN_KEY, get_sms_settings_model
from app.modules.notifications.models import NotificationEvent
from app.modules.notifications.services.sms_events import queue_sms_template_if_allowed
from app.modules.patients.models import Patient
from app.modules.tenants.models import Tenant, now_utc


REMINDER_WINDOW_MINUTES = 5
REMINDER_HOURS_BEFORE = 24
ELIGIBLE_APPOINTMENT_STATUSES = {
    AppointmentStatus.SCHEDULED,
    AppointmentStatus.CONFIRMED,
    AppointmentStatus.WAITING,
}


def _tenant_timezone(value: str) -> ZoneInfo:
    try:
        return ZoneInfo(value)
    except ZoneInfoNotFoundError:
        return ZoneInfo("UTC")


def queue_due_sms_appointment_reminders(
    session: Session,
    *,
    now: datetime | None = None,
    window_minutes: int = REMINDER_WINDOW_MINUTES,
) -> int:
    current = now or now_utc()
    if current.tzinfo is None:
        current = current.replace(tzinfo=ZoneInfo("UTC"))
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
                if item.flow_key == "appointment_reminder_patient" and item.enabled
            ),
            None,
        )
        if not flow:
            continue
        tenant = session.get(Tenant, integration.tenant_id)
        if not tenant:
            continue
        timezone = _tenant_timezone(tenant.timezone)
        local_now = current.astimezone(timezone)
        target_start = local_now + timedelta(hours=REMINDER_HOURS_BEFORE)
        target_end = target_start + timedelta(minutes=window_minutes)
        target_date = target_start.date()
        appointments = session.exec(
            select(Appointment).where(
                Appointment.tenant_id == tenant.id,
                Appointment.status.in_(ELIGIBLE_APPOINTMENT_STATUSES),
                Appointment.appointment_date == target_date,
                Appointment.appointment_time.is_not(None),
            )
        ).all()
        for appointment in appointments:
            appointment_at = datetime.combine(
                appointment.appointment_date,
                appointment.appointment_time,
                tzinfo=timezone,
            )
            if not target_start <= appointment_at < target_end:
                continue
            dedupe_key = (
                f"sms:appointment:{appointment.id}:"
                f"{appointment.appointment_date.isoformat()}:"
                f"{appointment.appointment_time.strftime('%H%M')}:"
                f"reminder:{REMINDER_HOURS_BEFORE}h"
            )
            exists = session.exec(
                select(NotificationEvent).where(
                    NotificationEvent.tenant_id == tenant.id,
                    NotificationEvent.dedupe_key == dedupe_key,
                )
            ).first()
            if exists:
                continue
            patient = session.get(Patient, appointment.patient_id)
            if not patient:
                continue
            reminder = queue_sms_template_if_allowed(
                session,
                tenant_id=tenant.id,
                branch_id=appointment.branch_id,
                flow_key="appointment_reminder_patient",
                patient=patient,
                resource_type="appointment",
                resource_id=appointment.id,
                dedupe_key=dedupe_key,
                variables={
                    "patient_name": patient.full_name,
                    "appointment_date": appointment.appointment_date.strftime(
                        "%d %b %Y"
                    ),
                    "appointment_time": (
                        appointment.appointment_time.strftime("%I:%M %p")
                        if appointment.appointment_time
                        else ""
                    ),
                },
            )
            if reminder:
                queued += 1
    return queued
