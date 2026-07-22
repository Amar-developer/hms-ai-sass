from decimal import Decimal

from sqlmodel import Session

from app.modules.billing.models import Invoice, InvoiceStatus
from app.modules.billing.repositories.read_repository import BillingReadRepository
from app.modules.billing.services.money import ZERO, money_value


def update_invoice_payment_status(session: Session, invoice: Invoice) -> Invoice:
    read_repo = BillingReadRepository(session)
    collected = read_repo.payment_amount_total(invoice)
    refunded = read_repo.refunded_amount_total(invoice)
    effective_paid = max(collected - refunded, ZERO)
    effective_total = max(money_value(invoice.total_amount), ZERO)
    invoice.paid_amount = effective_paid
    invoice.balance_amount = max(effective_total - effective_paid, ZERO)
    if invoice.total_amount <= 0 or effective_total <= 0:
        # Only an executed payment refund changes the invoice's financial
        # status. Credit notes are informational audit documents.
        invoice.status = InvoiceStatus.REFUNDED if refunded else InvoiceStatus.PAID
    elif refunded >= collected and collected > 0:
        invoice.status = InvoiceStatus.REFUNDED
    elif refunded > 0:
        invoice.status = InvoiceStatus.PARTIALLY_REFUNDED
    elif invoice.balance_amount <= 0:
        invoice.status = InvoiceStatus.PAID
    elif invoice.paid_amount <= 0:
        invoice.status = InvoiceStatus.ISSUED
    elif invoice.paid_amount < invoice.total_amount:
        invoice.status = InvoiceStatus.PARTIALLY_PAID
    else:
        invoice.status = InvoiceStatus.PAID
    session.add(invoice)
    session.commit()
    session.refresh(invoice)
    return invoice


def refundable_paid_total(session: Session, invoice: Invoice) -> Decimal:
    return BillingReadRepository(session).refundable_payment_total(invoice)
