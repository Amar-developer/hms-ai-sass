from datetime import date

from fastapi import APIRouter, Depends, Query, Response
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
from app.modules.integrations.whatsapp_service import (
    get_whatsapp_integration,
    test_whatsapp_integration,
    update_whatsapp_integration,
)
from app.modules.integrations.invoice_receipts import (
    render_invoice_receipt_pdf,
    verify_invoice_receipt_signature,
)
from app.modules.integrations.whatsapp_queue_service import (
    cancel_whatsapp_notification,
    list_whatsapp_queue,
    retry_whatsapp_notification,
)


router = APIRouter(prefix="/communications")


WHATSAPP_SETTINGS_PERMISSIONS = (
    permissions.COMMUNICATIONS_WHATSAPP_MANAGE,
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
    expires: int = Query(gt=0),
    signature: str = Query(min_length=40, max_length=100),
    session: Session = Depends(get_session),
) -> Response:
    verify_invoice_receipt_signature(
        tenant_id=tenant_id,
        invoice_id=invoice_id,
        expires=expires,
        signature=signature,
    )
    pdf, filename = render_invoice_receipt_pdf(
        session, tenant_id=tenant_id, invoice_id=invoice_id
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
