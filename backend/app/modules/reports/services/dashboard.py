from datetime import date, timedelta

from fastapi import HTTPException, status
from sqlmodel import Session

from app.modules.reports.snapshots import (
    compute_dashboard_metrics,
    dashboard_metrics_from_totals,
    empty_dashboard_totals,
    merge_dashboard_totals,
)


def _validate_range(start: date, end: date, *, label: str) -> None:
    if end < start:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"{label} end date must be on or after its start date",
        )
    if (end - start).days > 1095:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"{label} cannot exceed 3 years",
        )


def _previous_range(start: date, end: date) -> tuple[date, date]:
    days = (end - start).days + 1
    previous_end = start - timedelta(days=1)
    return previous_end - timedelta(days=days - 1), previous_end


def _totals_between(daily_totals: dict[str, dict], start: date, end: date) -> dict:
    totals = empty_dashboard_totals()
    cursor = start
    while cursor <= end:
        day_totals = daily_totals.get(cursor.isoformat())
        if day_totals:
            merge_dashboard_totals(totals, day_totals)
        cursor += timedelta(days=1)
    return totals


def _trend_row(day: date, totals: dict) -> dict:
    summary = dashboard_metrics_from_totals(totals)["profitSummary"]
    gross_revenue = float(totals.get("grossRevenue", 0))
    paid_revenue = float(summary["paidRevenue"])
    return {
        "date": day.isoformat(),
        "label": day.strftime("%-d %b"),
        "dayCount": 1,
        "paidRevenue": paid_revenue,
        "paidTax": summary["paidTax"],
        "recognizedRevenue": summary["recognizedRevenue"],
        "grossRevenue": gross_revenue,
        "invoiceCount": totals.get("invoices", 0),
        "collectionRate": round(paid_revenue / gross_revenue * 100, 1)
        if gross_revenue
        else 0,
        "grossProfit": summary["grossProfit"],
        "incomeMargin": summary["incomeMargin"],
        "totalDeductions": summary["profitDeductions"],
        "monthlyExpenses": summary["monthlyExpenses"],
        "expenseRent": totals.get("expenseRent", 0),
        "expenseUtilities": totals.get("expenseUtilities", 0),
        "expenseSupplies": totals.get("expenseSupplies", 0),
        "expenseTravel": totals.get("expenseTravel", 0),
        "expenseMaintenance": totals.get("expenseMaintenance", 0),
        "expenseOther": totals.get("expenseOther", 0),
        "balance": totals.get("balance", 0),
        "consultation": totals.get("consultationRevenue", 0),
        "lab": totals.get("labRevenue", 0),
        "service": totals.get("serviceRevenue", 0),
        "pharmacy": totals.get("pharmacyRevenue", 0),
        "homeCare": totals.get("homeCareRevenue", 0),
        "homeVisit": totals.get("homeVisitRevenue", 0),
        "doctor": summary["doctorSettlement"],
        "supplier": summary["supplierSettlement"],
        "membership": summary["membershipDiscount"]
        + summary["membershipFreeItems"],
        "membershipDiscount": summary["membershipDiscount"],
        "membershipFreeItems": summary["membershipFreeItems"],
        "membershipEnrollCount": totals.get("membershipEnrollCount", 0),
        "membershipUsed": totals.get("membershipDiscount", 0),
        "requestDiscount": summary["manualDiscount"],
        "offerDiscount": summary["offerDiscount"],
        "homeCareStaff": summary["homeCareStaffSettlement"],
        "cash": totals.get("paymentModes", {}).get("cash", 0),
        "upi": totals.get("paymentModes", {}).get("upi", 0),
        "card": totals.get("paymentModes", {}).get("card", 0),
        "others": totals.get("paymentModes", {}).get("others", 0),
    }


def build_live_dashboard_metrics(
    session: Session,
    *,
    tenant_id: str,
    branch_id: str | None,
    start: date,
    end: date,
    series_start: date,
    series_end: date,
) -> dict:
    """Return the complete live Metrics Dashboard from one bounded data load.

    Totals, the preceding-period comparison, and every chart point are derived
    from the same daily backend accumulators. This keeps financial rules out of
    the browser and avoids fetching invoices once for every chart day.
    """

    _validate_range(start, end, label="Selected range")
    _validate_range(series_start, series_end, label="Chart range")
    previous_start, previous_end = _previous_range(start, end)
    load_start = min(previous_start, series_start, start)
    load_end = max(previous_end, series_end, end)
    _validate_range(load_start, load_end, label="Combined report range")

    loaded = compute_dashboard_metrics(
        session,
        tenant_id=tenant_id,
        branch_id=branch_id,
        start=load_start,
        end=load_end,
        include_daily_totals=True,
    )
    daily_totals = loaded["dailyTotals"]
    totals = _totals_between(daily_totals, start, end)
    previous_totals = _totals_between(
        daily_totals, previous_start, previous_end
    )
    selected = dashboard_metrics_from_totals(totals)
    previous = dashboard_metrics_from_totals(previous_totals)

    rows = []
    cursor = series_start
    visible_end = min(series_end, date.today())
    while cursor <= visible_end:
        rows.append(
            _trend_row(
                cursor,
                daily_totals.get(cursor.isoformat(), empty_dashboard_totals()),
            )
        )
        cursor += timedelta(days=1)

    return {
        "period_start": start.isoformat(),
        "period_end": end.isoformat(),
        "previous_period_start": previous_start.isoformat(),
        "previous_period_end": previous_end.isoformat(),
        "totals": totals,
        "previous_totals": previous_totals,
        "profit_summary": selected["profitSummary"],
        "previous_profit_summary": previous["profitSummary"],
        "gross_profit": selected["grossProfit"],
        "final_profit": selected["finalProfit"],
        "previous_final_profit": previous["finalProfit"],
        "lab_settlement_summary": selected["labSettlement"],
        "membership_claim_rows": totals.get("membershipClaims", []),
        "trend_rows": rows,
    }
