from app.modules.billing.models import Invoice, InvoiceStatus


def settlement_paid_basis(invoice: Invoice) -> int:
    total = int(invoice.total_amount or 0)
    paid = int(invoice.paid_amount or 0)
    doctor_share = int(invoice.doctor_share_amount or 0)
    if not total or not paid or not doctor_share:
        return 0
    return min(round((doctor_share * paid) / total), paid)


def invoice_item_total(invoice: Invoice) -> int:
    return int(invoice.subtotal_amount or invoice.total_amount or 0)


def invoice_membership_benefit(invoice: Invoice) -> int:
    return int(invoice.membership_discount_amount or 0)


def invoice_offer_discount(invoice: Invoice) -> int:
    return max(
        int(invoice.discount_amount or 0) - invoice_membership_benefit(invoice), 0
    )


def allocated_line_revenue(invoice: Invoice, line_amount: int) -> int:
    item_total = invoice_item_total(invoice)
    revenue = int(invoice.paid_amount or invoice.total_amount or 0)
    if not item_total or not line_amount or not revenue:
        return 0
    return round((line_amount * revenue) / item_total)


def allocated_line_offer_discount(invoice: Invoice, line_amount: int) -> int:
    item_total = invoice_item_total(invoice)
    offer_discount = invoice_offer_discount(invoice)
    if not item_total or not line_amount or not offer_discount:
        return 0
    return round((line_amount * offer_discount) / item_total)


def allocated_line_membership_benefit(invoice: Invoice, line_amount: int) -> int:
    item_total = invoice_item_total(invoice)
    membership_benefit = invoice_membership_benefit(invoice)
    if not item_total or not line_amount or not membership_benefit:
        return 0
    return round((line_amount * membership_benefit) / item_total)


def is_paid_invoice(invoice: Invoice) -> bool:
    total = int(invoice.total_amount or 0)
    balance = int(invoice.balance_amount or 0)
    settled_zero_invoice = (
        total == 0 and balance <= 0 and int(invoice.discount_amount or 0) > 0
    )
    return (
        invoice.status == InvoiceStatus.PAID
        or (int(invoice.paid_amount or 0) > 0 and balance <= 0)
        or settled_zero_invoice
    )
