from sqlmodel import Session, select

from app.modules.billing.models import Invoice, InvoiceItem


def allocate_amount(weights: list[int], amount: int) -> list[int]:
    """Allocate integer rupees exactly using the largest-remainder method."""
    safe_weights = [max(int(value or 0), 0) for value in weights]
    weight_total = sum(safe_weights)
    target = min(max(int(amount or 0), 0), weight_total)
    if target <= 0 or weight_total <= 0:
        return [0] * len(safe_weights)
    numerators = [target * weight for weight in safe_weights]
    allocated = [value // weight_total for value in numerators]
    remainder = target - sum(allocated)
    order = sorted(
        range(len(safe_weights)),
        key=lambda index: (
            -(numerators[index] % weight_total),
            -safe_weights[index],
            index,
        ),
    )
    for index in order[:remainder]:
        allocated[index] += 1
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

    totals = [max(int(item.total_amount or 0), 0) for item in items]
    membership_target = min(
        max(int(invoice.membership_discount_amount or 0), 0), sum(totals)
    )
    free_ids = set(free_item_ids or [])
    discounted_ids = set(discounted_item_ids or [])
    membership_allocations = [0] * len(items)

    if membership_target > 0 and (free_ids or discounted_ids):
        for index, item in enumerate(items):
            if item.external_item_code and item.external_item_code in free_ids:
                membership_allocations[index] = totals[index]
        remaining_membership = max(membership_target - sum(membership_allocations), 0)
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

    total_target = min(max(int(invoice.discount_amount or 0), 0), sum(totals))
    non_membership_target = max(total_target - sum(membership_allocations), 0)
    remaining_weights = [
        max(total - membership, 0)
        for total, membership in zip(totals, membership_allocations, strict=True)
    ]
    other_allocations = allocate_amount(remaining_weights, non_membership_target)
    for item, membership, other in zip(
        items, membership_allocations, other_allocations, strict=True
    ):
        item.membership_discount_amount = membership
        item.discount_amount = membership + other
        session.add(item)
