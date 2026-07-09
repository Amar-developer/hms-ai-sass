"""Month-end income dashboard snapshots.

These helpers freeze a finished month's income dashboard into
``MonthlyRevenueSnapshot`` rows. The computed ``metrics`` dict mirrors exactly
what the live dashboard renders in ``frontend/features/reports`` (the
``aggregateInvoiceMetrics`` totals plus the gross/final profit and lab
settlement summary), so a stored month can be re-opened in the same card
layout. Snapshots are frozen once written: a later refund of a closed month's
invoice affects the current month, never the archived period.
"""

from calendar import monthrange
from datetime import date, datetime

from sqlmodel import Session, select

from app.core.config import get_settings
from app.modules.billing.models import Invoice, InvoiceItem
from app.modules.home_care.models import HomeCareBooking
from app.modules.lab.models import LabOrderItem, LabTestCatalog
from app.modules.reports.models import MonthlyRevenueSnapshot
from app.modules.reports.services.calculations import (
    is_paid_invoice,
    settlement_paid_basis,
)
from app.modules.tenants.models import Tenant, now_utc


MONTH_NAMES = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
]

_HOME_VISIT_MARKERS = ("home_visit", "home visit", "hv_")


def month_range(year: int, month: int) -> tuple[date, date]:
    return date(year, month, 1), date(year, month, monthrange(year, month)[1])


def month_label(year: int, month: int) -> str:
    return f"{MONTH_NAMES[month - 1]} {year}"


def previous_calendar_month(today: date | None = None) -> tuple[int, int]:
    today = today or date.today()
    year = today.year
    month = today.month - 1
    if month == 0:
        year -= 1
        month = 12
    return year, month


def _invoice_type(invoice: Invoice) -> str:
    if invoice.pharmacy_issue_id:
        return "pharmacy"
    if invoice.lab_order_id:
        return "lab"
    if invoice.physiotherapy_case_id:
        return "physiotherapy"
    if invoice.home_care_booking_id:
        return "home_care"
    if invoice.ip_admission_id:
        return "ip"
    return "consultation"


def _type_label(value: str) -> str:
    return {
        "pharmacy": "Pharmacy",
        "lab": "Lab / Service",
        "physiotherapy": "Physiotherapy",
        "home_care": "Home Care / Visit",
        "ip": "IP Billing",
    }.get(value, "Consultation")


def compute_dashboard_metrics(
    session: Session,
    *,
    tenant_id: str,
    branch_id: str | None,
    start: date,
    end: date,
) -> dict:
    """Aggregate the income dashboard figures for one period and branch.

    ``branch_id`` of ``None`` aggregates across every branch, matching the
    dashboard's "all branches" view.
    """

    invoices = list(
        session.exec(
            select(Invoice)
            .where(
                Invoice.tenant_id == tenant_id,
                Invoice.created_at >= datetime.combine(start, datetime.min.time()),
                Invoice.created_at <= datetime.combine(end, datetime.max.time()),
            )
            .order_by(Invoice.created_at)
        ).all()
    )
    paid = [
        invoice
        for invoice in invoices
        if is_paid_invoice(invoice)
        and (branch_id is None or invoice.branch_id == branch_id)
    ]

    # Home visit vs home care split. A home_care invoice counts as a home visit
    # when its booking is typed as one, or its line items carry home-visit
    # markers (mirrors the dashboard's booking + item slug heuristics).
    home_care_invoices = [inv for inv in paid if inv.home_care_booking_id]
    home_visit_booking_ids: set[str] = set()
    if home_care_invoices:
        booking_ids = [
            inv.home_care_booking_id
            for inv in home_care_invoices
            if inv.home_care_booking_id
        ]
        for booking in session.exec(
            select(HomeCareBooking).where(
                HomeCareBooking.tenant_id == tenant_id,
                HomeCareBooking.id.in_(booking_ids),
            )
        ).all():
            if booking.booking_type == "home_visit":
                home_visit_booking_ids.add(booking.id)
    home_visit_invoice_ids: set[str] = set()
    if home_care_invoices:
        items = session.exec(
            select(InvoiceItem).where(
                InvoiceItem.tenant_id == tenant_id,
                InvoiceItem.invoice_id.in_([inv.id for inv in home_care_invoices]),
            )
        ).all()
        items_by_invoice: dict[str, list[InvoiceItem]] = {}
        for item in items:
            items_by_invoice.setdefault(item.invoice_id, []).append(item)
        for invoice in home_care_invoices:
            blob = " ".join(
                f"{item.external_slug or ''} {item.item_type or ''} {item.description or ''}"
                for item in items_by_invoice.get(invoice.id, [])
            ).lower()
            if any(marker in blob for marker in _HOME_VISIT_MARKERS):
                home_visit_invoice_ids.add(invoice.id)

    totals = {
        "invoices": 0,
        "grossRevenue": 0,
        "paidRevenue": 0,
        "balance": 0,
        "doctorFee": 0,
        "settlement": 0,
        "clinicFee": 0,
        "tax": 0,
        "membershipDiscount": 0,
        "membershipPurchases": 0,
        "membershipEnrollCount": 0,
        "membershipEnrollAmount": 0,
        "consultationRevenue": 0,
        "labRevenue": 0,
        "pharmacyRevenue": 0,
        "homeCareRevenue": 0,
        "homeVisitRevenue": 0,
    }
    membership_claims: dict[str, dict] = {}

    for invoice in paid:
        total = int(invoice.total_amount or 0)
        amount_paid = int(invoice.paid_amount or 0)
        balance = int(invoice.balance_amount or 0)
        doctor_share = int(invoice.doctor_share_amount or 0)
        settlement = settlement_paid_basis(invoice)
        totals["invoices"] += 1
        totals["grossRevenue"] += total
        totals["paidRevenue"] += amount_paid
        totals["balance"] += balance
        totals["doctorFee"] += doctor_share
        totals["settlement"] += settlement
        totals["clinicFee"] += int(invoice.clinic_share_amount or 0) or max(
            total - doctor_share, 0
        )
        totals["tax"] += int(invoice.tax_amount or 0)
        totals["membershipDiscount"] += int(invoice.membership_discount_amount or 0)

        has_subscription = bool(
            invoice.patient_subscription_enrollment_id
            or invoice.patient_subscription_plan_id
        )
        if has_subscription:
            totals["membershipPurchases"] += 1
        is_plan_purchase = has_subscription and not any(
            [
                invoice.lab_order_id,
                invoice.pharmacy_issue_id,
                invoice.consultation_id,
                invoice.ip_admission_id,
                invoice.physiotherapy_case_id,
                invoice.home_care_booking_id,
            ]
        )
        if is_plan_purchase:
            totals["membershipEnrollCount"] += 1
            totals["membershipEnrollAmount"] += amount_paid

        kind = _invoice_type(invoice)
        if kind == "lab":
            totals["labRevenue"] += amount_paid
        elif kind == "pharmacy":
            totals["pharmacyRevenue"] += amount_paid
        elif kind == "consultation":
            totals["consultationRevenue"] += amount_paid
        elif kind == "home_care":
            if (
                invoice.id in home_visit_invoice_ids
                or invoice.home_care_booking_id in home_visit_booking_ids
            ):
                totals["homeVisitRevenue"] += amount_paid
            else:
                totals["homeCareRevenue"] += amount_paid

        claim = int(invoice.membership_discount_amount or 0)
        if claim > 0:
            row = membership_claims.setdefault(
                kind,
                {
                    "type": kind,
                    "label": _type_label(kind),
                    "invoices": 0,
                    "claimedAmount": 0,
                },
            )
            row["invoices"] += 1
            row["claimedAmount"] += claim

    totals["membershipClaims"] = sorted(
        membership_claims.values(),
        key=lambda row: row["claimedAmount"],
        reverse=True,
    )

    gross_profit = max(totals["grossRevenue"] - totals["doctorFee"], 0)
    final_profit = max(totals["paidRevenue"] - totals["settlement"], 0)

    lab_purchase_cost = _lab_settlement_purchase_cost(
        session, tenant_id=tenant_id, invoices=paid
    )
    lab_settlement = {
        "revenue": totals["labRevenue"],
        "purchaseCost": lab_purchase_cost,
        "profit": max(totals["labRevenue"] - lab_purchase_cost, 0),
    }

    return {
        "totals": totals,
        "grossProfit": gross_profit,
        "finalProfit": final_profit,
        "labSettlement": lab_settlement,
    }


def _lab_settlement_purchase_cost(
    session: Session, *, tenant_id: str, invoices: list[Invoice]
) -> int:
    lab_order_ids = [inv.lab_order_id for inv in invoices if inv.lab_order_id]
    if not lab_order_ids:
        return 0
    items = list(
        session.exec(
            select(LabOrderItem).where(
                LabOrderItem.tenant_id == tenant_id,
                LabOrderItem.lab_order_id.in_(lab_order_ids),
            )
        ).all()
    )
    if not items:
        return 0
    catalog = {
        row.id: row
        for row in session.exec(
            select(LabTestCatalog).where(LabTestCatalog.tenant_id == tenant_id)
        ).all()
    }
    purchase_cost = 0
    for item in items:
        # Only mapped test lines contribute purchase cost; packages are skipped,
        # matching the dashboard's lab settlement calculation.
        if item.package_id or not item.test_id:
            continue
        catalog_item = catalog.get(item.test_id)
        supplier_id = item.supplier_id or (
            catalog_item.supplier_id if catalog_item else None
        )
        if not supplier_id:
            continue
        purchase_cost += int(
            item.buying_price
            or (catalog_item.purchase_price if catalog_item else 0)
            or 0
        )
    return purchase_cost


def branch_ids_for_period(
    session: Session, *, tenant_id: str, start: date, end: date
) -> list[str | None]:
    """Distinct branches with paid invoices in the period, plus the all-branches
    aggregate (``None``)."""

    invoices = session.exec(
        select(Invoice).where(
            Invoice.tenant_id == tenant_id,
            Invoice.created_at >= datetime.combine(start, datetime.min.time()),
            Invoice.created_at <= datetime.combine(end, datetime.max.time()),
        )
    ).all()
    branches = {
        invoice.branch_id
        for invoice in invoices
        if is_paid_invoice(invoice) and invoice.branch_id
    }
    return [None, *sorted(branches)]


def archive_month(
    session: Session,
    *,
    tenant_id: str,
    year: int,
    month: int,
    actor_user_id: str | None = None,
    overwrite: bool = False,
) -> list[MonthlyRevenueSnapshot]:
    """Freeze ``year``/``month`` into snapshots for each branch + the
    all-branches aggregate. Existing frozen snapshots are left untouched unless
    ``overwrite`` is set (used for explicit backfills)."""

    start, end = month_range(year, month)
    label = month_label(year, month)
    saved: list[MonthlyRevenueSnapshot] = []
    for branch_id in branch_ids_for_period(
        session, tenant_id=tenant_id, start=start, end=end
    ):
        existing = session.exec(
            select(MonthlyRevenueSnapshot).where(
                MonthlyRevenueSnapshot.tenant_id == tenant_id,
                MonthlyRevenueSnapshot.branch_id == branch_id,
                MonthlyRevenueSnapshot.period_year == year,
                MonthlyRevenueSnapshot.period_month == month,
            )
        ).first()
        if existing and not overwrite:
            saved.append(existing)
            continue
        metrics = compute_dashboard_metrics(
            session,
            tenant_id=tenant_id,
            branch_id=branch_id,
            start=start,
            end=end,
        )
        totals = metrics["totals"]
        snapshot = existing or MonthlyRevenueSnapshot(
            tenant_id=tenant_id,
            branch_id=branch_id,
            period_year=year,
            period_month=month,
        )
        snapshot.period_start = start.isoformat()
        snapshot.period_end = end.isoformat()
        snapshot.period_label = label
        snapshot.invoice_count = int(totals["invoices"])
        snapshot.gross_revenue = int(totals["grossRevenue"])
        snapshot.paid_revenue = int(totals["paidRevenue"])
        snapshot.final_profit = int(metrics["finalProfit"])
        snapshot.metrics_json = metrics
        snapshot.updated_at = now_utc()
        if actor_user_id:
            snapshot.created_by_user_id = actor_user_id
        session.add(snapshot)
        saved.append(snapshot)
    session.commit()
    for snapshot in saved:
        session.refresh(snapshot)
    return saved


def archive_due_months(session: Session, today: date | None = None) -> int:
    """Archive the just-finished calendar month for every tenant.

    Safe to call from the worker loop. A month is frozen once it ends, but for
    ``report_snapshot_grace_days`` days into the new month the snapshot is
    re-frozen on each run so late same-period entries (an invoice generated last
    month but paid a day into the new month, backdated invoices) are captured.
    Historically this only archived once at the exact rollover instant, which
    permanently missed any invoice created or paid afterwards. After the grace
    window the frozen figures are left untouched.
    """

    today = today or date.today()
    year, month = previous_calendar_month(today)
    _, period_end = month_range(year, month)
    within_grace = (
        today - period_end
    ).days <= get_settings().report_snapshot_grace_days
    tenants = session.exec(select(Tenant)).all()
    archived = 0
    for tenant in tenants:
        already = session.exec(
            select(MonthlyRevenueSnapshot).where(
                MonthlyRevenueSnapshot.tenant_id == tenant.id,
                MonthlyRevenueSnapshot.period_year == year,
                MonthlyRevenueSnapshot.period_month == month,
            )
        ).first()
        # Once frozen and past the grace window the month is final; skip it.
        if already and not within_grace:
            continue
        # Inside the grace window overwrite so the frozen figures stay complete.
        archive_month(
            session,
            tenant_id=tenant.id,
            year=year,
            month=month,
            overwrite=within_grace,
        )
        archived += 1
    return archived
