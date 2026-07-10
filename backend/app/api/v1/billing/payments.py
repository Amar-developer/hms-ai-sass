from fastapi import APIRouter, Depends, status
from sqlmodel import Session

from app.core.auth import require_any_permission, require_permission
from app.core.database import get_session
from app.core.tenant_context import require_tenant_id
from app.modules.billing.schemas import (
    AmendInvoiceRequest,
    BillingAdjustmentDecision,
    BillingAdjustmentRequestCreate,
    BillingAdjustmentRequestRead,
    CancelInvoiceRequest,
    CreditNoteCreate,
    CreditNoteRead,
    InvoiceDetailRead,
    PaymentCreate,
    RefundRequest,
)
from app.modules.billing.services.adjustment_requests import (
    amend_invoice,
    approve_billing_adjustment_request,
    cancel_invoice,
    create_billing_adjustment_request,
    execute_billing_adjustment_request,
    refund_payment,
    reject_billing_adjustment_request,
)
from app.modules.billing.services.credit_notes import create_credit_note_for_invoice
from app.modules.billing.services.ledger import (
    read_invoice_detail_full,
    record_billing_ledger,
)
from app.modules.billing.services.payments import record_invoice_payment
from app.modules.billing.services.source_sync import (
    sync_home_care_booking_status,
    sync_invoice_source_after_reversal,
    sync_patient_membership_payment,
    sync_physiotherapy_case_status,
)
from app.modules.identity import permissions
from app.modules.identity.models import User

router = APIRouter(prefix="/billing")


@router.post(
    "/invoices/{invoice_id}/credit-notes",
    response_model=CreditNoteRead,
    status_code=status.HTTP_201_CREATED,
)
def create_credit_note(
    invoice_id: str,
    payload: CreditNoteCreate,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permission(permissions.PAYMENTS_MANAGE)),
):
    return create_credit_note_for_invoice(
        session,
        tenant_id=tenant_id,
        invoice_id=invoice_id,
        payload=payload,
        current_user=current_user,
        record_billing_ledger=record_billing_ledger,
        sync_invoice_source_after_reversal=sync_invoice_source_after_reversal,
    )


@router.post(
    "/invoices/{invoice_id}/payments",
    response_model=InvoiceDetailRead,
    status_code=status.HTTP_201_CREATED,
)
def record_payment(
    invoice_id: str,
    payload: PaymentCreate,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permission(permissions.PAYMENTS_MANAGE)),
) -> InvoiceDetailRead:
    return record_invoice_payment(
        session,
        tenant_id=tenant_id,
        invoice_id=invoice_id,
        payload=payload,
        current_user=current_user,
        record_billing_ledger=record_billing_ledger,
        sync_physiotherapy_case_status=sync_physiotherapy_case_status,
        sync_home_care_booking_status=sync_home_care_booking_status,
        sync_patient_membership_payment=sync_patient_membership_payment,
        read_invoice_detail=read_invoice_detail_full,
    )


@router.post(
    "/invoices/{invoice_id}/adjustment-requests",
    response_model=BillingAdjustmentRequestRead,
    status_code=status.HTTP_201_CREATED,
)
def create_billing_adjustment_request_endpoint(
    invoice_id: str,
    payload: BillingAdjustmentRequestCreate,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(
        require_any_permission(
            permissions.BILLING_MANAGE,
            permissions.INVOICES_READ,
            permissions.INVOICES_EDIT,
            permissions.PAYMENTS_MANAGE,
        )
    ),
) -> BillingAdjustmentRequestRead:
    return create_billing_adjustment_request(
        session,
        tenant_id=tenant_id,
        invoice_id=invoice_id,
        payload=payload,
        actor=current_user,
    )


@router.post(
    "/adjustment-requests/{request_id}/approve",
    response_model=BillingAdjustmentRequestRead,
)
def approve_billing_adjustment_request_endpoint(
    request_id: str,
    payload: BillingAdjustmentDecision,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permission(permissions.BILLING_MANAGE)),
) -> BillingAdjustmentRequestRead:
    return approve_billing_adjustment_request(
        session,
        tenant_id=tenant_id,
        request_id=request_id,
        payload=payload,
        actor=current_user,
    )


@router.post(
    "/adjustment-requests/{request_id}/reject",
    response_model=BillingAdjustmentRequestRead,
)
def reject_billing_adjustment_request_endpoint(
    request_id: str,
    payload: BillingAdjustmentDecision,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permission(permissions.BILLING_MANAGE)),
) -> BillingAdjustmentRequestRead:
    return reject_billing_adjustment_request(
        session,
        tenant_id=tenant_id,
        request_id=request_id,
        payload=payload,
        actor=current_user,
    )


@router.post(
    "/adjustment-requests/{request_id}/execute",
    response_model=InvoiceDetailRead,
)
def execute_billing_adjustment_request_endpoint(
    request_id: str,
    payload: BillingAdjustmentDecision,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permission(permissions.BILLING_MANAGE)),
) -> InvoiceDetailRead:
    return execute_billing_adjustment_request(
        session,
        tenant_id=tenant_id,
        request_id=request_id,
        payload=payload,
        actor=current_user,
    )


@router.post("/payments/{payment_id}/refund", response_model=InvoiceDetailRead)
def refund_payment_endpoint(
    payment_id: str,
    payload: RefundRequest,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permission(permissions.PAYMENTS_MANAGE)),
) -> InvoiceDetailRead:
    return refund_payment(
        session,
        tenant_id=tenant_id,
        payment_id=payment_id,
        payload=payload,
        actor=current_user,
    )


@router.post("/invoices/{invoice_id}/cancel", response_model=InvoiceDetailRead)
def cancel_invoice_endpoint(
    invoice_id: str,
    payload: CancelInvoiceRequest,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permission(permissions.BILLING_MANAGE)),
) -> InvoiceDetailRead:
    return cancel_invoice(
        session,
        tenant_id=tenant_id,
        invoice_id=invoice_id,
        payload=payload,
        actor=current_user,
    )


@router.post("/invoices/{invoice_id}/amend", response_model=InvoiceDetailRead)
def amend_invoice_endpoint(
    invoice_id: str,
    payload: AmendInvoiceRequest,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permission(permissions.BILLING_MANAGE)),
) -> InvoiceDetailRead:
    return amend_invoice(
        session,
        tenant_id=tenant_id,
        invoice_id=invoice_id,
        payload=payload,
        actor=current_user,
    )
