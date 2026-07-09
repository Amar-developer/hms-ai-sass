from datetime import date

from fastapi import Response
from sqlmodel import Session

from app.modules.identity.models import User
from app.modules.subscriptions.models import (
    SubscriptionInvoiceStatus,
    SubscriptionStatus,
)
from app.modules.subscriptions.repositories import (
    SubscriptionInvoiceRepository,
    SubscriptionRevenueRepository,
    TenantSubscriptionRepository,
)
from app.modules.subscriptions.schemas import (
    SubscriptionRevenueReport,
    SubscriptionRevenueSummary,
)
from app.modules.subscriptions.services.documents import _simple_pdf


def _subscription_report_rows(
    session: Session,
    *,
    current_user: User,
    tenant_id: str | None,
    from_date: date | None,
    to_date: date | None,
    status_filter: SubscriptionInvoiceStatus | None,
    q: str | None,
) -> list[dict]:
    rows = SubscriptionRevenueRepository(session).report_rows(
        current_user_tenant_id=current_user.tenant_id,
        is_super_admin=current_user.is_super_admin,
        tenant_id=tenant_id,
        from_date=from_date,
        to_date=to_date,
        status_filter=status_filter,
        q=q,
    )
    return [
        {
            "invoice_id": invoice.id,
            "invoice_number": invoice.invoice_number,
            "tenant_id": invoice.tenant_id,
            "tenant_name": tenant.name,
            "plan_id": plan.id if plan else None,
            "plan_name": plan.name if plan else "Credits/Manual",
            "description": invoice.description,
            "status": invoice.status.value,
            "issued_on": invoice.issued_on.isoformat(),
            "due_on": invoice.due_on.isoformat() if invoice.due_on else None,
            "paid_on": invoice.paid_on.isoformat() if invoice.paid_on else None,
            "taxable_amount": invoice.taxable_amount or invoice.amount,
            "tax_amount": invoice.tax_amount,
            "total_amount": invoice.total_amount or invoice.amount,
            "paid_amount": invoice.paid_amount,
            "balance_amount": invoice.balance_amount
            if invoice.total_amount
            else max(invoice.amount - invoice.paid_amount, 0),
            "payment_method": invoice.payment_method,
            "payment_reference": invoice.payment_reference,
            "gateway_status": invoice.gateway_status,
            "failed_reason": invoice.failed_reason,
        }
        for invoice, _subscription, plan, tenant in rows
    ]


def _export_rows(rows: list[dict], export: str) -> Response:
    headers = [
        "invoice_number",
        "tenant_name",
        "plan_name",
        "description",
        "status",
        "issued_on",
        "due_on",
        "paid_on",
        "taxable_amount",
        "tax_amount",
        "total_amount",
        "paid_amount",
        "balance_amount",
        "gateway_status",
    ]
    if export == "pdf":
        lines = ["MedizinHub HMS SaaS Revenue Report"] + [
            f"{row['invoice_number']} {row['tenant_name']} {row['status']} Rs.{row['total_amount']}"
            for row in rows[:28]
        ]
        return Response(content=_simple_pdf(lines), media_type="application/pdf")
    separator = "\t" if export == "xls" else ","
    content = separator.join(headers) + "\n"
    content += "\n".join(
        separator.join(str(row.get(header) or "") for header in headers) for row in rows
    )
    media_type = "application/vnd.ms-excel" if export == "xls" else "text/csv"
    extension = "xls" if export == "xls" else "csv"
    return Response(
        content=content,
        media_type=media_type,
        headers={
            "Content-Disposition": f'attachment; filename="saas-revenue-report.{extension}"'
        },
    )


def subscription_revenue_report(
    session: Session,
    *,
    current_user: User,
    tenant_id: str | None,
    from_date: date | None,
    to_date: date | None,
    status_filter: SubscriptionInvoiceStatus | None,
    q: str | None,
    page: int,
    page_size: int,
    export: str | None,
) -> SubscriptionRevenueReport | Response:
    rows = _subscription_report_rows(
        session,
        current_user=current_user,
        tenant_id=tenant_id,
        from_date=from_date,
        to_date=to_date,
        status_filter=status_filter,
        q=q,
    )
    if export:
        return _export_rows(rows, export)
    start = (page - 1) * page_size
    page_rows = rows[start : start + page_size]
    active_subscriptions = list(
        SubscriptionRevenueRepository(session).active_subscription_plan_rows()
    )
    if not current_user.is_super_admin:
        active_subscriptions = [
            row
            for row in active_subscriptions
            if row[0].tenant_id == current_user.tenant_id
        ]
    mrr_by_plan: dict[str, dict] = {}
    for subscription, plan in active_subscriptions:
        bucket = mrr_by_plan.setdefault(
            plan.id,
            {"plan_id": plan.id, "plan_name": plan.name, "tenant_count": 0, "mrr": 0},
        )
        bucket["tenant_count"] += 1
        bucket["mrr"] += subscription.billing_amount
    return SubscriptionRevenueReport(
        rows=page_rows,
        total_invoice_amount=sum(row["total_amount"] for row in rows),
        total_paid_amount=sum(row["paid_amount"] for row in rows),
        total_pending_amount=sum(
            row["balance_amount"]
            for row in rows
            if row["status"] != SubscriptionInvoiceStatus.CANCELLED.value
        ),
        total_tax_amount=sum(row["tax_amount"] for row in rows),
        total_failed_amount=sum(
            row["total_amount"] for row in rows if row["gateway_status"] == "failed"
        ),
        mrr_by_plan=list(mrr_by_plan.values()),
        page=page,
        page_size=page_size,
        total_rows=len(rows),
    )


def get_platform_revenue_summary(session: Session) -> SubscriptionRevenueSummary:
    subscriptions = TenantSubscriptionRepository(session).list_all()
    invoices = SubscriptionInvoiceRepository(session).list_all()
    active_subscriptions = [
        row for row in subscriptions if row.status == SubscriptionStatus.ACTIVE
    ]
    scheduled_subscriptions = [
        row for row in subscriptions if row.status == SubscriptionStatus.SCHEDULED
    ]
    today = date.today()
    expiring = [
        row
        for row in active_subscriptions
        if row.ends_on and 0 <= (row.ends_on - today).days <= 7
    ]
    return SubscriptionRevenueSummary(
        total_active_subscriptions=len(active_subscriptions),
        scheduled_subscriptions=len(scheduled_subscriptions),
        expiring_in_7_days=len(expiring),
        estimated_monthly_recurring_revenue=sum(
            row.billing_amount for row in active_subscriptions
        ),
        issued_invoice_amount=sum(
            (row.total_amount or row.amount)
            for row in invoices
            if row.status != SubscriptionInvoiceStatus.CANCELLED
        ),
        paid_invoice_amount=sum(
            row.paid_amount
            or (row.amount if row.status == SubscriptionInvoiceStatus.PAID else 0)
            for row in invoices
        ),
        pending_invoice_amount=sum(
            (row.balance_amount if row.total_amount else row.amount)
            for row in invoices
            if row.status == SubscriptionInvoiceStatus.ISSUED
        ),
        credit_revenue_amount=sum(
            (row.total_amount or row.amount) for row in invoices if row.credit_id
        ),
        failed_invoice_amount=sum(
            (row.total_amount or row.amount)
            for row in invoices
            if row.gateway_status == "failed"
        ),
    )
