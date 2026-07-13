from fastapi import APIRouter, Depends, Response, status
from sqlmodel import Session

from app.core.auth import require_any_permission
from app.core.database import get_session
from app.core.tenant_context import require_tenant_id
from app.modules.billing.schemas import (
    InvoiceAmountUpdate,
    InvoiceCreateFromConsultation,
    InvoiceCreateFromLabOrder,
    InvoiceCreateFromPharmacyIssue,
    InvoiceDetailRead,
    InvoiceItemSupplierOptionRead,
    InvoiceItemSupplierUpdate,
    InvoiceRead,
)
from app.modules.billing.services.invoice_amounts import (
    update_consultation_invoice_amount,
)
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
from app.modules.billing.services.receipt_pdf import build_invoice_receipt_document
from app.modules.billing.services.source_invoices import (
    create_invoice_from_consultation_source,
    create_invoice_from_lab_order_source,
    create_invoice_from_pharmacy_issue_source,
)
from app.modules.identity import permissions
from app.modules.identity.models import User
from app.modules.subscriptions.service import enforce_module_enabled

router = APIRouter(prefix="/billing")


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


@router.patch("/invoices/{invoice_id}/amount", response_model=InvoiceDetailRead)
def update_invoice_amount(
    invoice_id: str,
    payload: InvoiceAmountUpdate,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(
        require_any_permission(permissions.BILLING_MANAGE, permissions.INVOICES_EDIT)
    ),
) -> InvoiceDetailRead:
    return update_consultation_invoice_amount(
        session,
        tenant_id=tenant_id,
        invoice_id=invoice_id,
        payload=payload,
        current_user=current_user,
        read_invoice_detail=read_invoice_detail_full,
    )


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


@router.get("/invoices/{invoice_id}/receipt.pdf")
def invoice_receipt_pdf(
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
) -> Response:
    document = build_invoice_receipt_document(
        session,
        tenant_id=tenant_id,
        invoice_id=invoice_id,
        current_user=current_user,
    )
    return Response(
        content=document.content,
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{document.filename}.pdf"'},
    )
