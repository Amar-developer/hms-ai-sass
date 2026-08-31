from datetime import datetime, timedelta
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from sqlmodel import Session, select

from app.modules.appointments.models import Appointment, AppointmentStatus
from app.modules.integrations.models import TenantIntegrationPlugin
from app.modules.integrations.service import decode_config
from app.modules.integrations.whatsapp.schemas import WhatsAppFlowSettings
from app.modules.notifications.models import NotificationEvent
from app.modules.notifications.services import events
from app.modules.patients.models import Patient
from app.modules.tenants.models import Tenant, now_utc


REMINDER_WINDOW_MINUTES = 5
ELIGIBLE_APPOINTMENT_STATUSES = {
    AppointmentStatus.SCHEDULED,
    AppointmentStatus.CONFIRMED,
}


def _tenant_timezone(value: str) -> ZoneInfo:
    try:
        return ZoneInfo(value)
    except ZoneInfoNotFoundError:
        return ZoneInfo("UTC")


def queue_due_whatsapp_appointment_reminders(
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
            TenantIntegrationPlugin.plugin_key == "whatsapp",
            TenantIntegrationPlugin.enabled == True,  # noqa: E712
        )
    ).all()
    for integration in integrations:
        config = decode_config(integration.config_json)
        flows = WhatsAppFlowSettings.model_validate(config.get("flows") or {})
        if not flows.appointment_reminder_patient or not config.get(
            "patient_notifications_enabled", True
        ):
            continue
        reminder_hours = [
            hours
            for hours, enabled in (
                (24, config.get("appointment_reminder_24h_enabled", False)),
                (2, config.get("appointment_reminder_2h_enabled", False)),
            )
            if enabled
        ]
        if not reminder_hours:
            continue
        tenant = session.get(Tenant, integration.tenant_id)
        if not tenant:
            continue
        timezone = _tenant_timezone(tenant.timezone)
        local_now = current.astimezone(timezone)
        target_dates = {
            (local_now + timedelta(hours=hours)).date() for hours in reminder_hours
        }
        appointments = session.exec(
            select(Appointment).where(
                Appointment.tenant_id == tenant.id,
                Appointment.status.in_(ELIGIBLE_APPOINTMENT_STATUSES),
                Appointment.appointment_date.in_(target_dates),
                Appointment.appointment_time.is_not(None),
            )
        ).all()
        for appointment in appointments:
            appointment_at = datetime.combine(
                appointment.appointment_date,
                appointment.appointment_time,
                tzinfo=timezone,
            )
            for hours in reminder_hours:
                target_start = local_now + timedelta(hours=hours)
                target_end = target_start + timedelta(minutes=window_minutes)
                if not target_start <= appointment_at < target_end:
                    continue
                dedupe_key = (
                    f"whatsapp:appointment:{appointment.id}:"
                    f"{appointment.appointment_date.isoformat()}:"
                    f"{appointment.appointment_time.strftime('%H%M')}:"
                    f"reminder:{hours}h"
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
                reminder = events.queue_whatsapp_template_if_allowed(
                    session,
                    tenant_id=tenant.id,
                    branch_id=appointment.branch_id,
                    flow_key="appointment_reminder_patient",
                    recipient=patient.mobile if patient else None,
                    resource_type="appointment",
                    resource_id=appointment.id,
                    dedupe_key=dedupe_key,
                )
                if reminder:
                    queued += 1
    return queued


# WhatsApp integration domain package.
