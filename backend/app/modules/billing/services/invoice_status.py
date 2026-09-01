from decimal import Decimal

from sqlmodel import Session

from app.modules.billing.models import Invoice, InvoiceStatus
from app.modules.billing.repositories.read_repository import BillingReadRepository
from app.modules.billing.services.money import ZERO, money_value


def calculate_invoice_payment_state(
    *,
    total_amount: Decimal,
    collected_amount: Decimal,
    refunded_amount: Decimal,
) -> tuple[Decimal, Decimal, InvoiceStatus]:
    collected = money_value(collected_amount)
    refunded = money_value(refunded_amount)
    effective_paid = max(collected - refunded, ZERO)
    effective_total = max(money_value(total_amount), ZERO)
    balance_amount = max(effective_total - effective_paid, ZERO)
    if total_amount <= 0 or effective_total <= 0:
        # Only an executed payment refund changes the invoice's financial
        # status. Credit notes are informational audit documents.
        status = InvoiceStatus.REFUNDED if refunded else InvoiceStatus.PAID
    elif refunded >= collected and collected > 0:
        status = InvoiceStatus.REFUNDED
    elif refunded > 0 and effective_paid < effective_total:
        status = InvoiceStatus.PARTIALLY_REFUNDED
    elif balance_amount <= 0:
        status = InvoiceStatus.PAID
    elif effective_paid <= 0:
        status = InvoiceStatus.ISSUED
    elif effective_paid < effective_total:
        status = InvoiceStatus.PARTIALLY_PAID
    else:
        status = InvoiceStatus.PAID
    return effective_paid, balance_amount, status


def update_invoice_payment_status(session: Session, invoice: Invoice) -> Invoice:
    read_repo = BillingReadRepository(session)
    collected = read_repo.payment_amount_total(invoice)
    refunded = read_repo.refunded_amount_total(invoice)
    paid_amount, balance_amount, invoice_status = calculate_invoice_payment_state(
        total_amount=invoice.total_amount,
        collected_amount=collected,
        refunded_amount=refunded,
    )
    invoice.paid_amount = paid_amount
    invoice.balance_amount = balance_amount
    invoice.status = invoice_status
    session.add(invoice)
    session.commit()
    session.refresh(invoice)
    return invoice


def refundable_paid_total(session: Session, invoice: Invoice) -> Decimal:
    return BillingReadRepository(session).refundable_payment_total(invoice)
