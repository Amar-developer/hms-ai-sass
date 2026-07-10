from collections.abc import Callable
from datetime import datetime, timezone
import json

from fastapi import HTTPException, status
from sqlmodel import Session

from app.modules.audit.service import diff_changes, record_audit_event
from app.modules.billing.models import (
    BillingAdjustmentType,
    CreditNote,
    Invoice,
    InvoiceStatus,
    Payment,
    PaymentMethod,
    PaymentStatus,
)
from app.modules.billing.repositories.read_repository import BillingReadRepository
from app.modules.billing.services.invoice_status import update_invoice_payment_status
from app.modules.billing.services.numbering import next_credit_note_number

LedgerRecorder = Callable[..., object]
SourceSyncer = Callable[[Session, Invoice], None]


def validate_adjustment_amount(
    invoice: Invoice, request_type: BillingAdjustmentType, amount: int | None
) -> int:
    refundable = int(invoice.paid_amount or 0)
    if request_type == BillingAdjustmentType.CANCEL:
        return 0
    if request_type == BillingAdjustmentType.FULL_REFUND:
        if refundable <= 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invoice has no refundable paid amount",
            )
        return refundable
    requested = int(amount or 0)
    if requested <= 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Partial refund amount is required",
        )
    if requested > refundable:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Refund amount cannot exceed refundable paid amount",
        )
    return requested


def invoice_has_open_adjustment_request(session: Session, invoice: Invoice) -> bool:
    return BillingReadRepository(session).has_open_adjustment_request(invoice)


def ensure_invoice_can_request_adjustment(
    session: Session, invoice: Invoice, request_type: BillingAdjustmentType
) -> None:
    if invoice.status in {
        InvoiceStatus.CANCELLED,
        InvoiceStatus.REFUNDED,
    }:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Invoice is already closed for cancellation/refund",
        )
    if invoice_has_open_adjustment_request(session, invoice):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Invoice already has a pending or approved adjustment request",
        )
    if (
        request_type == BillingAdjustmentType.CANCEL
        and int(invoice.paid_amount or 0) > 0
    ):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Paid invoices must be refunded instead of cancelled",
        )


def apply_refund_to_payments(
    session: Session,
    invoice: Invoice,
    amount: int,
    reason: str,
    target_payment_id: str | None = None,
) -> list[Payment]:
    remaining = amount
    changed: list[Payment] = []
    # Lock the invoice's payment rows FOR UPDATE so two concurrent refunds can't
    # both read the same available balance and over-refund.
    payments = BillingReadRepository(session).list_payments_for_refund_update(invoice)
    # When a specific payment is being refunded (POST /payments/{id}/refund),
    # drain that payment FIRST — the caller validated the amount against *its*
    # balance, so the money must come off it, not off whichever payment happens
    # to be most recent. Otherwise a retried refund for the same payment_id
    # (still marked un-refunded because a different row was touched) would
    # double-refund the invoice.
    if target_payment_id:
        payments.sort(key=lambda p: 0 if p.id == target_payment_id else 1)
    for payment in payments:
        available = max(int(payment.amount or 0) - int(payment.refunded_amount or 0), 0)
        if available <= 0:
            continue
        refund_part = min(available, remaining)
        payment.refunded_amount = int(payment.refunded_amount or 0) + refund_part
        payment.refund_reason = reason
        if payment.refunded_amount >= payment.amount:
            payment.status = PaymentStatus.REFUNDED
            payment.refunded_at = datetime.now(timezone.utc)
        session.add(payment)
        changed.append(payment)
        remaining -= refund_part
        if remaining <= 0:
            break
    if remaining > 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Refund amount exceeds available payment balance",
        )
    session.commit()
    return changed


def execute_billing_adjustment(
    session: Session,
    *,
    invoice: Invoice,
    request_type: BillingAdjustmentType,
    amount: int,
    reason: str,
    actor_user_id: str | None,
    record_billing_ledger: LedgerRecorder,
    sync_invoice_source_after_reversal: SourceSyncer,
    payment_method: PaymentMethod | None = None,
    payment_reference: str | None = None,
    target_payment_id: str | None = None,
) -> Invoice:
    old_paid = int(invoice.paid_amount or 0)
    old_balance = int(invoice.balance_amount or 0)
    old_total = int(invoice.total_amount or 0)
    old_status = invoice.status
    if request_type == BillingAdjustmentType.CANCEL:
        if old_paid > 0:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Paid invoices must be refunded before cancellation",
            )
        invoice.status = InvoiceStatus.CANCELLED
        invoice.paid_amount = 0
        invoice.balance_amount = 0
        invoice.updated_at = datetime.now(timezone.utc)
        session.add(invoice)
        session.commit()
        session.refresh(invoice)
        record_billing_ledger(
            session,
            invoice,
            entry_type="invoice_cancelled",
            description="Invoice cancelled and financial impact reversed",
            credit_amount=old_total,
            invoice_total_delta=-old_total,
            paid_amount_delta=-old_paid,
            balance_amount_delta=-old_balance,
            reason=reason,
            actor_user_id=actor_user_id,
        )
        sync_invoice_source_after_reversal(session, invoice)
        return invoice

    refund_amount = validate_adjustment_amount(invoice, request_type, amount)
    changed_payments = apply_refund_to_payments(
        session, invoice, refund_amount, reason, target_payment_id=target_payment_id
    )
    credit = CreditNote(
        tenant_id=invoice.tenant_id,
        branch_id=invoice.branch_id,
        invoice_id=invoice.id,
        credit_note_number=next_credit_note_number(session, invoice.tenant_id),
        amount=refund_amount,
        reason=reason,
        created_by_user_id=actor_user_id,
    )
    session.add(credit)
    session.commit()
    session.refresh(credit)
    invoice = update_invoice_payment_status(session, invoice)
    record_billing_ledger(
        session,
        invoice,
        entry_type="payment_refunded"
        if request_type == BillingAdjustmentType.FULL_REFUND
        else "payment_partially_refunded",
        description="Payment refunded"
        if request_type == BillingAdjustmentType.FULL_REFUND
        else "Payment partially refunded",
        debit_amount=refund_amount,
        paid_amount_delta=-refund_amount,
        balance_amount_delta=0,
        reason=reason,
        actor_user_id=actor_user_id,
        related_payment_id=changed_payments[0].id if changed_payments else None,
        related_credit_note_id=credit.id,
    )
    if payment_method or payment_reference:
        record_billing_ledger(
            session,
            invoice,
            entry_type="refund_disbursed",
            description="Refund disbursed",
            debit_amount=refund_amount,
            reason=payment_reference or reason,
            actor_user_id=actor_user_id,
            related_credit_note_id=credit.id,
        )
    sync_invoice_source_after_reversal(session, invoice)
    record_audit_event(
        session,
        tenant_id=invoice.tenant_id,
        branch_id=invoice.branch_id,
        actor_user_id=actor_user_id,
        action="payment.refunded"
        if request_type == BillingAdjustmentType.FULL_REFUND
        else "payment.partially_refunded",
        resource_type="invoice",
        resource_id=invoice.id,
        purpose="refund",
        metadata_json=json.dumps(
            {
                "amount": refund_amount,
                "reason": reason,
                "payment_method": payment_method.value if payment_method else None,
                "payment_reference": payment_reference,
            }
        ),
        changes=diff_changes(
            {
                "status": old_status,
                "paid_amount": old_paid,
                "balance_amount": old_balance,
            },
            {
                "status": invoice.status,
                "paid_amount": invoice.paid_amount,
                "balance_amount": invoice.balance_amount,
            },
        ),
    )
    return invoice
