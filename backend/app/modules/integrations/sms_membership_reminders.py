"""Scheduled membership/package expiry reminder SMS (P1).

Mirrors `sms_reminders.queue_due_sms_appointment_reminders`'s shape but at
day granularity: an expiry date carries no time-of-day, so the dedupe key
and matching window are both dates, checked once the enrollment's expiry
date falls inside the configured lead window.
"""

from datetime import datetime, timedelta
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from sqlmodel import Session, select

from app.modules.integrations.models import TenantIntegrationPlugin
from app.modules.integrations.sms_service import PLUGIN_KEY, get_sms_settings_model
from app.modules.notifications.models import NotificationEvent
from app.modules.notifications.services.sms_events import queue_sms_template_if_allowed
from app.modules.patient_subscriptions.models import (
    PatientSubscriptionEnrollment,
    PatientSubscriptionEnrollmentStatus,
    PatientSubscriptionPlan,
)
from app.modules.patients.models import Patient
from app.modules.tenants.models import Tenant, now_utc


REMINDER_LEAD_DAYS = 3
FLOW_KEY = "membership_expiry_patient"


def _tenant_timezone(value: str) -> ZoneInfo:
    try:
        return ZoneInfo(value)
    except ZoneInfoNotFoundError:
        return ZoneInfo("UTC")


def queue_due_sms_membership_expiry_reminders(
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
        enrollments = session.exec(
            select(PatientSubscriptionEnrollment).where(
                PatientSubscriptionEnrollment.tenant_id == tenant.id,
                PatientSubscriptionEnrollment.status
                == PatientSubscriptionEnrollmentStatus.ACTIVE,
                PatientSubscriptionEnrollment.ends_on == target_date,
            )
        ).all()
        for enrollment in enrollments:
            dedupe_key = (
                f"sms:membership:{enrollment.id}:expiry:{target_date.isoformat()}"
            )
            exists = session.exec(
                select(NotificationEvent).where(
                    NotificationEvent.tenant_id == tenant.id,
                    NotificationEvent.dedupe_key == dedupe_key,
                )
            ).first()
            if exists:
                continue
            patient = session.get(Patient, enrollment.patient_id)
            if not patient:
                continue
            plan = session.get(PatientSubscriptionPlan, enrollment.plan_id)
            reminder = queue_sms_template_if_allowed(
                session,
                tenant_id=tenant.id,
                branch_id=enrollment.branch_id,
                flow_key=FLOW_KEY,
                patient=patient,
                resource_type="patient_subscription_enrollment",
                resource_id=enrollment.id,
                dedupe_key=dedupe_key,
                variables={
                    "patient_name": patient.full_name,
                    "plan_name": plan.name if plan else "membership",
                    "expiry_date": target_date.strftime("%d %b %Y"),
                },
            )
            if reminder:
                queued += 1
    return queued
