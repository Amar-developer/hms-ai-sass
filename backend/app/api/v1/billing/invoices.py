import json
from datetime import date, timedelta

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from fastapi import Query
from pydantic import BaseModel, Field
from sqlmodel import Session, select

from app.core.auth import require_any_permission
from app.core.access_control import require_user_branch_access
from app.core.database import get_session
from app.core.pagination import Page
from app.core.config import get_settings
from app.core.tenant_context import require_tenant_id
from app.modules.billing.schemas import (
    InvoiceCreateFromConsultation,
    InvoiceCreateFromLabOrder,
    InvoiceCreateFromPharmacyIssue,
    InvoiceDetailRead,
    InvoiceItemSupplierOptionRead,
    InvoiceItemSupplierUpdate,
    InvoiceItemRead,
    InvoiceOfferApply,
    InvoiceRead,
    PaymentRead,
    PendingConsultationInvoiceRead,
)
from app.modules.billing.models import Invoice, InvoiceStatus
from app.modules.billing.repositories.read_repository import BillingReadRepository
from app.modules.files.services.file_service import FileService
from app.modules.files.models import FileDocument
from app.modules.audit.service import record_audit_event
from app.modules.billing.services.invoice_items import (
    list_invoice_item_supplier_options,
    update_invoice_item_supplier,
)
from app.modules.billing.services.invoice_queries import (
    get_billing_invoice_detail,
    list_billing_invoices,
    list_billing_invoice_page,
    list_pending_consultation_invoice_page,
)
from app.modules.billing.services.ledger import (
    create_service_invoice,
    ensure_invoice_membership_benefit_ledger,
    ensure_invoice_submit_ledger,
    read_invoice_detail_full,
    record_billing_ledger,
)
from app.modules.billing.services.membership import apply_membership_benefit_to_invoice
from app.modules.billing.services.offers import (
    apply_offer_to_invoice,
    remove_offer_from_invoice,
)
from app.modules.billing.services.source_invoices import (
    create_invoice_from_consultation_source,
    create_invoice_from_lab_order_source,
    create_invoice_from_pharmacy_issue_source,
)
from app.modules.identity import permissions
from app.modules.identity.models import User
from app.modules.notifications.service import queue_whatsapp_template_if_allowed
from app.modules.notifications.models import NotificationEvent, NotificationStatus
from app.modules.notifications.models import DocumentDeliveryChannel
from app.modules.notifications.services.document_delivery import (
    list_document_deliveries,
    queue_document_delivery,
)
from app.modules.patients.models import Patient
from app.modules.integrations.service import decode_config, get_tenant_plugin
from app.modules.integrations.whatsapp_consent import patient_notification_destination
from app.modules.subscriptions.service import enforce_module_enabled
from app.modules.tenants.models import new_id, now_utc

router = APIRouter(prefix="/billing")


class InvoiceSendRequest(BaseModel):
    channel: DocumentDeliveryChannel = DocumentDeliveryChannel.WHATSAPP
    idempotency_key: str | None = Field(default=None, min_length=8, max_length=120)


@router.get(
    "/pending-consultation-invoices/page",
    response_model=Page[PendingConsultationInvoiceRead],
)
def list_pending_consultation_invoices(
    tenant_id: str = Depends(require_tenant_id),
    branch_id: str | None = None,
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=25, ge=1, le=100),
    session: Session = Depends(get_session),
    current_user: User = Depends(
        require_any_permission(
            permissions.BILLING_MANAGE,
            permissions.BILLING_CREATE,
            permissions.INVOICES_CREATE,
        )
    ),
) -> Page[PendingConsultationInvoiceRead]:
    return list_pending_consultation_invoice_page(
        session,
        tenant_id=tenant_id,
        branch_id=branch_id,
        offset=offset,
        limit=limit,
        current_user=current_user,
    )


def _invoice_artifact(
    session: Session, *, tenant_id: str, invoice_id: str
) -> FileDocument | None:
    return session.exec(
        select(FileDocument)
        .where(
            FileDocument.tenant_id == tenant_id,
            FileDocument.attached_to_doctype == "Invoice",
            FileDocument.attached_to_name == invoice_id,
            FileDocument.attached_to_field == "invoice_pdf",
            FileDocument.artifact_type == "final",
            FileDocument.document_status == "ready",
            FileDocument.is_active == True,  # noqa: E712
        )
        .order_by(FileDocument.document_version.desc())
    ).first()


def _artifact_payload(row: FileDocument | None) -> dict[str, object]:
    if not row:
        return {
            "exists": False,
            "file_id": None,
            "version": None,
            "file_name": None,
            "content_type": None,
            "size_bytes": None,
            "checksum_sha256": None,
            "finalized_at": None,
        }
    return {
        "exists": True,
        "file_id": row.id,
        "version": row.document_version,
        "file_name": row.file_name,
        "content_type": row.content_type,
        "size_bytes": row.stored_size_bytes or row.file_size,
        "checksum_sha256": row.checksum_sha256,
        "finalized_at": row.finalized_at.isoformat() if row.finalized_at else None,
    }


def _paid_invoice(
    session: Session, *, tenant_id: str, invoice_id: str, current_user: User
) -> Invoice:
    invoice = session.exec(
        select(Invoice)
        .where(Invoice.id == invoice_id, Invoice.tenant_id == tenant_id)
        .with_for_update()
    ).first()
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    require_user_branch_access(current_user, invoice.branch_id)
    if invoice.status != InvoiceStatus.PAID or invoice.balance_amount > 0:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="The invoice can be finalized or sent only after payment is fully settled",
        )
    return invoice


def _require_permanent_delivery_enabled() -> None:
    if not get_settings().permanent_invoice_delivery_enabled:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Permanent invoice delivery is temporarily disabled",
        )


def _delivery_payload(event: NotificationEvent | None) -> dict[str, object]:
    if not event:
        return {
            "status": "not_sent",
            "notification_id": None,
            "artifact_file_id": None,
            "artifact_version": None,
            "failure_reason": None,
            "attempt_count": 0,
            "max_attempts": 0,
            "created_at": None,
            "sent_at": None,
        }
    return {
        "status": event.status.value,
        "notification_id": event.id,
        "artifact_file_id": event.artifact_file_id,
        "artifact_version": event.artifact_version,
        "failure_reason": event.failure_reason,
        "attempt_count": event.attempt_count,
        "max_attempts": event.max_attempts,
        "created_at": event.created_at.isoformat(),
        "sent_at": event.sent_at.isoformat() if event.sent_at else None,
    }


@router.post(
    "/invoices/from-consultation",
    response_model=InvoiceDetailRead,
    status_code=status.HTTP_201_CREATED,
)
def create_invoice_from_consultation(
    payload: InvoiceCreateFromConsultation,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(
        require_any_permission(
            permissions.BILLING_MANAGE,
            permissions.BILLING_CREATE,
            permissions.INVOICES_CREATE,
        )
    ),
) -> InvoiceDetailRead:
    enforce_module_enabled(session, tenant_id, "billing_basic")
    return create_invoice_from_consultation_source(
        session,
        tenant_id=tenant_id,
        payload=payload,
        current_user=current_user,
        read_invoice_detail=read_invoice_detail_full,
        ensure_invoice_submit_ledger=ensure_invoice_submit_ledger,
    )


@router.post(
    "/invoices/from-lab-order",
    response_model=InvoiceDetailRead,
    status_code=status.HTTP_201_CREATED,
)
def create_invoice_from_lab_order(
    payload: InvoiceCreateFromLabOrder,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(
        require_any_permission(
            permissions.BILLING_MANAGE,
            permissions.BILLING_CREATE,
            permissions.INVOICES_CREATE,
            permissions.LAB_MANAGE,
            permissions.LAB_EDIT,
        )
    ),
) -> InvoiceDetailRead:
    enforce_module_enabled(session, tenant_id, "billing_basic")
    return create_invoice_from_lab_order_source(
        session,
        tenant_id=tenant_id,
        payload=payload,
        current_user=current_user,
        create_service_invoice=create_service_invoice,
        read_invoice_detail=read_invoice_detail_full,
    )


@router.post(
    "/invoices/from-pharmacy-issue",
    response_model=InvoiceDetailRead,
    status_code=status.HTTP_201_CREATED,
)
def create_invoice_from_pharmacy_issue(
    payload: InvoiceCreateFromPharmacyIssue,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(
        require_any_permission(
            permissions.BILLING_MANAGE,
            permissions.BILLING_CREATE,
            permissions.INVOICES_CREATE,
        )
    ),
) -> InvoiceDetailRead:
    enforce_module_enabled(session, tenant_id, "billing_basic")
    return create_invoice_from_pharmacy_issue_source(
        session,
        tenant_id=tenant_id,
        payload=payload,
        current_user=current_user,
        create_service_invoice=create_service_invoice,
        read_invoice_detail=read_invoice_detail_full,
    )


@router.get("/invoices", response_model=list[InvoiceRead])
def list_invoices(
    tenant_id: str = Depends(require_tenant_id),
    branch_id: str | None = None,
    patient_id: str | None = None,
    limit: int | None = Query(default=None, ge=1, le=500),
    session: Session = Depends(get_session),
    current_user: User = Depends(
        require_any_permission(
            permissions.BILLING_MANAGE,
            permissions.BILLING_READ,
            permissions.INVOICES_READ,
            permissions.PATIENT_SUBSCRIPTIONS_READ,
            permissions.PATIENT_SUBSCRIPTIONS_MANAGE,
            permissions.PATIENT_SUBSCRIPTIONS_CREATE,
        )
    ),
) -> list[InvoiceRead]:
    return list_billing_invoices(
        session,
        tenant_id=tenant_id,
        branch_id=branch_id,
        patient_id=patient_id,
        offset=0,
        limit=limit,
        current_user=current_user,
    )


@router.get("/invoices/page", response_model=Page[InvoiceRead])
def list_invoice_page(
    tenant_id: str = Depends(require_tenant_id),
    branch_id: str | None = None,
    patient_id: str | None = None,
    q: str | None = Query(default=None, max_length=120),
    source: str | None = Query(
        default=None,
        pattern="^(lab_scan|pharmacy|physiotherapy|home_care|ip_billing|consultation|membership|direct)$",
    ),
    payment_state: str | None = Query(
        default=None,
        pattern="^(paid|due|partially_paid|partially_refunded|refunded|unpaid|cancelled)$",
    ),
    from_date: date | None = None,
    to_date: date | None = None,
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=25, ge=1, le=100),
    session: Session = Depends(get_session),
    current_user: User = Depends(
        require_any_permission(
            permissions.BILLING_MANAGE,
            permissions.BILLING_READ,
            permissions.INVOICES_READ,
            permissions.PATIENT_SUBSCRIPTIONS_READ,
            permissions.PATIENT_SUBSCRIPTIONS_MANAGE,
            permissions.PATIENT_SUBSCRIPTIONS_CREATE,
        )
    ),
) -> Page[InvoiceRead]:
    return list_billing_invoice_page(
        session,
        tenant_id=tenant_id,
        branch_id=branch_id,
        patient_id=patient_id,
        q=q,
        source=source,
        payment_state=payment_state,
        from_date=from_date,
        to_date=to_date,
        offset=offset,
        limit=limit,
        current_user=current_user,
    )


@router.get("/invoices/report-details")
def list_invoice_report_details(
    ids: list[str] = Query(...),
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(
        require_any_permission(
            permissions.BILLING_MANAGE,
            permissions.BILLING_READ,
            permissions.INVOICES_READ,
        )
    ),
) -> list[dict[str, object]]:
    """Read the item/payment fields reports need using three bounded queries."""
    invoice_ids = set(ids)
    if not invoice_ids or len(invoice_ids) > 50:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Between 1 and 50 unique invoice identifiers are required",
        )
    invoices = list(
        session.exec(
            select(Invoice).where(
                Invoice.tenant_id == tenant_id,
                Invoice.id.in_(invoice_ids),
            )
        ).all()
    )
    for invoice in invoices:
        require_user_branch_access(current_user, invoice.branch_id)
    allowed_ids = {invoice.id for invoice in invoices}
    repo = BillingReadRepository(session)
    items_by_invoice: dict[str, list[InvoiceItemRead]] = {
        invoice_id: [] for invoice_id in allowed_ids
    }
    for item in repo.list_invoice_items_for_invoices(
        tenant_id=tenant_id, invoice_ids=allowed_ids
    ):
        items_by_invoice[item.invoice_id].append(
            InvoiceItemRead.model_validate(item, from_attributes=True)
        )
    payments_by_invoice: dict[str, list[PaymentRead]] = {
        invoice_id: [] for invoice_id in allowed_ids
    }
    for payment in repo.list_payments_for_invoices(
        tenant_id=tenant_id, invoice_ids=allowed_ids
    ):
        payments_by_invoice[payment.invoice_id].append(
            PaymentRead.model_validate(payment, from_attributes=True)
        )
    return [
        {
            "invoice": {"id": invoice.id},
            "items": items_by_invoice[invoice.id],
            "payments": payments_by_invoice[invoice.id],
        }
        for invoice in invoices
    ]


@router.get("/invoices/{invoice_id}", response_model=InvoiceDetailRead)
def get_invoice(
    invoice_id: str,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(
        require_any_permission(
            permissions.BILLING_MANAGE,
            permissions.BILLING_READ,
            permissions.INVOICES_READ,
        )
    ),
) -> InvoiceDetailRead:
    return get_billing_invoice_detail(
        session,
        tenant_id=tenant_id,
        invoice_id=invoice_id,
        current_user=current_user,
    )


@router.get(
    "/invoices/{invoice_id}/document",
    summary="Read the permanent finalized invoice artifact",
)
def read_invoice_document(
    invoice_id: str,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(
        require_any_permission(
            permissions.BILLING_MANAGE,
            permissions.BILLING_READ,
            permissions.INVOICES_READ,
        )
    ),
) -> dict[str, object]:
    invoice = session.get(Invoice, invoice_id)
    if not invoice or invoice.tenant_id != tenant_id:
        raise HTTPException(status_code=404, detail="Invoice not found")
    require_user_branch_access(current_user, invoice.branch_id)
    return _artifact_payload(
        _invoice_artifact(session, tenant_id=tenant_id, invoice_id=invoice.id)
    )


@router.post(
    "/invoices/{invoice_id}/document/finalize",
    summary="Store the first permanent finalized invoice artifact",
)
async def finalize_invoice_document(
    invoice_id: str,
    file: UploadFile = File(...),
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(
        require_any_permission(permissions.BILLING_MANAGE, permissions.INVOICES_EDIT)
    ),
) -> dict[str, object]:
    _require_permanent_delivery_enabled()
    invoice = _paid_invoice(
        session,
        tenant_id=tenant_id,
        invoice_id=invoice_id,
        current_user=current_user,
    )
    existing = _invoice_artifact(session, tenant_id=tenant_id, invoice_id=invoice.id)
    if existing:
        return _artifact_payload(existing)
    stored = await FileService(session).upload_file(
        tenant_id=tenant_id,
        file=file,
        branch_id=invoice.branch_id,
        patient_id=invoice.patient_id,
        category="invoice",
        source_module="billing",
        attached_to_doctype="Invoice",
        attached_to_name=invoice.id,
        attached_to_field="invoice_pdf",
        attached_to_label="Invoice PDF",
        folder="Invoices",
        notes="Permanent finalized invoice artifact",
        is_private=True,
        actor=current_user,
    )
    record_audit_event(
        session,
        tenant_id=tenant_id,
        branch_id=invoice.branch_id,
        actor_user_id=current_user.id,
        action="invoice.document_finalized",
        resource_type="invoice",
        resource_id=invoice.id,
        purpose="billing_document_management",
        metadata_json=json.dumps(
            {"file_id": stored.id, "version": stored.document_version}
        ),
    )
    return _artifact_payload(stored)


@router.post(
    "/invoices/{invoice_id}/document/regenerate",
    summary="Explicitly replace the finalized invoice with a new permanent version",
)
async def regenerate_invoice_document(
    invoice_id: str,
    file: UploadFile = File(...),
    reason: str = Form(min_length=5, max_length=500),
    expected_version: int | None = Form(default=None, ge=1),
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(
        require_any_permission(permissions.BILLING_MANAGE, permissions.INVOICES_EDIT)
    ),
) -> dict[str, object]:
    _require_permanent_delivery_enabled()
    invoice = _paid_invoice(
        session,
        tenant_id=tenant_id,
        invoice_id=invoice_id,
        current_user=current_user,
    )
    current = _invoice_artifact(session, tenant_id=tenant_id, invoice_id=invoice.id)
    if not current:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Finalize the invoice before regenerating it",
        )
    if expected_version is not None and current.document_version != expected_version:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"Invoice document version changed from {expected_version} "
                f"to {current.document_version}; refresh before regenerating"
            ),
        )
    previous_id = current.id
    stored = await FileService(session).upload_file(
        tenant_id=tenant_id,
        file=file,
        branch_id=invoice.branch_id,
        patient_id=invoice.patient_id,
        category="invoice",
        source_module="billing",
        attached_to_doctype="Invoice",
        attached_to_name=invoice.id,
        attached_to_field="invoice_pdf",
        attached_to_label="Invoice PDF",
        folder="Invoices",
        notes=f"Regenerated invoice: {reason.strip()}",
        is_private=True,
        actor=current_user,
    )
    record_audit_event(
        session,
        tenant_id=tenant_id,
        branch_id=invoice.branch_id,
        actor_user_id=current_user.id,
        action="invoice.document_regenerated",
        resource_type="invoice",
        resource_id=invoice.id,
        purpose="billing_document_management",
        metadata_json=json.dumps(
            {
                "reason": reason.strip(),
                "previous_file_id": previous_id,
                "new_file_id": stored.id,
                "version": stored.document_version,
            }
        ),
    )
    return _artifact_payload(stored)


@router.post("/invoices/{invoice_id}/send", summary="Send a finalized paid invoice")
def send_paid_invoice(
    invoice_id: str,
    payload: InvoiceSendRequest,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(
        require_any_permission(permissions.BILLING_MANAGE, permissions.INVOICES_EDIT)
    ),
) -> dict[str, object]:
    _require_permanent_delivery_enabled()
    invoice = _paid_invoice(
        session,
        tenant_id=tenant_id,
        invoice_id=invoice_id,
        current_user=current_user,
    )
    stored = _invoice_artifact(session, tenant_id=tenant_id, invoice_id=invoice.id)
    if not stored:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Finalize the permanent invoice PDF before sending it",
        )
    patient = session.get(Patient, invoice.patient_id)
    if not patient or patient.tenant_id != tenant_id:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="The invoice patient is not available",
        )
    request_key = payload.idempotency_key or new_id("delivery")
    if payload.channel == DocumentDeliveryChannel.EMAIL:
        if not patient.email:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="The invoice patient does not have an email address",
            )
        delivery = queue_document_delivery(
            session,
            tenant_id=tenant_id,
            branch_id=invoice.branch_id,
            channel=DocumentDeliveryChannel.EMAIL,
            resource_type="invoice",
            resource_id=invoice.id,
            artifact_file_id=stored.id,
            artifact_version=stored.document_version,
            recipient=patient.email,
            subject=f"Invoice {invoice.invoice_number}",
            message=(
                f"Please find invoice {invoice.invoice_number} attached. "
                "This document is a permanent finalized copy."
            ),
            idempotency_key=f"invoice:{invoice.id}:{request_key}",
            queued_by_user_id=current_user.id,
        )
        return {
            "status": delivery.status.value,
            "delivery_id": delivery.id,
            "channel": delivery.channel.value,
            "artifact": _artifact_payload(stored),
            "message": f"Invoice {invoice.invoice_number} queued for email delivery",
        }
    integration = get_tenant_plugin(session, tenant_id, "whatsapp")
    integration_config = decode_config(integration.config_json) if integration else {}
    patient_mobile = patient_notification_destination(
        patient, str(integration_config.get("default_country_code") or "+91")
    )
    if not patient_mobile:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "The invoice patient does not have a valid primary or alternate "
                "mobile number"
            ),
        )

    automatic_key = f"whatsapp:invoice:{invoice.id}:paid"
    automatic_event = session.exec(
        select(NotificationEvent).where(
            NotificationEvent.tenant_id == tenant_id,
            NotificationEvent.dedupe_key == automatic_key,
        )
    ).first()
    if automatic_event and automatic_event.status != NotificationStatus.SENT:
        if automatic_event.status in {
            NotificationStatus.FAILED,
            NotificationStatus.CANCELLED,
        }:
            automatic_event.attempt_count = 0
            automatic_event.sent_at = None
        automatic_event.status = NotificationStatus.QUEUED
        automatic_event.failure_reason = None
        automatic_event.processing_started_at = None
        automatic_event.next_attempt_at = now_utc() + timedelta(seconds=5)
        automatic_event.updated_at = now_utc()
        automatic_event.recipient = patient_mobile
        automatic_event.artifact_file_id = stored.id
        automatic_event.artifact_version = stored.document_version
        session.add(automatic_event)
        session.commit()
        session.refresh(automatic_event)
        event = automatic_event
    else:
        event = queue_whatsapp_template_if_allowed(
            session,
            tenant_id=tenant_id,
            branch_id=invoice.branch_id,
            flow_key="invoice_paid_patient",
            recipient=patient_mobile,
            resource_type="invoice",
            resource_id=invoice.id,
            dedupe_key=f"whatsapp:invoice:{invoice.id}:send:{request_key}",
            queued_by_user_id=current_user.id,
            artifact_file_id=stored.id,
            artifact_version=stored.document_version,
            not_before=now_utc() + timedelta(seconds=5),
        )
    if not event:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "Invoice delivery could not be queued. Check the notification flow, "
                "patient consent, saved template, and monthly allowance."
            ),
        )
    delivery = queue_document_delivery(
        session,
        tenant_id=tenant_id,
        branch_id=invoice.branch_id,
        channel=DocumentDeliveryChannel.WHATSAPP,
        resource_type="invoice",
        resource_id=invoice.id,
        artifact_file_id=stored.id,
        artifact_version=stored.document_version,
        recipient=patient_mobile,
        subject=f"Invoice {invoice.invoice_number}",
        idempotency_key=f"invoice:{invoice.id}:{request_key}",
        notification_event_id=event.id,
        queued_by_user_id=current_user.id,
    )
    return {
        **_delivery_payload(event),
        "delivery_id": delivery.id,
        "channel": delivery.channel.value,
        "artifact": _artifact_payload(stored),
        "message": f"Invoice {invoice.invoice_number} queued for delivery",
    }


@router.get(
    "/invoices/{invoice_id}/delivery",
    summary="Read the latest paid invoice delivery status",
)
def read_paid_invoice_delivery(
    invoice_id: str,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(
        require_any_permission(
            permissions.BILLING_MANAGE,
            permissions.BILLING_READ,
            permissions.INVOICES_READ,
        )
    ),
) -> dict[str, object]:
    invoice = session.get(Invoice, invoice_id)
    if not invoice or invoice.tenant_id != tenant_id:
        raise HTTPException(status_code=404, detail="Invoice not found")
    require_user_branch_access(current_user, invoice.branch_id)
    event = session.exec(
        select(NotificationEvent)
        .where(
            NotificationEvent.tenant_id == tenant_id,
            NotificationEvent.resource_type == "invoice",
            NotificationEvent.resource_id == invoice.id,
            NotificationEvent.template_key == "invoice_paid_patient",
        )
        .order_by(NotificationEvent.created_at.desc())
    ).first()
    return _delivery_payload(event)


@router.get(
    "/invoices/{invoice_id}/deliveries",
    summary="Read paid invoice delivery history",
)
def list_paid_invoice_deliveries(
    invoice_id: str,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(
        require_any_permission(
            permissions.BILLING_MANAGE,
            permissions.BILLING_READ,
            permissions.INVOICES_READ,
        )
    ),
) -> list[dict[str, object]]:
    invoice = session.get(Invoice, invoice_id)
    if not invoice or invoice.tenant_id != tenant_id:
        raise HTTPException(status_code=404, detail="Invoice not found")
    require_user_branch_access(current_user, invoice.branch_id)
    deliveries = list_document_deliveries(
        session, tenant_id=tenant_id, resource_type="invoice", resource_id=invoice.id
    )
    if deliveries:
        return [
            {
                "status": row.status.value,
                "delivery_id": row.id,
                "channel": row.channel.value,
                "artifact_file_id": row.artifact_file_id,
                "artifact_version": row.artifact_version,
                "failure_reason": row.failure_reason,
                "attempt_count": row.attempt_count,
                "max_attempts": row.max_attempts,
                "created_at": row.created_at.isoformat(),
                "sent_at": row.sent_at.isoformat() if row.sent_at else None,
            }
            for row in deliveries
        ]
    events = session.exec(
        select(NotificationEvent)
        .where(
            NotificationEvent.tenant_id == tenant_id,
            NotificationEvent.resource_type == "invoice",
            NotificationEvent.resource_id == invoice.id,
            NotificationEvent.template_key == "invoice_paid_patient",
        )
        .order_by(NotificationEvent.created_at.desc())
    ).all()
    return [_delivery_payload(event) for event in events]


@router.patch(
    "/invoices/{invoice_id}/items/{item_id}/supplier", response_model=InvoiceDetailRead
)
def update_invoice_item_supplier_endpoint(
    invoice_id: str,
    item_id: str,
    payload: InvoiceItemSupplierUpdate,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(
        require_any_permission(permissions.BILLING_MANAGE, permissions.INVOICES_EDIT)
    ),
) -> InvoiceDetailRead:
    return update_invoice_item_supplier(
        session,
        tenant_id=tenant_id,
        invoice_id=invoice_id,
        item_id=item_id,
        payload=payload,
        current_user=current_user,
        read_invoice_detail=read_invoice_detail_full,
    )


@router.get(
    "/invoices/{invoice_id}/items/{item_id}/supplier-options",
    response_model=list[InvoiceItemSupplierOptionRead],
)
def list_invoice_item_supplier_options_endpoint(
    invoice_id: str,
    item_id: str,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(
        require_any_permission(
            permissions.BILLING_MANAGE,
            permissions.BILLING_READ,
            permissions.INVOICES_READ,
        )
    ),
) -> list[InvoiceItemSupplierOptionRead]:
    return list_invoice_item_supplier_options(
        session,
        tenant_id=tenant_id,
        invoice_id=invoice_id,
        item_id=item_id,
        current_user=current_user,
    )


@router.post(
    "/invoices/{invoice_id}/membership-benefit/apply", response_model=InvoiceDetailRead
)
def apply_invoice_membership_benefit(
    invoice_id: str,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(
        require_any_permission(permissions.BILLING_MANAGE, permissions.INVOICES_EDIT)
    ),
) -> InvoiceDetailRead:
    return apply_membership_benefit_to_invoice(
        session,
        tenant_id=tenant_id,
        invoice_id=invoice_id,
        current_user=current_user,
        ensure_invoice_membership_benefit_ledger=ensure_invoice_membership_benefit_ledger,
        read_invoice_detail=read_invoice_detail_full,
    )


@router.post(
    "/invoices/{invoice_id}/offer/apply",
    response_model=InvoiceDetailRead,
    summary="Apply a promotional offer to an invoice",
)
def apply_invoice_offer(
    invoice_id: str,
    payload: InvoiceOfferApply | None = None,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(
        require_any_permission(permissions.BILLING_MANAGE, permissions.INVOICES_EDIT)
    ),
) -> InvoiceDetailRead:
    """Offers are opt-in. With no body the best eligible offer is applied;
    otherwise the named offer or the entered code is used."""
    return apply_offer_to_invoice(
        session,
        tenant_id=tenant_id,
        invoice_id=invoice_id,
        current_user=current_user,
        discount_offer_id=payload.discount_offer_id if payload else None,
        code=payload.code if payload else None,
        record_billing_ledger=record_billing_ledger,
        read_invoice_detail=read_invoice_detail_full,
    )


@router.post(
    "/invoices/{invoice_id}/offer/remove",
    response_model=InvoiceDetailRead,
    summary="Remove the applied offer from an invoice",
)
def remove_invoice_offer(
    invoice_id: str,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(
        require_any_permission(permissions.BILLING_MANAGE, permissions.INVOICES_EDIT)
    ),
) -> InvoiceDetailRead:
    return remove_offer_from_invoice(
        session,
        tenant_id=tenant_id,
        invoice_id=invoice_id,
        current_user=current_user,
        record_billing_ledger=record_billing_ledger,
        read_invoice_detail=read_invoice_detail_full,
    )
