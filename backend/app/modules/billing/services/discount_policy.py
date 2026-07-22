from dataclasses import dataclass
from decimal import Decimal

from fastapi import HTTPException, status

from app.modules.billing.models import Invoice
from app.modules.billing.services.money import ZERO, money_value


MEMBERSHIP_DISCOUNT_CONFLICT_DETAIL = (
    "Patient membership benefits cannot be combined with additional "
    "discounts or promotional offers."
)


@dataclass(frozen=True)
class InvoiceDiscountComposition:
    total: Decimal
    membership: Decimal
    approved: Decimal
    offer: Decimal


def compose_invoice_discounts(
    *,
    subtotal: Decimal | int,
    membership_discount: Decimal | int = 0,
    approved_discount: Decimal | int = 0,
    offer_discount: Decimal | int = 0,
) -> InvoiceDiscountComposition:
    """Membership is exclusive; otherwise compose approved and offer savings."""
    subtotal = max(money_value(subtotal), ZERO)
    membership = min(max(money_value(membership_discount), ZERO), subtotal)
    if membership > 0:
        return InvoiceDiscountComposition(
            total=membership,
            membership=membership,
            approved=ZERO,
            offer=ZERO,
        )
    approved = max(money_value(approved_discount), ZERO)
    offer = max(money_value(offer_discount), ZERO)
    total = min(approved + offer, subtotal)
    approved = min(approved, total)
    offer = max(total - approved, ZERO)
    return InvoiceDiscountComposition(
        total=total,
        membership=ZERO,
        approved=approved,
        offer=offer,
    )


def invoice_has_applied_membership_benefit(invoice: Invoice) -> bool:
    return any(
        money_value(value) > 0
        for value in (
            invoice.membership_discount_amount,
            invoice.membership_free_items_amount,
            invoice.membership_item_discount_amount,
        )
    )


def ensure_invoice_allows_additional_discount(invoice: Invoice) -> None:
    if invoice_has_applied_membership_benefit(invoice):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=MEMBERSHIP_DISCOUNT_CONFLICT_DETAIL,
        )
