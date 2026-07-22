from decimal import Decimal

from app.modules.billing.models import DiscountOffer, DiscountType
from app.modules.billing.schemas import InvoiceMembershipBenefitRead, InvoiceRead
from app.modules.billing.services.line_discounts import allocate_amount
from app.modules.billing.services.money import percentage_amount
from app.modules.billing.services.rules import _offer_discount_value


def test_percentage_amount_keeps_paise() -> None:
    assert percentage_amount(180, Decimal("10.3")) == Decimal("18.54")


def test_percentage_offer_keeps_paise() -> None:
    offer = DiscountOffer(
        tenant_id="tenant_precision",
        name="Decimal offer",
        discount_type=DiscountType.PERCENTAGE,
        value=Decimal("10.3"),
    )
    assert _offer_discount_value(offer, Decimal("180")) == Decimal("18.54")


def test_line_discount_allocation_balances_to_paise() -> None:
    allocated = allocate_amount(
        [Decimal("180"), Decimal("300"), Decimal("120")], Decimal("61.80")
    )
    assert allocated == [Decimal("18.54"), Decimal("30.90"), Decimal("12.36")]
    assert sum(allocated) == Decimal("61.80")


def test_billing_response_decimals_are_json_numbers() -> None:
    response = InvoiceMembershipBenefitRead(
        discount_amount=Decimal("500.00"),
        payable_amount=Decimal("160.98"),
    ).model_dump(mode="json")

    assert response["discount_amount"] == 500
    assert isinstance(response["discount_amount"], int)
    assert response["payable_amount"] == 160.98
    assert isinstance(response["payable_amount"], float)

    invoice_response = InvoiceRead.model_construct(
        total_amount=Decimal("500.00"),
        paid_amount=Decimal("0.00"),
        balance_amount=Decimal("160.98"),
    ).model_dump(
        mode="json",
        include={"total_amount", "paid_amount", "balance_amount"},
    )
    assert invoice_response == {
        "total_amount": 500,
        "paid_amount": 0,
        "balance_amount": 160.98,
    }
