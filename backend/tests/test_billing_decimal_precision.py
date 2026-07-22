from decimal import Decimal

from app.modules.billing.models import DiscountOffer, DiscountType
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
