import pytest
from fastapi import HTTPException
from sqlmodel import Session

from app.modules.billing.models import Invoice
from app.modules.billing.services.discount_policy import (
    MEMBERSHIP_DISCOUNT_CONFLICT_DETAIL,
    compose_invoice_discounts,
    ensure_invoice_allows_additional_discount,
)
from app.modules.billing.services.invoice_amounts import apply_generic_invoice_discount


def membership_invoice(**updates):
    values = {
        "tenant_id": "tenant_membership_policy",
        "branch_id": "branch_main",
        "patient_id": "patient_member",
        "invoice_number": "INV-MEMBER-001",
        "subtotal_amount": 1000,
        "discount_amount": 400,
        "membership_discount_amount": 400,
        "taxable_amount": 600,
        "total_amount": 600,
        "balance_amount": 600,
    }
    values.update(updates)
    return Invoice(**values)


def test_membership_discount_excludes_approved_discount_and_offer():
    result = compose_invoice_discounts(
        subtotal=1000,
        membership_discount=400,
        approved_discount=150,
        offer_discount=100,
    )

    assert result.total == 400
    assert result.membership == 400
    assert result.approved == 0
    assert result.offer == 0


@pytest.mark.parametrize(
    "membership_fields",
    [
        {"membership_discount_amount": 100},
        {"membership_free_items_amount": 100},
        {"membership_item_discount_amount": 25},
    ],
)
def test_membership_benefit_blocks_later_discount_requests(membership_fields):
    invoice = membership_invoice(**membership_fields)

    with pytest.raises(HTTPException) as blocked:
        ensure_invoice_allows_additional_discount(invoice)

    assert blocked.value.status_code == 409
    assert blocked.value.detail == MEMBERSHIP_DISCOUNT_CONFLICT_DETAIL


def test_membership_benefit_blocks_discount_execution(test_engine):
    with Session(test_engine) as session:
        invoice = membership_invoice()
        session.add(invoice)
        session.commit()
        session.refresh(invoice)

        with pytest.raises(HTTPException) as blocked:
            apply_generic_invoice_discount(
                session,
                invoice=invoice,
                discount_amount=50,
                actor_user_id="billing-user",
            )

    assert blocked.value.status_code == 409
    assert blocked.value.detail == MEMBERSHIP_DISCOUNT_CONFLICT_DETAIL
