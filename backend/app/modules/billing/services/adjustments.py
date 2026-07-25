from collections.abc import Callable
from datetime import datetime, timezone
from decimal import Decimal
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
from app.modules.billing.services.invoice_amounts import (
    apply_consultation_invoice_discount,
    apply_generic_invoice_discount,
    ensure_invoice_eligible_for_discount_request,
    is_consultation_invoice,
)
from app.modules.billing.services.invoice_status import update_invoice_payment_status
from app.modules.billing.services.numbering import next_credit_note_number
from app.modules.billing.services.money import ZERO, money_value
from app.modules.notifications.service import queue_whatsapp_template_if_allowed
from app.modules.patients.models import Patient

LedgerRecorder = Callable[..., object]
SourceSyncer = Callable[[Session, Invoice], None]


def validate_adjustment_amount(
    invoice: Invoice,
    request_type: BillingAdjustmentType,
    amount: Decimal | int | None,
) -> Decimal:
    refundable = money_value(invoice.paid_amount)
    if request_type == BillingAdjustmentType.CANCEL:
        return ZERO
    if request_type == BillingAdjustmentType.DISCOUNT:
        requested = money_value(amount)
        if requested <= 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Discount amount is required",
            )
        if requested > money_value(invoice.total_amount):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Discount amount cannot exceed the invoice total",
            )
        return requested
    if request_type == BillingAdjustmentType.FULL_REFUND:
        if refundable <= 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invoice has no refundable paid amount",
            )
        return refundable
    requested = money_value(amount)
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
        and money_value(invoice.paid_amount) > 0
    ):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Paid invoices must be refunded instead of cancelled",
        )
    if request_type == BillingAdjustmentType.DISCOUNT:
        ensure_invoice_eligible_for_discount_request(
            tenant_id=invoice.tenant_id, invoice=invoice
        )


def apply_refund_to_payments(
    session: Session,
    invoice: Invoice,
    amount: Decimal,
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
        available = max(
            money_value(payment.amount) - money_value(payment.refunded_amount), ZERO
        )
        if available <= 0:
            continue
        refund_part = min(available, remaining)
        payment.refunded_amount = money_value(payment.refunded_amount) + refund_part
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
    amount: Decimal | int,
    reason: str,
    actor_user_id: str | None,
    record_billing_ledger: LedgerRecorder,
    sync_invoice_source_after_reversal: SourceSyncer,
    payment_method: PaymentMethod | None = None,
    payment_reference: str | None = None,
    target_payment_id: str | None = None,
) -> Invoice:
    old_paid = money_value(invoice.paid_amount)
    old_balance = money_value(invoice.balance_amount)
    old_total = money_value(invoice.total_amount)
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

    if request_type == BillingAdjustmentType.DISCOUNT:
        discount_amount = validate_adjustment_amount(invoice, request_type, amount)
        if is_consultation_invoice(invoice):
            invoice = apply_consultation_invoice_discount(
                session,
                tenant_id=invoice.tenant_id,
                invoice=invoice,
                discount_amount=discount_amount,
                actor_user_id=actor_user_id,
            )
        else:
            invoice = apply_generic_invoice_discount(
                session,
                invoice=invoice,
                discount_amount=discount_amount,
                actor_user_id=actor_user_id,
            )
        # Tax is recomputed on the lower subtotal, so the invoice total can
        # drop by more than the raw discount amount — use the actual change
        # for the credit note and ledger rather than the requested amount.
        actual_reduction = max(old_total - money_value(invoice.total_amount), ZERO)
        credit = CreditNote(
            tenant_id=invoice.tenant_id,
            branch_id=invoice.branch_id,
            invoice_id=invoice.id,
            credit_note_number=next_credit_note_number(session, invoice.tenant_id),
            amount=actual_reduction or discount_amount,
            reason=reason,
            created_by_user_id=actor_user_id,
        )
        session.add(credit)
        session.commit()
        session.refresh(credit)
        record_billing_ledger(
            session,
            invoice,
            entry_type="invoice_discount_applied",
            description="Discount applied to invoice",
            credit_amount=actual_reduction,
            invoice_total_delta=-actual_reduction,
            balance_amount_delta=-actual_reduction,
            reason=reason,
            actor_user_id=actor_user_id,
            related_credit_note_id=credit.id,
        )
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
        resource_type="credit_note",
        resource_id=credit.id,
        purpose="refund",
        metadata_json=json.dumps(
            {
                "amount": refund_amount,
                "reason": reason,
                "payment_method": payment_method.value if payment_method else None,
                "payment_reference": payment_reference,
            },
            default=str,
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
    patient = session.get(Patient, invoice.patient_id)
    queue_whatsapp_template_if_allowed(
        session,
        tenant_id=invoice.tenant_id,
        branch_id=invoice.branch_id,
        flow_key="invoice_refunded_patient",
        recipient=patient.mobile if patient else None,
        resource_type="invoice",
        resource_id=invoice.id,
        dedupe_key=f"whatsapp:invoice:{invoice.id}:refund:{credit.id}",
        queued_by_user_id=actor_user_id,
    )
    return invoice
