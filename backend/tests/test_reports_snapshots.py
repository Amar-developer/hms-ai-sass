from datetime import datetime

from sqlmodel import Session

from app.modules.billing.models import Invoice, InvoiceStatus
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
    assert metrics["finalProfit"] == 1800 - (200 + 160)  # settlement scaled by paid


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


def test_previous_calendar_month_rolls_over_january():
    assert previous_calendar_month(datetime(2026, 1, 15).date()) == (2025, 12)
    assert previous_calendar_month(datetime(2026, 6, 30).date()) == (2026, 5)


def test_archive_due_months_skips_already_archived(test_engine):
    with Session(test_engine) as session:
        tenant = Tenant(name="Due Clinic")
        session.add(tenant)
        session.commit()
        session.refresh(tenant)
        # First pass archives the previous calendar month; second is a no-op.
        archive_due_months(session)
        count = archive_due_months(session)
        assert count == 0
