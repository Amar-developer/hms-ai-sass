from dataclasses import dataclass

from fastapi import HTTPException, status

from app.modules.billing.models import Invoice


MEMBERSHIP_DISCOUNT_CONFLICT_DETAIL = (
    "Patient membership benefits cannot be combined with additional "
    "discounts or promotional offers."
)


@dataclass(frozen=True)
class InvoiceDiscountComposition:
    total: int
    membership: int
    approved: int
    offer: int


def compose_invoice_discounts(
    *,
    subtotal: int,
    membership_discount: int = 0,
    approved_discount: int = 0,
    offer_discount: int = 0,
) -> InvoiceDiscountComposition:
    """Membership is exclusive; otherwise compose approved and offer savings."""
    subtotal = max(int(subtotal or 0), 0)
    membership = min(max(int(membership_discount or 0), 0), subtotal)
    if membership > 0:
        return InvoiceDiscountComposition(
            total=membership,
            membership=membership,
            approved=0,
            offer=0,
        )
    approved = max(int(approved_discount or 0), 0)
    offer = max(int(offer_discount or 0), 0)
    total = min(approved + offer, subtotal)
    approved = min(approved, total)
    offer = max(total - approved, 0)
    return InvoiceDiscountComposition(
        total=total,
        membership=0,
        approved=approved,
        offer=offer,
    )


def invoice_has_applied_membership_benefit(invoice: Invoice) -> bool:
    return any(
        int(value or 0) > 0
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
