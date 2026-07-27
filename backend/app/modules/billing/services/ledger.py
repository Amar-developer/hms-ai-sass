from fastapi import HTTPException, status
from decimal import Decimal
from sqlmodel import Session

from app.core.auth import is_tenant_admin_user
from app.modules.billing.models import (
    BillingAdjustmentType,
    BillingLedgerEntry,
    Invoice,
    PaymentMethod,
)
from app.modules.billing.repositories.read_repository import BillingReadRepository
from app.modules.billing.schemas import InvoiceDetailRead
from app.modules.billing.services.adjustments import execute_billing_adjustment
from app.modules.billing.services.read_models import read_invoice_detail
from app.modules.billing.services.money import ZERO, money_value
from app.modules.billing.services.service_invoices import (
    create_service_invoice as _create_service_invoice_command,
)
from app.modules.billing.services.source_sync import sync_invoice_source_after_reversal
from app.modules.identity.models import User


def require_direct_invoice_reversal_admin(session: Session, current_user: User) -> None:
    if current_user.is_super_admin or is_tenant_admin_user(session, current_user):
        return
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Tenant admin access required for direct invoice cancellation or amendment",
    )


def record_billing_ledger(
    session: Session,
    invoice: Invoice,
    *,
    entry_type: str,
    description: str,
    debit_amount: Decimal | int = 0,
    credit_amount: Decimal | int = 0,
    invoice_total_delta: Decimal | int = 0,
    paid_amount_delta: Decimal | int = 0,
    balance_amount_delta: Decimal | int = 0,
    reason: str | None = None,
    actor_user_id: str | None = None,
    related_payment_id: str | None = None,
    related_credit_note_id: str | None = None,
    commit: bool = True,
) -> BillingLedgerEntry:
    entry = BillingLedgerEntry(
        tenant_id=invoice.tenant_id,
        branch_id=invoice.branch_id,
        invoice_id=invoice.id,
        invoice_number=invoice.invoice_number,
        entry_type=entry_type,
        description=description,
        debit_amount=max(money_value(debit_amount), ZERO),
        credit_amount=max(money_value(credit_amount), ZERO),
        invoice_total_delta=money_value(invoice_total_delta),
        paid_amount_delta=money_value(paid_amount_delta),
        balance_amount_delta=money_value(balance_amount_delta),
        status_after=invoice.status,
        reason=reason,
        actor_user_id=actor_user_id,
        related_payment_id=related_payment_id,
        related_credit_note_id=related_credit_note_id,
    )
    session.add(entry)
    if commit:
        session.commit()
        session.refresh(entry)
    return entry


def ensure_invoice_submit_ledger(session: Session, invoice: Invoice) -> None:
    if BillingReadRepository(session).has_ledger_entry(
        invoice=invoice,
        entry_type="invoice_submitted",
    ):
        return
    # A membership discount is baked into total_amount/balance_amount at
    # invoice creation, then ensure_invoice_membership_benefit_ledger below
    # records a *separate* ledger entry that subtracts it again to show that
    # transition. Using the already-net total/balance here would double the
    # discount across the two entries — undershooting the running Bill
    # Amount/Balance by the discount amount even after the invoice is fully
    # paid. Add it back so "Invoice Submitted" represents the gross,
    # pre-membership-discount figure and the two entries telescope correctly.
    membership_discount = money_value(invoice.membership_discount_amount)
    gross_total = money_value(invoice.total_amount) + membership_discount
    gross_balance = money_value(invoice.balance_amount) + membership_discount
    record_billing_ledger(
        session,
        invoice,
        entry_type="invoice_submitted",
        description="Invoice submitted",
        debit_amount=gross_total,
        invoice_total_delta=gross_total,
        balance_amount_delta=gross_balance,
        actor_user_id=invoice.created_by_user_id,
    )


def ensure_invoice_membership_benefit_ledger(
    session: Session,
    invoice: Invoice,
    *,
    actor_user_id: str | None = None,
    commit: bool = True,
) -> None:
    membership_amount = money_value(invoice.membership_discount_amount)
    if membership_amount <= 0:
        return
    if BillingReadRepository(session).has_ledger_entry(
        invoice=invoice,
        entry_type="membership_benefit_applied",
    ):
        return
    free_amount = money_value(invoice.membership_free_items_amount)
    discounted_amount = money_value(invoice.membership_item_discount_amount)
    regular_amount = money_value(invoice.membership_regular_items_amount)
    breakdown = (
        f"Free items ₹{free_amount}; membership discount ₹{discounted_amount}; "
        f"regular chargeable items ₹{regular_amount}"
    )
    record_billing_ledger(
        session,
        invoice,
        entry_type="membership_benefit_applied",
        description=f"Membership benefit applied ({breakdown})",
        credit_amount=membership_amount,
        invoice_total_delta=-membership_amount,
        balance_amount_delta=-membership_amount,
        reason=f"Membership benefit settled by patient plan. {breakdown}",
        actor_user_id=actor_user_id or invoice.created_by_user_id,
        commit=commit,
    )


def read_invoice_detail_full(session: Session, invoice: Invoice) -> InvoiceDetailRead:
    return read_invoice_detail(
        session,
        invoice,
        ensure_invoice_submit_ledger=ensure_invoice_submit_ledger,
        ensure_invoice_membership_benefit_ledger=ensure_invoice_membership_benefit_ledger,
    )


def create_service_invoice(
    session: Session,
    *,
    tenant_id: str,
    branch_id: str,
    patient_id: str,
    appointment_id: str | None,
    consultation_id: str | None,
    lab_order_id: str | None = None,
    pharmacy_issue_id: str | None = None,
    item_type: str,
    description: str,
    amount: int,
    created_by_user_id: str | None,
    line_items: list[dict[str, int | str | None]] | None = None,
    service_scope: str,
    tax_rule_id: str | None = None,
    discount_offer_id: str | None = None,
    benefit_item_ids: list[str] | None = None,
    benefit_item_amounts: dict[str, int] | None = None,
) -> Invoice:
    return _create_service_invoice_command(
        session,
        tenant_id=tenant_id,
        branch_id=branch_id,
        patient_id=patient_id,
        appointment_id=appointment_id,
        consultation_id=consultation_id,
        lab_order_id=lab_order_id,
        pharmacy_issue_id=pharmacy_issue_id,
        item_type=item_type,
        description=description,
        amount=amount,
        created_by_user_id=created_by_user_id,
        line_items=line_items,
        service_scope=service_scope,
        tax_rule_id=tax_rule_id,
        discount_offer_id=discount_offer_id,
        benefit_item_ids=benefit_item_ids,
        benefit_item_amounts=benefit_item_amounts,
        record_billing_ledger=record_billing_ledger,
        ensure_invoice_membership_benefit_ledger=ensure_invoice_membership_benefit_ledger,
    )


def execute_adjustment(
    session: Session,
    *,
    invoice: Invoice,
    request_type: BillingAdjustmentType,
    amount: int,
    reason: str,
    actor_user_id: str | None,
    payment_method: PaymentMethod | None = None,
    payment_reference: str | None = None,
    target_payment_id: str | None = None,
) -> Invoice:
    return execute_billing_adjustment(
        session,
        invoice=invoice,
        request_type=request_type,
        amount=amount,
        reason=reason,
        actor_user_id=actor_user_id,
        payment_method=payment_method,
        payment_reference=payment_reference,
        target_payment_id=target_payment_id,
        record_billing_ledger=record_billing_ledger,
        sync_invoice_source_after_reversal=sync_invoice_source_after_reversal,
    )
