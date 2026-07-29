from app.modules.billing.models import Invoice, InvoiceStatus


def settlement_paid_basis(invoice: Invoice) -> int:
    total = int(invoice.total_amount or 0)
    paid = int(invoice.paid_amount or 0)
    doctor_share = int(invoice.doctor_share_amount or 0)
    if not doctor_share:
        return 0
    if total <= 0 and int(invoice.membership_discount_amount or 0) > 0:
        # Membership pays the patient's bill down to zero, but the contractual
        # doctor cost is still incurred and must remain visible/payable.
        return doctor_share
    if not total or not paid:
        return 0
    return min(round((doctor_share * paid) / total), paid)


def tax_paid_basis(invoice: Invoice) -> int:
    total = int(invoice.total_amount or 0)
    paid = int(invoice.paid_amount or 0)
    tax = int(invoice.tax_amount or 0)
    if not total or not paid or not tax:
        return 0
    return min(round((tax * paid) / total), paid, tax)


def report_doctor_fee(invoice: Invoice, invoice_type: str) -> int:
    """Paid-basis doctor cost, exclusively for consultation invoices."""
    return settlement_paid_basis(invoice) if invoice_type == "consultation" else 0


def report_settlement(invoice: Invoice, invoice_type: str, items=()) -> int:
    """Non-consultation cost; never duplicates the consultation doctor fee."""
    if invoice_type == "consultation":
        return 0
    if invoice_type in {"lab", "pharmacy"}:
        return sum(
            int(item.buying_amount or 0) * int(item.quantity or 1) for item in items
        )
    return settlement_paid_basis(invoice)


def invoice_item_total(invoice: Invoice) -> int:
    return int(invoice.subtotal_amount or invoice.total_amount or 0)


def invoice_membership_benefit(invoice: Invoice) -> int:
    return int(invoice.membership_discount_amount or 0)


def invoice_report_total(invoice: Invoice) -> int:
    """Full service value displayed by reports, including membership usage."""
    return int(invoice.total_amount or 0) + invoice_membership_benefit(invoice)


def invoice_offer_discount(invoice: Invoice) -> int:
    return max(int(getattr(invoice, "offer_discount_amount", 0) or 0), 0)


def invoice_approved_discount(invoice: Invoice) -> int:
    return max(int(getattr(invoice, "approved_discount_amount", 0) or 0), 0)


def invoice_billing_discount(invoice: Invoice) -> int:
    return (
        invoice_approved_discount(invoice)
        + invoice_offer_discount(invoice)
        + invoice_membership_benefit(invoice)
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


def allocate_values(
    line_amounts: list[int], invoice_subtotal: int, invoice_value: int
) -> list[int]:
    """Allocate an integer invoice value without losing a rupee to rounding."""
    subtotal = max(int(invoice_subtotal or 0), 0)
    value = max(int(invoice_value or 0), 0)
    weights = [max(int(line or 0), 0) for line in line_amounts]
    if not subtotal or not value or not weights:
        return [0 for _weight in weights]
    target = min(value, round(sum(weights) * value / subtotal))
    allocations = [(weight * value) // subtotal for weight in weights]
    remainder = target - sum(allocations)
    ranked = sorted(
        range(len(weights)),
        key=lambda index: (-(weights[index] * value % subtotal), index),
    )
    for index in ranked[:remainder]:
        allocations[index] += 1
    return allocations


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
