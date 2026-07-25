from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlmodel import Session, select

from app.core.auth import require_any_permission
from app.core.access_control import require_user_branch_access
from app.core.database import get_session
from app.core.tenant_context import require_tenant_id
from app.modules.billing.schemas import (
    InvoiceCreateFromConsultation,
    InvoiceCreateFromLabOrder,
    InvoiceCreateFromPharmacyIssue,
    InvoiceDetailRead,
    InvoiceItemSupplierOptionRead,
    InvoiceItemSupplierUpdate,
    InvoiceRead,
)
from app.modules.billing.models import Invoice, InvoiceStatus
from app.modules.files.services.file_service import FileService
from app.modules.billing.services.invoice_items import (
    list_invoice_item_supplier_options,
    update_invoice_item_supplier,
)
from app.modules.billing.services.invoice_queries import (
    get_billing_invoice_detail,
    list_billing_invoices,
)
from app.modules.billing.services.ledger import (
    create_service_invoice,
    ensure_invoice_membership_benefit_ledger,
    ensure_invoice_submit_ledger,
    read_invoice_detail_full,
)
from app.modules.billing.services.membership import apply_membership_benefit_to_invoice
from app.modules.billing.services.source_invoices import (
    create_invoice_from_consultation_source,
    create_invoice_from_lab_order_source,
    create_invoice_from_pharmacy_issue_source,
)
from app.modules.identity import permissions
from app.modules.identity.models import User
from app.modules.notifications.service import queue_whatsapp_template_if_allowed
from app.modules.notifications.models import NotificationEvent, NotificationStatus
from app.modules.patients.models import Patient
from app.modules.integrations.whatsapp_consent import patient_notification_mobile
from app.modules.subscriptions.service import enforce_module_enabled
from app.modules.tenants.models import now_utc

router = APIRouter(prefix="/billing")


def _delivery_payload(event: NotificationEvent | None) -> dict[str, object]:
    if not event:
        return {
            "status": "not_sent",
            "notification_id": None,
            "failure_reason": None,
            "attempt_count": 0,
            "max_attempts": 0,
            "created_at": None,
            "sent_at": None,
        }
    return {
        "status": event.status.value,
        "notification_id": event.id,
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
        current_user=current_user,
    )


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


@router.post(
    "/invoices/{invoice_id}/send", summary="Send a paid invoice to its patient"
)
async def send_paid_invoice(
    invoice_id: str,
    file: UploadFile = File(...),
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(
        require_any_permission(permissions.BILLING_MANAGE, permissions.INVOICES_EDIT)
    ),
) -> dict[str, object]:
    invoice = session.get(Invoice, invoice_id)
    if not invoice or invoice.tenant_id != tenant_id:
        raise HTTPException(status_code=404, detail="Invoice not found")
    require_user_branch_access(current_user, invoice.branch_id)
    if invoice.status != InvoiceStatus.PAID or invoice.balance_amount > 0:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="The invoice can be sent only after payment is fully settled",
        )
    patient = session.get(Patient, invoice.patient_id)
    patient_mobile = patient_notification_mobile(patient)
    if not patient or patient.tenant_id != tenant_id or not patient_mobile:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="The invoice patient does not have a primary or alternate mobile number",
        )

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
        notes="Generated from the printed invoice layout for patient delivery",
        is_private=True,
        actor=current_user,
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
        automatic_event.next_attempt_at = now_utc()
        automatic_event.updated_at = now_utc()
        session.add(automatic_event)
        session.commit()
        session.refresh(automatic_event)
        event = automatic_event
    else:
        delivery_version = int(stored.updated_at.timestamp() * 1_000_000)
        event = queue_whatsapp_template_if_allowed(
            session,
            tenant_id=tenant_id,
            branch_id=invoice.branch_id,
            flow_key="invoice_paid_patient",
            recipient=patient_mobile,
            resource_type="invoice",
            resource_id=invoice.id,
            dedupe_key=f"whatsapp:invoice:{invoice.id}:send:{delivery_version}",
            queued_by_user_id=current_user.id,
        )
    if not event:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "Invoice delivery could not be queued. Check the notification flow, "
                "patient consent, saved template, and monthly allowance."
            ),
        )
    return {
        **_delivery_payload(event),
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
