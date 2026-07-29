from datetime import date, datetime

from sqlmodel import Session, select

from app.modules.billing.models import Invoice, InvoiceItem, InvoiceStatus
from app.modules.lab.models import LabTestPackage
from app.modules.reports.models import MonthlyRevenueSnapshot
from app.modules.reports.snapshots import (
    archive_due_months,
    archive_month,
    compute_dashboard_metrics,
    month_label,
    previous_calendar_month,
)
from app.modules.tenants.models import Tenant


def _invoice(tenant_id: str, **kwargs) -> Invoice:
    defaults = dict(
        tenant_id=tenant_id,
        branch_id="branch-1",
        patient_id="patient-1",
        invoice_number="INV-1",
        created_at=datetime(2026, 5, 10, 12, 0, 0),
        total_amount=1000,
        paid_amount=1000,
        balance_amount=0,
        doctor_share_amount=200,
        clinic_share_amount=800,
        status=InvoiceStatus.PAID,
    )
    defaults.update(kwargs)
    return Invoice(**defaults)


def _june_aggregate(session: Session) -> MonthlyRevenueSnapshot:
    return session.exec(
        select(MonthlyRevenueSnapshot).where(
            MonthlyRevenueSnapshot.period_year == 2026,
            MonthlyRevenueSnapshot.period_month == 6,
            MonthlyRevenueSnapshot.branch_id.is_(None),
        )
    ).first()


def test_compute_metrics_excludes_refunds_and_keeps_partial_net(test_engine):
    with Session(test_engine) as session:
        tenant = Tenant(name="Snapshot Clinic")
        session.add(tenant)
        session.commit()
        session.refresh(tenant)

        # Fully paid consultation invoice -> counts at full value.
        session.add(_invoice(tenant.id, invoice_number="INV-1"))
        # Fully refunded -> excluded entirely.
        session.add(
            _invoice(
                tenant.id,
                invoice_number="INV-2",
                paid_amount=0,
                balance_amount=0,
                status=InvoiceStatus.REFUNDED,
            )
        )
        # Cancelled -> excluded entirely.
        session.add(
            _invoice(
                tenant.id,
                invoice_number="INV-3",
                paid_amount=0,
                balance_amount=0,
                status=InvoiceStatus.CANCELLED,
            )
        )
        # Partially refunded -> kept at net paid (balance settled to 0 by backend).
        session.add(
            _invoice(
                tenant.id,
                invoice_number="INV-4",
                paid_amount=800,
                balance_amount=0,
                status=InvoiceStatus.PARTIALLY_REFUNDED,
            )
        )
        session.commit()

        metrics = compute_dashboard_metrics(
            session,
            tenant_id=tenant.id,
            branch_id=None,
            start=datetime(2026, 5, 1).date(),
            end=datetime(2026, 5, 31).date(),
        )

    totals = metrics["totals"]
    # INV-1 (1000) + INV-4 partial (800 paid, 1000 gross). Refund/cancel dropped.
    assert totals["invoices"] == 2
    assert totals["grossRevenue"] == 2000
    assert totals["paidRevenue"] == 1800
    assert totals["consultationRevenue"] == 1800
    assert totals["doctorFee"] == 200 + 160
    assert totals["settlement"] == 0
    assert metrics["finalProfit"] == 1800 - (200 + 160)


def test_service_revenue_uses_paid_share_of_lab_package_items(test_engine):
    with Session(test_engine) as session:
        tenant = Tenant(name="Service Revenue Clinic")
        session.add(tenant)
        session.commit()
        session.refresh(tenant)

        package = LabTestPackage(
            tenant_id=tenant.id,
            code="HEALTH-PACK",
            name="Health Package",
            package_price=600,
        )
        session.add(package)
        session.commit()
        session.refresh(package)

        invoice = _invoice(
            tenant.id,
            invoice_number="INV-SERVICE",
            lab_order_id="lab-order-service",
            subtotal_amount=1000,
            total_amount=800,
            paid_amount=800,
            doctor_share_amount=0,
            clinic_share_amount=800,
        )
        session.add(invoice)
        session.flush()
        session.add_all(
            [
                InvoiceItem(
                    tenant_id=tenant.id,
                    invoice_id=invoice.id,
                    item_type="lab",
                    description="Health Package",
                    quantity=1,
                    unit_amount=600,
                    total_amount=600,
                    external_item_code=package.id,
                ),
                InvoiceItem(
                    tenant_id=tenant.id,
                    invoice_id=invoice.id,
                    item_type="lab",
                    description="Blood Test",
                    quantity=1,
                    unit_amount=400,
                    total_amount=400,
                    external_item_code="lab-test-1",
                ),
            ]
        )
        session.commit()

        metrics = compute_dashboard_metrics(
            session,
            tenant_id=tenant.id,
            branch_id=None,
            start=date(2026, 5, 1),
            end=date(2026, 5, 31),
        )

    assert metrics["totals"]["serviceRevenue"] == 480


def test_free_membership_consultation_keeps_doctor_cost_and_reports_loss(
    test_engine,
):
    with Session(test_engine) as session:
        tenant = Tenant(name="Membership Report Clinic")
        session.add(tenant)
        session.commit()
        session.refresh(tenant)

        # A regular paid consultation contributes revenue, settlement and profit.
        session.add(
            _invoice(
                tenant.id,
                invoice_number="INV-REGULAR",
                subtotal_amount=600,
                total_amount=600,
                paid_amount=600,
                doctor_share_amount=360,
                clinic_share_amount=240,
            )
        )
        # A fully covered consultation creates no patient revenue, but the
        # contractual doctor cost is still incurred.
        session.add(
            _invoice(
                tenant.id,
                invoice_number="INV-MEMBER",
                subtotal_amount=600,
                discount_amount=600,
                membership_discount_amount=600,
                total_amount=0,
                paid_amount=0,
                balance_amount=0,
                doctor_share_amount=360,
                clinic_share_amount=0,
            )
        )
        session.commit()

        metrics = compute_dashboard_metrics(
            session,
            tenant_id=tenant.id,
            branch_id=None,
            start=date(2026, 5, 1),
            end=date(2026, 5, 31),
        )

    totals = metrics["totals"]
    assert totals["invoices"] == 2
    assert totals["grossRevenue"] == 1200
    assert totals["paidRevenue"] == 600
    assert totals["membershipDiscount"] == 600
    assert totals["membershipClaims"] == [
        {
            "type": "consultation",
            "label": "Consultation",
            "invoices": 1,
            "claimedAmount": 600,
        }
    ]
    assert totals["doctorFee"] == 720
    assert totals["settlement"] == 0
    assert metrics["grossProfit"] == -120
    assert metrics["finalProfit"] == -120


def test_free_membership_lab_keeps_supplier_cost_and_reports_loss(test_engine):
    with Session(test_engine) as session:
        tenant = Tenant(name="Free Membership Lab")
        session.add(tenant)
        session.commit()
        session.refresh(tenant)

        lab = _invoice(
            tenant.id,
            invoice_number="INV-FREE-LAB",
            lab_order_id="lab-order-free",
            subtotal_amount=500,
            discount_amount=500,
            membership_discount_amount=500,
            total_amount=0,
            paid_amount=0,
            balance_amount=0,
            doctor_share_amount=0,
            clinic_share_amount=0,
        )
        session.add(lab)
        session.commit()
        session.refresh(lab)
        session.add(
            InvoiceItem(
                tenant_id=tenant.id,
                invoice_id=lab.id,
                item_type="lab_test",
                description="Free outsourced test",
                quantity=1,
                unit_amount=500,
                total_amount=500,
                buying_amount=200,
            )
        )
        session.commit()

        metrics = compute_dashboard_metrics(
            session,
            tenant_id=tenant.id,
            branch_id=None,
            start=date(2026, 5, 1),
            end=date(2026, 5, 31),
        )

    assert metrics["totals"]["grossRevenue"] == 500
    assert metrics["totals"]["paidRevenue"] == 0
    assert metrics["totals"]["membershipDiscount"] == 500
    assert metrics["totals"]["settlement"] == 200
    assert metrics["labSettlement"] == {
        "revenue": 0,
        "purchaseCost": 200,
        "profit": -200,
    }
    assert metrics["grossProfit"] == -200
    assert metrics["finalProfit"] == -200


def test_profit_separates_consultation_doctor_fee_from_supplier_settlement(
    test_engine,
):
    with Session(test_engine) as session:
        tenant = Tenant(name="Mixed Cost Report Clinic")
        session.add(tenant)
        session.commit()
        session.refresh(tenant)

        consultation = _invoice(
            tenant.id,
            invoice_number="INV-CONSULT",
            total_amount=1000,
            paid_amount=1000,
            doctor_share_amount=600,
            clinic_share_amount=400,
        )
        lab = _invoice(
            tenant.id,
            invoice_number="INV-LAB",
            lab_order_id="lab-order-1",
            total_amount=500,
            paid_amount=500,
            doctor_share_amount=0,
            clinic_share_amount=500,
        )
        session.add(consultation)
        session.add(lab)
        session.commit()
        session.refresh(lab)
        session.add(
            InvoiceItem(
                tenant_id=tenant.id,
                invoice_id=lab.id,
                item_type="lab_test",
                description="External lab test",
                quantity=1,
                unit_amount=500,
                total_amount=500,
                buying_amount=200,
            )
        )
        session.commit()

        metrics = compute_dashboard_metrics(
            session,
            tenant_id=tenant.id,
            branch_id=None,
            start=date(2026, 5, 1),
            end=date(2026, 5, 31),
        )

    assert metrics["totals"]["doctorFee"] == 600
    assert metrics["totals"]["settlement"] == 200
    assert metrics["finalProfit"] == 700


def test_report_preserves_supplier_loss_instead_of_hiding_it(test_engine):
    with Session(test_engine) as session:
        tenant = Tenant(name="Loss Report Clinic")
        session.add(tenant)
        session.commit()
        session.refresh(tenant)

        lab = _invoice(
            tenant.id,
            invoice_number="INV-LOSS",
            lab_order_id="lab-order-loss",
            total_amount=1000,
            paid_amount=1000,
            doctor_share_amount=0,
            clinic_share_amount=1000,
        )
        session.add(lab)
        session.commit()
        session.refresh(lab)
        session.add(
            InvoiceItem(
                tenant_id=tenant.id,
                invoice_id=lab.id,
                item_type="lab_test",
                description="Loss-making lab test",
                quantity=1,
                unit_amount=1000,
                total_amount=1000,
                buying_amount=1200,
            )
        )
        session.commit()

        metrics = compute_dashboard_metrics(
            session,
            tenant_id=tenant.id,
            branch_id=None,
            start=date(2026, 5, 1),
            end=date(2026, 5, 31),
        )

    assert metrics["totals"]["settlement"] == 1200
    assert metrics["finalProfit"] == -200


def test_report_excludes_collected_gst_from_profit(test_engine):
    with Session(test_engine) as session:
        tenant = Tenant(name="GST Profit Clinic")
        session.add(tenant)
        session.commit()
        session.refresh(tenant)
        session.add(
            _invoice(
                tenant.id,
                invoice_number="INV-GST",
                total_amount=1180,
                paid_amount=590,
                tax_amount=180,
                doctor_share_amount=200,
                clinic_share_amount=980,
            )
        )
        session.commit()

        metrics = compute_dashboard_metrics(
            session,
            tenant_id=tenant.id,
            branch_id=None,
            start=date(2026, 5, 1),
            end=date(2026, 5, 31),
        )

    # Half the invoice was collected, so ₹90 of the ₹180 GST is a liability.
    # Paid-basis doctor fee is ₹100, leaving ₹400 realized clinic profit.
    assert metrics["totals"]["paidTax"] == 90
    assert metrics["finalProfit"] == 400


def test_membership_benefit_invoice_is_not_counted_as_a_plan_purchase(test_engine):
    with Session(test_engine) as session:
        tenant = Tenant(name="Membership Source Report Clinic")
        session.add(tenant)
        session.commit()
        session.refresh(tenant)

        session.add(
            _invoice(
                tenant.id,
                invoice_number="INV-PLAN-PURCHASE",
                patient_subscription_enrollment_id="enrollment-1",
                patient_subscription_plan_id="plan-1",
                subtotal_amount=599,
                total_amount=599,
                paid_amount=599,
                clinic_share_amount=599,
                doctor_share_amount=0,
            )
        )
        session.add(
            _invoice(
                tenant.id,
                invoice_number="INV-COVERED-CONSULTATION",
                appointment_id="appointment-1",
                consultation_id="consultation-1",
                patient_subscription_enrollment_id="enrollment-1",
                patient_subscription_plan_id="plan-1",
                subtotal_amount=600,
                discount_amount=600,
                membership_discount_amount=600,
                total_amount=0,
                paid_amount=0,
                clinic_share_amount=0,
                doctor_share_amount=0,
            )
        )
        session.commit()

        metrics = compute_dashboard_metrics(
            session,
            tenant_id=tenant.id,
            branch_id=None,
            start=date(2026, 5, 1),
            end=date(2026, 5, 31),
        )

    totals = metrics["totals"]
    assert totals["membershipPurchases"] == 1
    assert totals["membershipEnrollCount"] == 1
    assert totals["membershipEnrollAmount"] == 599
    assert totals["membershipClaims"] == [
        {
            "type": "consultation",
            "label": "Consultation",
            "invoices": 1,
            "claimedAmount": 600,
        }
    ]


def test_archive_month_freezes_and_is_idempotent(test_engine):
    with Session(test_engine) as session:
        tenant = Tenant(name="Archive Clinic")
        session.add(tenant)
        session.commit()
        session.refresh(tenant)
        session.add(_invoice(tenant.id))
        session.commit()

        first = archive_month(session, tenant_id=tenant.id, year=2026, month=5)
        # One per-branch snapshot + the all-branches aggregate.
        assert {snap.branch_id for snap in first} == {None, "branch-1"}
        aggregate = next(snap for snap in first if snap.branch_id is None)
        assert aggregate.period_label == month_label(2026, 5)
        assert aggregate.paid_revenue == 1000
        assert aggregate.metrics_json["totals"]["paidRevenue"] == 1000

        # Re-running keeps the frozen rows (no duplicates).
        archive_month(session, tenant_id=tenant.id, year=2026, month=5)
        rows = session.exec(MonthlyRevenueSnapshot.__table__.select()).all()
        assert len(rows) == 2


def test_archive_month_overwrite_recomputes_stale_snapshot(test_engine):
    with Session(test_engine) as session:
        tenant = Tenant(name="Overwrite Clinic")
        session.add(tenant)
        session.commit()
        session.refresh(tenant)
        session.add(_invoice(tenant.id, invoice_number="INV-1"))
        session.commit()

        first = archive_month(session, tenant_id=tenant.id, year=2026, month=5)
        aggregate = next(snap for snap in first if snap.branch_id is None)
        assert aggregate.paid_revenue == 1000

        session.add(_invoice(tenant.id, invoice_number="INV-2", paid_amount=500))
        session.commit()

        stale = archive_month(session, tenant_id=tenant.id, year=2026, month=5)
        stale_aggregate = next(snap for snap in stale if snap.branch_id is None)
        assert stale_aggregate.paid_revenue == 1000

        refreshed = archive_month(
            session, tenant_id=tenant.id, year=2026, month=5, overwrite=True
        )
        refreshed_aggregate = next(snap for snap in refreshed if snap.branch_id is None)
        assert refreshed_aggregate.paid_revenue == 1500
        assert refreshed_aggregate.invoice_count == 2


def test_previous_calendar_month_rolls_over_january():
    assert previous_calendar_month(datetime(2026, 1, 15).date()) == (2025, 12)
    assert previous_calendar_month(datetime(2026, 6, 30).date()) == (2026, 5)


def test_archive_due_months_skips_already_archived_past_grace(test_engine):
    with Session(test_engine) as session:
        tenant = Tenant(name="Due Clinic")
        session.add(tenant)
        session.commit()
        session.refresh(tenant)
        # Well past the grace window: first pass archives June, second is a no-op.
        past_grace = date(2026, 7, 20)
        archive_due_months(session, today=past_grace)
        count = archive_due_months(session, today=past_grace)
        assert count == 0


def test_archive_due_months_refreshes_late_payment_within_grace(test_engine):
    """An invoice generated last month but paid a day into the new month must be
    picked up while still inside the grace window, then frozen afterwards."""

    with Session(test_engine) as session:
        tenant = Tenant(name="Grace Clinic")
        session.add(tenant)
        session.commit()
        session.refresh(tenant)
        # Generated in June, still unpaid at the July 1 rollover.
        session.add(
            _invoice(
                tenant.id,
                invoice_number="INV-JUN-1",
                created_at=datetime(2026, 6, 5, 12, 0, 0),
                paid_amount=0,
                balance_amount=1000,
                status=InvoiceStatus.ISSUED,
            )
        )
        session.commit()

        within_grace = date(2026, 7, 2)
        archive_due_months(session, today=within_grace)
        aggregate = _june_aggregate(session)
        # Unpaid at freeze -> not yet counted.
        assert aggregate.invoice_count == 0
        assert aggregate.paid_revenue == 0

        # Paid on July 2 (a June invoice paid in the new month). Still in grace.
        invoice = session.exec(
            select(Invoice).where(Invoice.invoice_number == "INV-JUN-1")
        ).first()
        invoice.paid_amount = 1000
        invoice.balance_amount = 0
        invoice.status = InvoiceStatus.PAID
        session.add(invoice)
        session.commit()

        archive_due_months(session, today=within_grace)
        session.expire_all()
        aggregate = _june_aggregate(session)
        assert aggregate.invoice_count == 1
        assert aggregate.paid_revenue == 1000

        # Past the grace window the month is final: later changes do not apply.
        session.add(
            _invoice(
                tenant.id,
                invoice_number="INV-JUN-2",
                created_at=datetime(2026, 6, 28, 12, 0, 0),
            )
        )
        session.commit()
        archive_due_months(session, today=date(2026, 7, 10))
        session.expire_all()
        aggregate = _june_aggregate(session)
        assert aggregate.invoice_count == 1
        assert aggregate.paid_revenue == 1000
