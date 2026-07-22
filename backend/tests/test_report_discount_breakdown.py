from types import SimpleNamespace

from app.modules.reports.services.calculations import (
    invoice_approved_discount,
    invoice_billing_discount,
    invoice_membership_benefit,
    invoice_offer_discount,
)


def test_report_discount_breakdown_uses_only_invoice_level_discounts() -> None:
    invoice = SimpleNamespace(
        approved_discount_amount=100,
        offer_discount_amount=25,
        membership_discount_amount=50,
        discount_amount=175,
        mrp_amount=600,
        selling_amount=500,
    )

    assert invoice_approved_discount(invoice) == 100
    assert invoice_offer_discount(invoice) == 25
    assert invoice_membership_benefit(invoice) == 50
    assert invoice_billing_discount(invoice) == 175


def test_report_discount_breakdown_does_not_infer_mrp_markdown() -> None:
    invoice = SimpleNamespace(
        approved_discount_amount=0,
        offer_discount_amount=0,
        membership_discount_amount=0,
        discount_amount=0,
        mrp_amount=600,
        selling_amount=500,
    )

    assert invoice_billing_discount(invoice) == 0
