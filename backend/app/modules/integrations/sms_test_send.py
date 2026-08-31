"""Administrator-triggered SMS test send.

Runs the same resolve-and-send path as the worker so a passing test actually
proves the tenant's credentials, DLT identity and template are usable. Test
sends bypass the outbox: they leave no queue row and no patient record.
"""

import json
import logging

from fastapi import HTTPException, status
from sqlmodel import Session

from app.infrastructure.integrations.factories import get_sms_gateway
from app.infrastructure.integrations.ports.messaging import normalize_mobile_number
from app.infrastructure.integrations.ports.sms import SmsGateway, SmsSendRequest
from app.modules.audit.service import record_audit_event
from app.modules.identity.models import User
from app.modules.integrations.sms_schemas import SmsTestRead, SmsTestRequest
from app.modules.integrations.sms_service import (
    get_sms_gateway_runtime_settings,
    get_sms_settings_model,
)
from app.modules.integrations.sms_templates import resolve_sms_template
from app.modules.integrations.sms_usage import enforce_sms_limits


logger = logging.getLogger("medizinhub.sms")


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
