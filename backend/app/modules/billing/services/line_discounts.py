from decimal import Decimal, ROUND_DOWN

from sqlmodel import Session, select

from app.modules.billing.models import Invoice, InvoiceItem
from app.modules.billing.services.money import MONEY_QUANTUM, ZERO, money_value


def allocate_amount(
    weights: list[Decimal | int], amount: Decimal | int
) -> list[Decimal]:
    """Allocate money exactly to paise using the largest-remainder method."""
    safe_weights = [max(money_value(value), ZERO) for value in weights]
    weight_total = sum(safe_weights)
    target = min(max(money_value(amount), ZERO), weight_total)
    if target <= 0 or weight_total <= 0:
        return [ZERO] * len(safe_weights)
    exact = [target * weight / weight_total for weight in safe_weights]
    allocated = [value.quantize(MONEY_QUANTUM, rounding=ROUND_DOWN) for value in exact]
    remainder_cents = int((target - sum(allocated)) / MONEY_QUANTUM)
    order = sorted(
        range(len(safe_weights)),
        key=lambda index: (
            -(exact[index] - allocated[index]),
            -safe_weights[index],
            index,
        ),
    )
    for index in order[:remainder_cents]:
        allocated[index] += MONEY_QUANTUM
    return allocated


def sync_invoice_item_discounts(
    session: Session,
    invoice: Invoice,
    *,
    free_item_ids: list[str] | None = None,
    discounted_item_ids: list[str] | None = None,
) -> None:
    """Persist item discounts and keep their sum equal to the invoice discount.

    Membership free lines are discounted fully. The membership percentage
    amount is spread only across eligible discounted lines. Any offer or
    approved discount is then spread across the remaining gross value.
    """
    items = list(
        session.exec(
            select(InvoiceItem)
            .where(InvoiceItem.invoice_id == invoice.id)
            .order_by(InvoiceItem.created_at, InvoiceItem.id)
        ).all()
    )
    if not items:
        return

    totals = [max(money_value(item.total_amount), ZERO) for item in items]
    membership_target = min(
        max(money_value(invoice.membership_discount_amount), ZERO), sum(totals)
    )
    free_ids = set(free_item_ids or [])
    discounted_ids = set(discounted_item_ids or [])
    membership_allocations = [ZERO] * len(items)

    if membership_target > 0 and (free_ids or discounted_ids):
        for index, item in enumerate(items):
            if item.external_item_code and item.external_item_code in free_ids:
                membership_allocations[index] = totals[index]
        remaining_membership = max(
            membership_target - sum(membership_allocations), ZERO
        )
        eligible_indexes = [
            index
            for index, item in enumerate(items)
            if item.external_item_code
            and item.external_item_code in discounted_ids
            and membership_allocations[index] < totals[index]
        ]
        eligible_weights = [
            totals[index] - membership_allocations[index] for index in eligible_indexes
        ]
        for index, value in zip(
            eligible_indexes,
            allocate_amount(eligible_weights, remaining_membership),
            strict=True,
        ):
            membership_allocations[index] += value
    elif membership_target > 0:
        membership_allocations = allocate_amount(totals, membership_target)

    total_target = min(max(money_value(invoice.discount_amount), ZERO), sum(totals))
    non_membership_target = max(total_target - sum(membership_allocations), ZERO)
    remaining_weights = [
        max(total - membership, ZERO)
        for total, membership in zip(totals, membership_allocations, strict=True)
    ]
    other_allocations = allocate_amount(remaining_weights, non_membership_target)
    for item, membership, other in zip(
        items, membership_allocations, other_allocations, strict=True
    ):
        item.membership_discount_amount = membership
        item.discount_amount = membership + other
        session.add(item)
