from sqlmodel import Session, select

from app.modules.billing.models import Invoice, InvoiceItem
from app.modules.billing.services.line_discounts import (
    allocate_amount,
    sync_invoice_item_discounts,
)
from app.modules.reports.services.calculations import allocate_values
from app.modules.tenants.models import Tenant


def test_allocate_values_reconciles_every_rupee():
    allocated = allocate_values([1, 1, 1], 3, 100)

    assert allocated == [34, 33, 33]
    assert sum(allocated) == 100


def test_allocate_values_preserves_unmapped_subtotal_share():
    allocated = allocate_values([40, 40], 100, 90)

    assert sum(allocated) == 72


def test_invoice_line_allocation_reconciles_small_rupee_remainder():
    allocated = allocate_amount([1, 1, 1], 100)

    assert allocated == [1, 1, 1]
    assert sum(allocated) == 3


def test_invoice_line_allocation_never_exceeds_item_value():
    allocated = allocate_amount([40, 60], 150)

    assert allocated == [40, 60]
    assert sum(allocated) == 100


def test_mixed_membership_discount_is_stored_on_the_correct_lines(test_engine):
    with Session(test_engine) as session:
        tenant = Tenant(name="Mixed Benefit Clinic")
        session.add(tenant)
        session.commit()
        session.refresh(tenant)
        invoice = Invoice(
            tenant_id=tenant.id,
            branch_id="branch-mixed",
            patient_id="patient-mixed",
            invoice_number="INV-MIXED",
            subtotal_amount=1700,
            discount_amount=550,
            membership_discount_amount=550,
            taxable_amount=1150,
            total_amount=1150,
            balance_amount=1150,
        )
        session.add(invoice)
        session.commit()
        session.refresh(invoice)
        session.add_all(
            [
                InvoiceItem(
                    tenant_id=tenant.id,
                    invoice_id=invoice.id,
                    item_type="lab",
                    description="Free test",
                    quantity=1,
                    unit_amount=500,
                    total_amount=500,
                    external_item_code="LAB_FREE",
                ),
                InvoiceItem(
                    tenant_id=tenant.id,
                    invoice_id=invoice.id,
                    item_type="lab",
                    description="5 percent test",
                    quantity=1,
                    unit_amount=1000,
                    total_amount=1000,
                    external_item_code="LAB_DISCOUNTED",
                ),
                InvoiceItem(
                    tenant_id=tenant.id,
                    invoice_id=invoice.id,
                    item_type="lab",
                    description="Regular test",
                    quantity=1,
                    unit_amount=200,
                    total_amount=200,
                    external_item_code="LAB_REGULAR",
                ),
            ]
        )
        session.flush()

        sync_invoice_item_discounts(
            session,
            invoice,
            free_item_ids=["LAB_FREE"],
            discounted_item_ids=["LAB_DISCOUNTED"],
        )
        session.commit()
        items = list(
            session.exec(
                select(InvoiceItem)
                .where(InvoiceItem.invoice_id == invoice.id)
                .order_by(InvoiceItem.unit_amount)
            ).all()
        )

    assert [item.discount_amount for item in items] == [0, 500, 50]
    assert sum(int(item.discount_amount or 0) for item in items) == 550
