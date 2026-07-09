import json
from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlmodel import Session

from app.core.access_control import enforce_entitlement, require_user_branch_access
from app.modules.audit.service import diff_changes, record_audit_event
from app.modules.billing.models import (
    BillingAdjustmentRequest,
    BillingAdjustmentStatus,
    BillingAdjustmentType,
    InvoiceStatus,
    PaymentStatus,
)
from app.modules.billing.repositories import (
    BillingAdjustmentRepository,
    BillingPaymentRepository,
)
from app.modules.billing.schemas import (
    AmendInvoiceRequest,
    BillingAdjustmentDecision,
    BillingAdjustmentRequestCreate,
    BillingAdjustmentRequestRead,
    CancelInvoiceRequest,
    InvoiceDetailRead,
    RefundRequest,
)
from app.modules.billing.service import refundable_paid_total
from app.modules.billing.services.adjustments import (
    ensure_invoice_can_request_adjustment,
    validate_adjustment_amount,
)
from app.modules.billing.services.ledger import (
    execute_adjustment,
    read_invoice_detail_full,
    record_billing_ledger,
    require_direct_invoice_reversal_admin,
    sync_home_care_booking_status,
    sync_patient_membership_payment,
    sync_physiotherapy_case_status,
)
from app.modules.billing.services.read_models import read_adjustment_request
from app.modules.identity.models import User


def create_billing_adjustment_request(
    session: Session,
    *,
    tenant_id: str,
    invoice_id: str,
    payload: BillingAdjustmentRequestCreate,
    actor: User,
) -> BillingAdjustmentRequestRead:
    adjustment_repo = BillingAdjustmentRepository(session)
    invoice = adjustment_repo.get_invoice_for_tenant(
        tenant_id=tenant_id,
        invoice_id=invoice_id,
    )
    if not invoice:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Invoice not found"
        )
    require_user_branch_access(actor, invoice.branch_id)
    ensure_invoice_can_request_adjustment(session, invoice, payload.request_type)
    amount = validate_adjustment_amount(invoice, payload.request_type, payload.amount)
    row = BillingAdjustmentRequest(
        tenant_id=tenant_id,
        branch_id=invoice.branch_id,
        invoice_id=invoice.id,
        request_type=payload.request_type,
        amount=amount,
        reason=payload.reason,
        requested_by_user_id=actor.id,
        payment_method=payload.payment_method,
        payment_reference=payload.payment_reference,
    )
    session.add(row)
    session.commit()
    session.refresh(row)
    record_audit_event(
        session,
        tenant_id=tenant_id,
        branch_id=invoice.branch_id,
        actor_user_id=actor.id,
        action="billing.adjustment_request.created",
        resource_type="billing_adjustment_request",
        resource_id=row.id,
        purpose="billing_adjustment",
        metadata_json=json.dumps(
            {
                "invoice_id": invoice.id,
                "request_type": str(payload.request_type),
                "amount": amount,
                "reason": payload.reason,
            }
        ),
    )
    return read_adjustment_request(session, row)


def approve_billing_adjustment_request(
    session: Session,
    *,
    tenant_id: str,
    request_id: str,
    payload: BillingAdjustmentDecision,
    actor: User,
) -> BillingAdjustmentRequestRead:
    row = BillingAdjustmentRepository(session).get_adjustment_request_for_tenant(
        tenant_id=tenant_id,
        request_id=request_id,
    )
    if not row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Request not found"
        )
    require_user_branch_access(actor, row.branch_id)
    if row.status != BillingAdjustmentStatus.PENDING:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="Request already decided"
        )
    before = {"status": row.status, "decision_reason": row.decision_reason}
    row.status = BillingAdjustmentStatus.APPROVED
    row.approved_by_user_id = actor.id
    row.decision_reason = payload.reason
    row.decided_at = datetime.now(timezone.utc)
    session.add(row)
    session.commit()
    session.refresh(row)
    record_audit_event(
        session,
        tenant_id=tenant_id,
        branch_id=row.branch_id,
        actor_user_id=actor.id,
        action="billing.adjustment_request.approved",
        resource_type="billing_adjustment_request",
        resource_id=row.id,
        purpose="billing_adjustment",
        metadata_json=json.dumps(
            {
                "invoice_id": row.invoice_id,
                "amount": row.amount,
                "reason": payload.reason,
            }
        ),
        changes=diff_changes(
            before, {"status": row.status, "decision_reason": row.decision_reason}
        ),
    )
    return read_adjustment_request(session, row)


def reject_billing_adjustment_request(
    session: Session,
    *,
    tenant_id: str,
    request_id: str,
    payload: BillingAdjustmentDecision,
    actor: User,
) -> BillingAdjustmentRequestRead:
    row = BillingAdjustmentRepository(session).get_adjustment_request_for_tenant(
        tenant_id=tenant_id,
        request_id=request_id,
    )
    if not row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Request not found"
        )
    require_user_branch_access(actor, row.branch_id)
    if row.status != BillingAdjustmentStatus.PENDING:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="Request already decided"
        )
    before = {"status": row.status, "decision_reason": row.decision_reason}
    row.status = BillingAdjustmentStatus.REJECTED
    row.rejected_by_user_id = actor.id
    row.decision_reason = payload.reason
    row.decided_at = datetime.now(timezone.utc)
    session.add(row)
    session.commit()
    session.refresh(row)
    record_audit_event(
        session,
        tenant_id=tenant_id,
        branch_id=row.branch_id,
        actor_user_id=actor.id,
        action="billing.adjustment_request.rejected",
        resource_type="billing_adjustment_request",
        resource_id=row.id,
        purpose="billing_adjustment",
        metadata_json=json.dumps(
            {"invoice_id": row.invoice_id, "reason": payload.reason}
        ),
        changes=diff_changes(
            before, {"status": row.status, "decision_reason": row.decision_reason}
        ),
    )
    return read_adjustment_request(session, row)


def execute_billing_adjustment_request(
    session: Session,
    *,
    tenant_id: str,
    request_id: str,
    payload: BillingAdjustmentDecision,
    actor: User,
) -> InvoiceDetailRead:
    # Lock the request row so two concurrent executions serialize — the second
    # sees status=EXECUTED and is rejected instead of refunding twice.
    adjustment_repo = BillingAdjustmentRepository(session)
    row = adjustment_repo.get_adjustment_request_for_update(request_id)
    if not row or row.tenant_id != tenant_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Request not found"
        )
    require_user_branch_access(actor, row.branch_id)
    if row.status != BillingAdjustmentStatus.APPROVED:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Approve request before execution",
        )
    invoice = adjustment_repo.get_invoice_for_tenant(
        tenant_id=tenant_id,
        invoice_id=row.invoice_id,
    )
    if not invoice:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Invoice not found"
        )
    if invoice.status in {InvoiceStatus.CANCELLED, InvoiceStatus.REFUNDED}:
        row.status = BillingAdjustmentStatus.REJECTED
        row.rejected_by_user_id = payload.actor_user_id or actor.id
        row.decision_reason = "Invoice is already closed"
        row.decided_at = datetime.now(timezone.utc)
        session.add(row)
        session.commit()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Invoice is already closed for cancellation/refund",
        )
    validate_adjustment_amount(invoice, row.request_type, row.amount)
    invoice = execute_adjustment(
        session,
        invoice=invoice,
        request_type=row.request_type,
        amount=row.amount,
        reason=payload.reason or row.reason,
        actor_user_id=payload.actor_user_id or actor.id,
        payment_method=row.payment_method,
        payment_reference=row.payment_reference,
    )
    row.status = BillingAdjustmentStatus.EXECUTED
    row.executed_by_user_id = payload.actor_user_id or actor.id
    row.executed_at = datetime.now(timezone.utc)
    session.add(row)
    session.commit()
    return read_invoice_detail_full(session, invoice)


def refund_payment(
    session: Session,
    *,
    tenant_id: str,
    payment_id: str,
    payload: RefundRequest,
    actor: User,
) -> InvoiceDetailRead:
    enforce_entitlement(session, tenant_id, "billing_basic")
    # Lock the payment row so a duplicate/concurrent refund of the same payment
    # blocks and then sees status=REFUNDED (idempotency), instead of racing.
    payment_repo = BillingPaymentRepository(session)
    payment = payment_repo.get_payment_for_update(payment_id)
    if not payment or payment.tenant_id != tenant_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Payment not found"
        )
    if payment.status == PaymentStatus.REFUNDED:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="Payment already refunded"
        )
    invoice = payment_repo.get_invoice_for_tenant(
        tenant_id=tenant_id,
        invoice_id=payment.invoice_id,
    )
    if not invoice:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Invoice not found"
        )
    require_user_branch_access(actor, invoice.branch_id)
    available = max(int(payment.amount or 0) - int(payment.refunded_amount or 0), 0)
    amount = int(payload.amount or available)
    if amount > available:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Refund amount exceeds selected payment balance",
        )
    invoice = execute_adjustment(
        session,
        invoice=invoice,
        request_type=BillingAdjustmentType.FULL_REFUND
        if amount >= refundable_paid_total(session, invoice)
        else BillingAdjustmentType.PARTIAL_REFUND,
        amount=amount,
        reason=payload.reason,
        actor_user_id=actor.id,
        payment_method=payload.payment_method,
        payment_reference=payload.payment_reference,
        target_payment_id=payment.id,
    )
    return read_invoice_detail_full(session, invoice)


def cancel_invoice(
    session: Session,
    *,
    tenant_id: str,
    invoice_id: str,
    payload: CancelInvoiceRequest,
    actor: User,
) -> InvoiceDetailRead:
    enforce_entitlement(session, tenant_id, "billing_basic")
    require_direct_invoice_reversal_admin(session, actor)
    # Lock the invoice so a concurrent cancel/refund can't both pass the status
    # guard and double-reverse it.
    invoice = BillingAdjustmentRepository(session).get_invoice_for_update(invoice_id)
    if not invoice or invoice.tenant_id != tenant_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Invoice not found"
        )
    require_user_branch_access(actor, invoice.branch_id)
    if invoice.status == InvoiceStatus.CANCELLED:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="Invoice already cancelled"
        )
    if int(invoice.paid_amount or 0) > 0:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Paid invoices cannot be cancelled; refund payments first",
        )
    cancel_invoice_fields = ("status", "paid_amount", "balance_amount")
    before = {key: getattr(invoice, key) for key in cancel_invoice_fields}
    invoice = execute_adjustment(
        session,
        invoice=invoice,
        request_type=BillingAdjustmentType.CANCEL,
        amount=0,
        reason=payload.reason,
        actor_user_id=payload.actor_user_id or actor.id,
    )
    record_audit_event(
        session,
        tenant_id=tenant_id,
        branch_id=invoice.branch_id,
        actor_user_id=payload.actor_user_id or actor.id,
        action="invoice.cancelled",
        resource_type="invoice",
        resource_id=invoice.id,
        purpose="billing_cancellation",
        metadata_json=json.dumps({"reason": payload.reason}),
        changes=diff_changes(
            before, {key: getattr(invoice, key) for key in cancel_invoice_fields}
        ),
    )
    return read_invoice_detail_full(session, invoice)


def amend_invoice(
    session: Session,
    *,
    tenant_id: str,
    invoice_id: str,
    payload: AmendInvoiceRequest,
    actor: User,
) -> InvoiceDetailRead:
    enforce_entitlement(session, tenant_id, "billing_basic")
    require_direct_invoice_reversal_admin(session, actor)
    invoice = BillingAdjustmentRepository(session).get_invoice_for_tenant(
        tenant_id=tenant_id,
        invoice_id=invoice_id,
    )
    if not invoice:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Invoice not found"
        )
    require_user_branch_access(actor, invoice.branch_id)
    if invoice.status != InvoiceStatus.CANCELLED:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Only cancelled invoices can be amended",
        )
    restored_balance = int(invoice.total_amount or 0)
    amend_invoice_fields = ("status", "paid_amount", "balance_amount")
    before = {key: getattr(invoice, key) for key in amend_invoice_fields}
    invoice.status = (
        InvoiceStatus.ISSUED if restored_balance > 0 else InvoiceStatus.PAID
    )
    invoice.paid_amount = 0
    invoice.balance_amount = restored_balance
    invoice.updated_at = datetime.now(timezone.utc)
    session.add(invoice)
    session.commit()
    session.refresh(invoice)
    record_billing_ledger(
        session,
        invoice,
        entry_type="invoice_amended",
        description="Cancelled invoice amended and reopened",
        debit_amount=restored_balance,
        invoice_total_delta=restored_balance,
        balance_amount_delta=restored_balance,
        reason=payload.reason,
        actor_user_id=payload.actor_user_id or actor.id,
    )
    sync_physiotherapy_case_status(session, invoice)
    sync_home_care_booking_status(session, invoice)
    sync_patient_membership_payment(session, invoice)
    record_audit_event(
        session,
        tenant_id=tenant_id,
        branch_id=invoice.branch_id,
        actor_user_id=payload.actor_user_id or actor.id,
        action="invoice.amended",
        resource_type="invoice",
        resource_id=invoice.id,
        purpose="billing_amendment",
        metadata_json=json.dumps({"reason": payload.reason}),
        changes=diff_changes(
            before, {key: getattr(invoice, key) for key in amend_invoice_fields}
        ),
    )
    return read_invoice_detail_full(session, invoice)
