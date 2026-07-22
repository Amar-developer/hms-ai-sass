from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session

from app.core.auth import (
    is_tenant_admin_user,
    require_any_permission,
    require_permission,
    user_permission_keys,
)
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
from app.modules.billing.models import BillingAdjustmentType
from app.modules.billing.repositories.adjustment_repository import (
    BillingAdjustmentRepository,
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
    sync_patient_membership_payment,
    sync_physiotherapy_case_status,
)
from app.modules.identity import permissions
from app.modules.identity.models import User

router = APIRouter(prefix="/billing")


def _require_billing_adjustment_request_permission(
    session: Session, current_user: User, request_type: BillingAdjustmentType
) -> None:
    if current_user.is_super_admin or is_tenant_admin_user(session, current_user):
        return
    required_by_type = {
        BillingAdjustmentType.DISCOUNT: permissions.BILLING_DISCOUNTS_REQUEST,
        BillingAdjustmentType.FULL_REFUND: permissions.BILLING_REFUNDS_REQUEST,
        BillingAdjustmentType.PARTIAL_REFUND: permissions.BILLING_REFUNDS_REQUEST,
        BillingAdjustmentType.CANCEL: permissions.INVOICES_CANCEL_REQUEST,
    }
    if required_by_type[request_type] not in user_permission_keys(
        session, current_user
    ):
        raise HTTPException(status_code=403, detail="Permission denied")


def _require_billing_adjustment_decision_permission(
    session: Session,
    current_user: User,
    *,
    tenant_id: str,
    request_id: str,
) -> None:
    """Require the approval permission matching the actual request type.

    Broad billing access is intentionally insufficient: requesters may inspect
    and manage billing without being allowed to approve their own discounts or
    refunds. Tenant and super admins retain their explicit administrative
    override.
    """
    if current_user.is_super_admin or is_tenant_admin_user(session, current_user):
        return
    row = BillingAdjustmentRepository(session).get_adjustment_request_for_tenant(
        tenant_id=tenant_id,
        request_id=request_id,
    )
    if not row:
        raise HTTPException(status_code=404, detail="Request not found")
    if row.request_type == BillingAdjustmentType.DISCOUNT:
        required_permissions = {permissions.BILLING_DISCOUNTS_APPROVE}
    elif row.request_type in {
        BillingAdjustmentType.FULL_REFUND,
        BillingAdjustmentType.PARTIAL_REFUND,
    }:
        required_permissions = {
            permissions.BILLING_REFUNDS_APPROVE,
            permissions.BILLING_REFUNDS_MANAGE,
        }
    else:
        required_permissions = {
            permissions.INVOICES_CANCEL_APPROVE,
            permissions.BILLING_REFUNDS_MANAGE,
        }
    if not required_permissions.intersection(
        user_permission_keys(session, current_user)
    ):
        raise HTTPException(status_code=403, detail="Permission denied")


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
    current_user: User = Depends(
        require_any_permission(permissions.PAYMENTS_MANAGE, permissions.PAYMENTS_CREATE)
    ),
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
            permissions.BILLING_DISCOUNTS_REQUEST,
            permissions.BILLING_REFUNDS_REQUEST,
            permissions.INVOICES_CANCEL_REQUEST,
        )
    ),
) -> BillingAdjustmentRequestRead:
    _require_billing_adjustment_request_permission(
        session, current_user, payload.request_type
    )
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
    current_user: User = Depends(
        require_any_permission(
            permissions.BILLING_DISCOUNTS_APPROVE,
            permissions.BILLING_REFUNDS_APPROVE,
            permissions.BILLING_REFUNDS_MANAGE,
            permissions.INVOICES_CANCEL_APPROVE,
        )
    ),
) -> BillingAdjustmentRequestRead:
    _require_billing_adjustment_decision_permission(
        session,
        current_user,
        tenant_id=tenant_id,
        request_id=request_id,
    )
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
    current_user: User = Depends(
        require_any_permission(
            permissions.BILLING_DISCOUNTS_APPROVE,
            permissions.BILLING_REFUNDS_APPROVE,
            permissions.BILLING_REFUNDS_MANAGE,
            permissions.INVOICES_CANCEL_APPROVE,
        )
    ),
) -> BillingAdjustmentRequestRead:
    _require_billing_adjustment_decision_permission(
        session,
        current_user,
        tenant_id=tenant_id,
        request_id=request_id,
    )
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
    current_user: User = Depends(
        require_any_permission(
            permissions.BILLING_DISCOUNTS_APPROVE,
            permissions.BILLING_REFUNDS_APPROVE,
            permissions.BILLING_REFUNDS_MANAGE,
            permissions.INVOICES_CANCEL_APPROVE,
        )
    ),
) -> InvoiceDetailRead:
    _require_billing_adjustment_decision_permission(
        session,
        current_user,
        tenant_id=tenant_id,
        request_id=request_id,
    )
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
    current_user: User = Depends(
        require_any_permission(
            permissions.BILLING_MANAGE,
            permissions.INVOICES_CANCEL_REQUEST,
        )
    ),
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
    current_user: User = Depends(
        require_any_permission(
            permissions.BILLING_MANAGE,
            permissions.INVOICES_AMEND_REQUEST,
        )
    ),
) -> InvoiceDetailRead:
    return amend_invoice(
        session,
        tenant_id=tenant_id,
        invoice_id=invoice_id,
        payload=payload,
        actor=current_user,
    )
