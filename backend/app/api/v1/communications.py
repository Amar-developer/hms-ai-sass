from datetime import date

from fastapi import (
    APIRouter,
    Depends,
    Header,
    HTTPException,
    Query,
    Request,
    Response,
    status,
)
from sqlmodel import Session

from app.core.auth import require_any_permission
from app.core.database import get_session
from app.core.tenant_context import require_tenant_id
from app.modules.identity import permissions
from app.modules.identity.models import User
from app.modules.integrations.whatsapp_schemas import (
    WhatsAppIntegrationRead,
    WhatsAppIntegrationUpdate,
    WhatsAppQueueItemRead,
    WhatsAppQueueListRead,
    WhatsAppTestRead,
    WhatsAppTestRequest,
)
from app.modules.integrations.sms_schemas import (
    SmsDeliveryReceiptRead,
    SmsHealthRead,
    SmsQueueItemRead,
    SmsQueueListRead,
    SmsReadinessRead,
    SmsReadinessUpdate,
    SmsReconciliationCreate,
    SmsReconciliationRead,
    SmsSettingsRead,
    SmsSettingsUpdate,
    SmsTestRead,
    SmsTestRequest,
    SmsUsageRead,
)
from app.modules.integrations.sms_reconciliation import (
    list_sms_reconciliations,
    record_sms_reconciliation,
)
from app.modules.integrations.sms_delivery_receipts import (
    parse_receipt_body,
    record_delivery_receipt,
    verify_receipt_signature,
    webhook_secret_for_tenant,
)
from app.modules.integrations.sms_health import read_sms_health
from app.modules.integrations.sms_queue_service import (
    cancel_sms_notification,
    list_sms_queue,
    retry_sms_notification,
)
from app.modules.integrations.sms_test_send import send_sms_test
from app.modules.integrations.sms_usage import read_sms_usage
from app.modules.integrations.sms_service import (
    get_sms_readiness,
    get_sms_settings,
    update_sms_readiness,
    update_sms_settings,
)
from app.modules.integrations.whatsapp_service import (
    get_whatsapp_integration,
    test_whatsapp_integration,
    update_whatsapp_integration,
)
from app.modules.integrations.invoice_receipts import (
    render_invoice_receipt_pdf,
    verify_invoice_receipt_signature,
)
from app.modules.integrations.document_links import verify_document_signature
from app.modules.files.models import FileDocument
from app.modules.files.services.artifact_service import ArtifactService
from app.modules.integrations.whatsapp_queue_service import (
    cancel_whatsapp_notification,
    list_whatsapp_queue,
    retry_whatsapp_notification,
)


router = APIRouter(prefix="/communications")


@router.get(
    "/public/document-artifacts/{file_id}",
    response_class=Response,
    summary="Download an exact artifact through a short-lived signed link",
)
def public_document_artifact(
    file_id: str,
    tenant_id: str = Query(min_length=3, max_length=80),
    expires: int = Query(gt=0),
    signature: str = Query(min_length=40, max_length=100),
    session: Session = Depends(get_session),
) -> Response:
    verify_document_signature(
        tenant_id=tenant_id, file_id=file_id, expires=expires, signature=signature
    )
    row = session.get(FileDocument, file_id)
    if not row or row.tenant_id != tenant_id or row.document_status != "ready":
        return Response(status_code=404)
    content = ArtifactService.read_bytes(row)
    safe_name = row.file_name.replace('"', "").replace("\r", "").replace("\n", "")
    return Response(
        content=content,
        media_type=row.content_type or "application/octet-stream",
        headers={
            "Content-Disposition": f'attachment; filename="{safe_name}"',
            "Cache-Control": "private, no-store, max-age=0",
            "X-Content-Type-Options": "nosniff",
        },
    )


WHATSAPP_SETTINGS_PERMISSIONS = (
    permissions.COMMUNICATIONS_WHATSAPP_MANAGE,
    permissions.COMMUNICATIONS_MANAGE,
    permissions.SETTINGS_MANAGE,
)
SMS_SETTINGS_PERMISSIONS = (
    permissions.COMMUNICATIONS_SMS_MANAGE,
    permissions.COMMUNICATIONS_MANAGE,
    permissions.SETTINGS_MANAGE,
)


@router.get(
    "/public/invoice-receipts/{invoice_id}.pdf",
    response_class=Response,
    summary="Download a short-lived signed invoice receipt",
)
def public_invoice_receipt(
    invoice_id: str,
    tenant_id: str = Query(min_length=3, max_length=80),
    file_id: str | None = Query(default=None, min_length=3, max_length=120),
    expires: int = Query(gt=0),
    signature: str = Query(min_length=40, max_length=100),
    session: Session = Depends(get_session),
) -> Response:
    verify_invoice_receipt_signature(
        tenant_id=tenant_id,
        invoice_id=invoice_id,
        file_id=file_id,
        expires=expires,
        signature=signature,
    )
    pdf, filename = render_invoice_receipt_pdf(
        session, tenant_id=tenant_id, invoice_id=invoice_id, file_id=file_id
    )
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Cache-Control": "private, no-store, max-age=0",
            "X-Content-Type-Options": "nosniff",
        },
    )


@router.get(
    "/whatsapp/settings",
    response_model=WhatsAppIntegrationRead,
    summary="Get tenant WhatsApp integration settings",
)
def read_whatsapp_settings(
    tenant_id: str = Depends(require_tenant_id),
    _current_user: User = Depends(
        require_any_permission(*WHATSAPP_SETTINGS_PERMISSIONS)
    ),
    session: Session = Depends(get_session),
) -> WhatsAppIntegrationRead:
    return get_whatsapp_integration(session, tenant_id=tenant_id)


@router.put(
    "/whatsapp/settings",
    response_model=WhatsAppIntegrationRead,
    summary="Update tenant WhatsApp integration settings",
)
def save_whatsapp_settings(
    payload: WhatsAppIntegrationUpdate,
    tenant_id: str = Depends(require_tenant_id),
    current_user: User = Depends(
        require_any_permission(*WHATSAPP_SETTINGS_PERMISSIONS)
    ),
    session: Session = Depends(get_session),
) -> WhatsAppIntegrationRead:
    return update_whatsapp_integration(
        session,
        tenant_id=tenant_id,
        payload=payload,
        actor=current_user,
    )


@router.get(
    "/sms/settings",
    response_model=SmsSettingsRead,
    summary="Get tenant SMS settings",
)
def read_sms_settings(
    tenant_id: str = Depends(require_tenant_id),
    _current_user: User = Depends(require_any_permission(*SMS_SETTINGS_PERMISSIONS)),
    session: Session = Depends(get_session),
) -> SmsSettingsRead:
    return get_sms_settings(session, tenant_id=tenant_id)


@router.put(
    "/sms/settings",
    response_model=SmsSettingsRead,
    summary="Update tenant SMS settings",
)
def save_sms_settings(
    payload: SmsSettingsUpdate,
    tenant_id: str = Depends(require_tenant_id),
    current_user: User = Depends(require_any_permission(*SMS_SETTINGS_PERMISSIONS)),
    session: Session = Depends(get_session),
) -> SmsSettingsRead:
    return update_sms_settings(
        session,
        tenant_id=tenant_id,
        payload=payload,
        actor=current_user,
    )


@router.get(
    "/sms/readiness",
    response_model=SmsReadinessRead,
    summary="Get tenant SMSCountry and DLT readiness",
)
def read_sms_readiness(
    tenant_id: str = Depends(require_tenant_id),
    _current_user: User = Depends(require_any_permission(*SMS_SETTINGS_PERMISSIONS)),
    session: Session = Depends(get_session),
) -> SmsReadinessRead:
    return get_sms_readiness(session, tenant_id=tenant_id)


@router.put(
    "/sms/readiness",
    response_model=SmsReadinessRead,
    summary="Update tenant SMSCountry and DLT readiness",
)
def save_sms_readiness(
    payload: SmsReadinessUpdate,
    tenant_id: str = Depends(require_tenant_id),
    current_user: User = Depends(require_any_permission(*SMS_SETTINGS_PERMISSIONS)),
    session: Session = Depends(get_session),
) -> SmsReadinessRead:
    return update_sms_readiness(
        session,
        tenant_id=tenant_id,
        payload=payload,
        actor=current_user,
    )


@router.post(
    "/whatsapp/test",
    response_model=WhatsAppTestRead,
    summary="Send a tenant WhatsApp template test message",
)
def send_whatsapp_test(
    payload: WhatsAppTestRequest,
    tenant_id: str = Depends(require_tenant_id),
    current_user: User = Depends(
        require_any_permission(*WHATSAPP_SETTINGS_PERMISSIONS)
    ),
    session: Session = Depends(get_session),
) -> WhatsAppTestRead:
    return test_whatsapp_integration(
        session,
        tenant_id=tenant_id,
        payload=payload,
        actor=current_user,
    )


@router.get(
    "/whatsapp/queue",
    response_model=WhatsAppQueueListRead,
    summary="List the tenant template delivery queue",
)
def read_whatsapp_queue(
    status_filter: str | None = None,
    flow_key: str | None = None,
    q: str | None = Query(default=None, max_length=160),
    from_date: date | None = None,
    to_date: date | None = None,
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    tenant_id: str = Depends(require_tenant_id),
    _current_user: User = Depends(
        require_any_permission(*WHATSAPP_SETTINGS_PERMISSIONS)
    ),
    session: Session = Depends(get_session),
) -> WhatsAppQueueListRead:
    return list_whatsapp_queue(
        session,
        tenant_id=tenant_id,
        status_filter=status_filter,
        flow_key=flow_key,
        q=q,
        from_date=from_date,
        to_date=to_date,
        limit=limit,
        offset=offset,
    )


@router.post(
    "/whatsapp/queue/{event_id}/retry",
    response_model=WhatsAppQueueItemRead,
    summary="Retry a failed tenant template notification",
)
def retry_whatsapp_queue_item(
    event_id: str,
    tenant_id: str = Depends(require_tenant_id),
    current_user: User = Depends(
        require_any_permission(*WHATSAPP_SETTINGS_PERMISSIONS)
    ),
    session: Session = Depends(get_session),
) -> WhatsAppQueueItemRead:
    return retry_whatsapp_notification(
        session, tenant_id=tenant_id, event_id=event_id, actor=current_user
    )


@router.post(
    "/whatsapp/queue/{event_id}/cancel",
    response_model=WhatsAppQueueItemRead,
    summary="Cancel a queued tenant template notification",
)
def cancel_whatsapp_queue_item(
    event_id: str,
    tenant_id: str = Depends(require_tenant_id),
    current_user: User = Depends(
        require_any_permission(*WHATSAPP_SETTINGS_PERMISSIONS)
    ),
    session: Session = Depends(get_session),
) -> WhatsAppQueueItemRead:
    return cancel_whatsapp_notification(
        session, tenant_id=tenant_id, event_id=event_id, actor=current_user
    )


@router.post(
    "/sms/test",
    response_model=SmsTestRead,
    summary="Send a tenant SMS template test message",
)
def send_sms_test_message(
    payload: SmsTestRequest,
    tenant_id: str = Depends(require_tenant_id),
    current_user: User = Depends(require_any_permission(*SMS_SETTINGS_PERMISSIONS)),
    session: Session = Depends(get_session),
) -> SmsTestRead:
    return send_sms_test(
        session,
        tenant_id=tenant_id,
        payload=payload,
        actor=current_user,
    )


@router.get(
    "/sms/queue",
    response_model=SmsQueueListRead,
    summary="List the tenant SMS delivery queue",
)
def read_sms_queue(
    status_filter: str | None = None,
    flow_key: str | None = None,
    q: str | None = Query(default=None, max_length=160),
    from_date: date | None = None,
    to_date: date | None = None,
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    tenant_id: str = Depends(require_tenant_id),
    _current_user: User = Depends(require_any_permission(*SMS_SETTINGS_PERMISSIONS)),
    session: Session = Depends(get_session),
) -> SmsQueueListRead:
    return list_sms_queue(
        session,
        tenant_id=tenant_id,
        status_filter=status_filter,
        flow_key=flow_key,
        q=q,
        from_date=from_date,
        to_date=to_date,
        limit=limit,
        offset=offset,
    )


@router.post(
    "/sms/queue/{event_id}/retry",
    response_model=SmsQueueItemRead,
    summary="Retry a failed tenant SMS notification",
)
def retry_sms_queue_item(
    event_id: str,
    tenant_id: str = Depends(require_tenant_id),
    current_user: User = Depends(require_any_permission(*SMS_SETTINGS_PERMISSIONS)),
    session: Session = Depends(get_session),
) -> SmsQueueItemRead:
    return retry_sms_notification(
        session, tenant_id=tenant_id, event_id=event_id, actor=current_user
    )


@router.post(
    "/sms/queue/{event_id}/cancel",
    response_model=SmsQueueItemRead,
    summary="Cancel a queued tenant SMS notification",
)
def cancel_sms_queue_item(
    event_id: str,
    tenant_id: str = Depends(require_tenant_id),
    current_user: User = Depends(require_any_permission(*SMS_SETTINGS_PERMISSIONS)),
    session: Session = Depends(get_session),
) -> SmsQueueItemRead:
    return cancel_sms_notification(
        session, tenant_id=tenant_id, event_id=event_id, actor=current_user
    )


@router.get(
    "/sms/usage",
    response_model=SmsUsageRead,
    summary="Get tenant SMS message and segment usage",
)
def read_sms_usage_summary(
    tenant_id: str = Depends(require_tenant_id),
    _current_user: User = Depends(require_any_permission(*SMS_SETTINGS_PERMISSIONS)),
    session: Session = Depends(get_session),
) -> SmsUsageRead:
    return read_sms_usage(session, tenant_id=tenant_id)


@router.get(
    "/sms/health",
    response_model=SmsHealthRead,
    summary="Get tenant SMS queue and delivery health",
)
def read_sms_health_summary(
    tenant_id: str = Depends(require_tenant_id),
    _current_user: User = Depends(require_any_permission(*SMS_SETTINGS_PERMISSIONS)),
    session: Session = Depends(get_session),
) -> SmsHealthRead:
    return read_sms_health(session, tenant_id=tenant_id)


@router.post(
    "/sms/delivery-receipt/{tenant_id}",
    response_model=SmsDeliveryReceiptRead,
    summary="Accept an SMSCountry delivery receipt callback",
)
async def accept_sms_delivery_receipt(
    tenant_id: str,
    request: Request,
    x_signature: str | None = Header(default=None, alias="X-Signature"),
    session: Session = Depends(get_session),
) -> SmsDeliveryReceiptRead:
    """Unauthenticated by design - the provider cannot hold a session.

    The tenant's stored webhook secret is the only credential; a callback that
    does not carry a valid HMAC over the exact request body is refused before
    any lookup happens, so this route cannot be used to probe message ids.
    """
    raw_body = await request.body()
    secret = webhook_secret_for_tenant(session, tenant_id=tenant_id)
    if not verify_receipt_signature(
        secret=secret, raw_body=raw_body, signature=x_signature
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid delivery receipt signature",
        )
    return record_delivery_receipt(
        session,
        tenant_id=tenant_id,
        payload=parse_receipt_body(raw_body),
    )


@router.post(
    "/sms/reconciliation",
    response_model=SmsReconciliationRead,
    status_code=status.HTTP_201_CREATED,
    summary="Record a provider SMS invoice for reconciliation against internal usage",
)
def create_sms_reconciliation(
    payload: SmsReconciliationCreate,
    tenant_id: str = Depends(require_tenant_id),
    current_user: User = Depends(require_any_permission(*SMS_SETTINGS_PERMISSIONS)),
    session: Session = Depends(get_session),
) -> SmsReconciliationRead:
    return record_sms_reconciliation(
        session, tenant_id=tenant_id, payload=payload, actor=current_user
    )


@router.get(
    "/sms/reconciliation",
    response_model=list[SmsReconciliationRead],
    summary="List recorded SMS provider-invoice reconciliations",
)
def read_sms_reconciliations(
    limit: int = Query(default=24, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    tenant_id: str = Depends(require_tenant_id),
    _current_user: User = Depends(require_any_permission(*SMS_SETTINGS_PERMISSIONS)),
    session: Session = Depends(get_session),
) -> list[SmsReconciliationRead]:
    return list_sms_reconciliations(
        session, tenant_id=tenant_id, limit=limit, offset=offset
    )
