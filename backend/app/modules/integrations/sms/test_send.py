"""Administrator-triggered SMS test send.

Runs the same resolve-and-send path as the worker so a passing test actually
proves the tenant's credentials, sender header and approved template are usable.
Test sends bypass the outbox but write their provider result to the notification
ledger so billable segments appear in usage and invoice reconciliation.
"""

import json
import logging
from datetime import timedelta

from fastapi import HTTPException, status
from sqlmodel import Session, func, select

from app.infrastructure.integrations.factories import get_sms_gateway
from app.infrastructure.integrations.ports.messaging import normalize_mobile_number
from app.infrastructure.integrations.ports.sms import SmsGateway, SmsSendRequest
from app.modules.audit.service import record_audit_event
from app.modules.identity.models import User
from app.modules.integrations.sms.schemas import SmsTestRead, SmsTestRequest
from app.modules.integrations.sms.service import (
    get_sms_gateway_runtime_settings,
    get_sms_settings_model,
)
from app.modules.integrations.sms.templates import resolve_sms_template
from app.modules.integrations.sms.usage import enforce_sms_limits
from app.modules.notifications.models import (
    NotificationEvent,
    NotificationEventType,
    NotificationProvider,
    NotificationStatus,
)
from app.modules.tenants.models import now_utc


logger = logging.getLogger("medizinhub.sms")

TEST_SEND_RESOURCE_TYPE = "sms_integration_test"
# A test send is the one path that texts an operator-supplied number with no
# consent check, and a tenant that has set no volume limits has no other ceiling
# on it. Enough headroom to debug a template, not enough to send a campaign.
TEST_SENDS_PER_HOUR = 10


def _enforce_test_send_rate_limit(session: Session, *, tenant_id: str) -> None:
    since = now_utc() - timedelta(hours=1)
    recent = session.exec(
        select(func.count())
        .select_from(NotificationEvent)
        .where(
            NotificationEvent.tenant_id == tenant_id,
            NotificationEvent.resource_type == TEST_SEND_RESOURCE_TYPE,
            NotificationEvent.created_at >= since,
        )
    ).one()
    if int(recent or 0) >= TEST_SENDS_PER_HOUR:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=(
                f"SMS test send limit reached ({TEST_SENDS_PER_HOUR} per hour)."
                " Wait before sending another test."
            ),
        )


def send_sms_test(
    session: Session,
    *,
    tenant_id: str,
    payload: SmsTestRequest,
    actor: User,
    gateway: SmsGateway | None = None,
) -> SmsTestRead:
    try:
        runtime = get_sms_gateway_runtime_settings(session, tenant_id=tenant_id)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail=str(exc)
        ) from exc
    if not runtime.enabled:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Enable the tenant SMS integration before sending a test",
        )
    settings = get_sms_settings_model(session, tenant_id=tenant_id)
    _enforce_test_send_rate_limit(session, tenant_id=tenant_id)
    try:
        resolved = resolve_sms_template(
            settings,
            flow_key=payload.flow_key,
            values=dict(payload.variables),
            language=payload.language or settings.default_language,
        )
        destination = normalize_mobile_number(
            payload.mobile, settings.default_country_code
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)
        ) from exc

    enforce_sms_limits(
        session, tenant_id=tenant_id, segments=resolved.segment_estimate.segments
    )

    sender = gateway or get_sms_gateway(settings.provider)
    result = sender.send_sms(
        SmsSendRequest(
            destination=destination,
            body=resolved.body,
            template=resolved.template,
            client_reference=f"test:{tenant_id}",
            campaign_name=f"test_{payload.flow_key}",
            callback_url=None,
            unicode=resolved.segment_estimate.encoding == "unicode",
        ),
        credentials=runtime.credentials,
        mode=runtime.mode,
        api_url=runtime.api_url,
        timeout_seconds=runtime.timeout_seconds,
    )
    now = now_utc()
    event = NotificationEvent(
        tenant_id=tenant_id,
        provider=NotificationProvider.SMS,
        event_type=NotificationEventType.PATIENT_MESSAGE,
        status=(
            NotificationStatus.SENT if result.success else NotificationStatus.FAILED
        ),
        recipient=destination,
        subject="SMS integration test",
        message=json.dumps(dict(payload.variables)) or "{}",
        template_key=payload.flow_key,
        resource_type=TEST_SEND_RESOURCE_TYPE,
        resource_id=tenant_id,
        queued_by_user_id=actor.id,
        provider_adapter="smscountry",
        provider_message_id=result.external_message_id,
        provider_status=result.provider_status or None,
        provider_error_code=result.provider_error_code or None,
        delivery_status="accepted" if result.success else None,
        template_external_id=resolved.template.dlt_template_id,
        sender_id=resolved.template.sender_id,
        rendered_body_hash=resolved.body_hash,
        segment_count=(result.segment_count or resolved.segment_estimate.segments),
        failure_reason=None if result.success else result.message[:500],
        attempt_count=1,
        max_attempts=1,
        accepted_at=now if result.success else None,
        sent_at=now if result.success else None,
        updated_at=now,
    )
    session.add(event)
    session.commit()
    logger.info(
        "sms.test_send",
        extra={
            "tenant_id": tenant_id,
            "flow_key": payload.flow_key,
            "gateway_status": result.status,
        },
    )
    record_audit_event(
        session,
        tenant_id=tenant_id,
        actor_user_id=actor.id,
        action="communication.sms_test_sent",
        resource_type="tenant_integration_plugin",
        resource_id=tenant_id,
        purpose="integration_configuration",
        metadata_json=json.dumps(
            {
                "flow_key": payload.flow_key,
                "status": result.status,
                "segments": resolved.segment_estimate.segments,
            }
        ),
    )
    return SmsTestRead(
        success=result.success,
        status=result.status,
        message=result.message,
        external_message_id=result.external_message_id,
        segment_count=resolved.segment_estimate.segments,
        encoding=resolved.segment_estimate.encoding,
    )


# SMS integration domain package.
