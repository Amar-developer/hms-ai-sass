"""Queues one SMS as a DLT-approved template, never as free text.

Kept apart from `events.queue_whatsapp_template_if_allowed`: SMS templates are
tenant-configured and DLT-registered per flow (not a fixed enum of booleans
like the WhatsApp flow list), and only patient-facing flows exist in the P0
set, so the entitlement, consent, and rendering rules are SMS-specific enough
to not share one function with WhatsApp.
"""

import json

from fastapi import HTTPException
from sqlmodel import Session, select

from app.modules.audit.service import record_audit_event
from app.modules.integrations.sms.consent import (
    patient_allows_sms,
    patient_sms_destination,
    patient_sms_language,
)
from app.modules.integrations.sms.service import PLUGIN_KEY, get_sms_settings_model
from app.modules.integrations.sms.usage import enforce_sms_limits
from app.modules.integrations.sms.templates import select_sms_flow
from app.modules.integrations.service import get_tenant_plugin
from app.modules.notifications.models import (
    NotificationEvent,
    NotificationEventType,
    NotificationProvider,
)
from app.modules.patients.models import Patient
from app.modules.subscriptions.service import enforce_module_enabled
from app.modules.tenants.models import now_utc


# How each SMS flow reports in the admin queue and health dashboards. A flow
# missing from here falls back to PATIENT_MESSAGE, so keep it in step with
# SmsFlowKey when a flow is added.
_EVENT_TYPE_BY_FLOW = {
    "appointment_booked_patient": NotificationEventType.APPOINTMENT_REMINDER,
}


def queue_sms_template_if_allowed(
    session: Session,
    *,
    tenant_id: str,
    branch_id: str | None,
    flow_key: str,
    patient: Patient | None,
    resource_type: str,
    resource_id: str,
    dedupe_key: str,
    variables: dict[str, object],
    queued_by_user_id: str | None = None,
) -> NotificationEvent | None:
    """Persist an SMS outbox row for an approved template flow.

    Returns None (and queues nothing) for every reason a send would later be
    refused - disabled module, disabled integration, disabled or unapproved
    flow, missing consent, no usable number, over a volume limit, or a
    duplicate of an already-queued dedupe key. Callers should not treat a
    None return as an error; it is the normal outcome for a tenant that has
    not enabled this workflow yet.
    """
    try:
        enforce_module_enabled(session, tenant_id, PLUGIN_KEY)
    except HTTPException:
        return None
    integration = get_tenant_plugin(session, tenant_id, PLUGIN_KEY)
    if not integration or not integration.enabled or not integration.secret_ciphertext:
        return None
    try:
        settings = get_sms_settings_model(session, tenant_id=tenant_id)
    except HTTPException:
        return None
    if not settings.patient_notifications_enabled:
        return None
    # A tenant may keep several templates registered for one flow_key across
    # languages; this only confirms the workflow is live at all. The worker
    # picks the language-specific template at send time via resolve_sms_template.
    try:
        flow = select_sms_flow(settings, flow_key, patient_sms_language(patient))
    except ValueError:
        return None
    if (
        not flow.approved_by_provider
        or not flow.dlt_template_id
        or not settings.default_sender_id
    ):
        return None
    if not patient_allows_sms(patient, classification=flow.classification):
        return None
    recipient = patient_sms_destination(patient, settings.default_country_code)
    if not recipient:
        return None
    existing = session.exec(
        select(NotificationEvent).where(
            NotificationEvent.tenant_id == tenant_id,
            NotificationEvent.dedupe_key == dedupe_key,
        )
    ).first()
    if existing:
        return existing
    try:
        # The exact segment count is only known once the worker renders the
        # template; one segment is a conservative floor for this soft gate.
        enforce_sms_limits(session, tenant_id=tenant_id, segments=1)
    except HTTPException:
        return None
    event = NotificationEvent(
        tenant_id=tenant_id,
        branch_id=branch_id,
        provider=NotificationProvider.SMS,
        event_type=_EVENT_TYPE_BY_FLOW.get(
            flow_key, NotificationEventType.PATIENT_MESSAGE
        ),
        recipient=recipient,
        subject="SMS template notification",
        message=json.dumps({str(k): v for k, v in variables.items()}),
        template_key=flow_key,
        dedupe_key=dedupe_key,
        resource_type=resource_type,
        resource_id=resource_id,
        queued_by_user_id=queued_by_user_id,
        max_attempts=settings.max_attempts,
        next_attempt_at=now_utc(),
    )
    session.add(event)
    session.commit()
    session.refresh(event)
    record_audit_event(
        session,
        tenant_id=tenant_id,
        branch_id=branch_id,
        actor_user_id=queued_by_user_id,
        action="notification.queued",
        resource_type="notification_event",
        resource_id=event.id,
        purpose="communication",
        metadata_json=json.dumps({"provider": "sms", "flow_key": flow_key}),
    )
    return event
