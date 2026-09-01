from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime
from decimal import Decimal
from typing import Any

from sqlmodel import Session

from app.modules.billing.models import Invoice
from app.modules.billing.repositories.settlement_report_repository import (
    BillingSettlementReportRepository,
)
from app.modules.billing.services.read_models import invoice_read
from app.modules.reports.repositories import ReportDataRepository
from app.modules.reports.services.calculations import (
    invoice_billing_discount,
    invoice_due_balance,
    invoice_item_total,
    invoice_membership_benefit,
    is_paid_invoice,
    report_doctor_fee,
    report_settlement,
    tax_paid_basis,
)
from app.modules.reports.services.classification import ReportInvoiceClassifier
from app.modules.reports.services.xlsx import (
    Worksheet,
    XlsxWorkbook,
    cell_reference,
    formula,
    styled,
)


def _amount(value: Any) -> float:
    return float(Decimal(str(value or 0)))


def _sheet(
    name: str,
    title: str,
    subtitle: str,
    headers: list[str],
    data: list[list[Any]],
    widths: list[float],
    money: set[int] = frozenset(),
    percent: set[int] = frozenset(),
) -> Worksheet:
    rows: list[list[Any]] = [
        [styled(title, "title")],
        [styled(subtitle, "subtitle")],
        [],
        [styled(value, "header") for value in headers],
    ]
    for values in data:
        rendered = []
        for index, value in enumerate(values, 1):
            style = (
                "percent"
                if index in percent
                else "currency"
                if index in money
                else "date"
                if isinstance(value, date)
                else "text"
            )
            rendered.append(styled(value, style))
        rows.append(rendered)
    total_row = len(rows) + 1
    total: list[Any] = [styled("TOTAL", "total_text")]
    for column in range(2, len(headers) + 1):
        values = [
            row[column - 1]
            for row in data
            if len(row) >= column and isinstance(row[column - 1], (int, float))
        ]
        if column in percent:
            total.append(None)
        elif values:
            style = "total_currency" if column in money else "total_integer"
            total.append(
                formula(
                    f"SUM({cell_reference(5, column)}:{cell_reference(total_row - 1, column)})",
                    sum(values),
                    style,
                )
            )
        elif column in money or headers[column - 1] in {
            "Invoices",
            "Invoice lines",
            "Units",
        }:
            style = "total_currency" if column in money else "total_integer"
            total.append(styled(0, style))
        else:
            total.append(None)
    rows.append(total)
    last_column = cell_reference(1, len(headers))[:-1]
    return Worksheet(
        name=name,
        rows=rows,
        widths=widths,
        merges=[f"A1:{last_column}1", f"A2:{last_column}2"],
        freeze_row=5,
        auto_filter=f"A4:{last_column}{max(total_row - 1, 4)}",
    )


def build_monthly_revenue_report(
    session: Session,
    *,
    tenant_id: str,
    start: date,
    end: date,
    filters: dict | None = None,
) -> tuple[str, bytes]:
    filters = filters or {}
    repo = ReportDataRepository(session)
    settlement_repo = BillingSettlementReportRepository(session)
    tenant = repo.get_tenant(tenant_id)
    subtitle = f"{tenant.name if tenant else tenant_id} · {start.isoformat()} to {end.isoformat()}"
    invoices = repo.list_invoices_for_period(
        tenant_id=tenant_id,
        start_at=datetime.combine(start, datetime.min.time()),
        end_at=datetime.combine(end, datetime.max.time()),
    )
    paid = [row for row in invoices if is_paid_invoice(row)]
    invoice_by_id = {row.id: row for row in invoices}
    reads = {row.id: invoice_read(session, row) for row in paid}
    items: dict[str, list[Any]] = {row.id: [] for row in paid}
    for item in repo.list_invoice_items_by_invoice_ids(
        tenant_id=tenant_id, invoice_ids=list(items)
    ):
        items.setdefault(item.invoice_id, []).append(item)
    classifier = ReportInvoiceClassifier(items)
    appointments = {
        row.id: row
        for row in repo.list_appointments_by_ids(
            tenant_id=tenant_id,
            appointment_ids=[row.appointment_id for row in paid if row.appointment_id],
        )
    }
    doctors = {row.id: row for row in repo.list_practitioners(tenant_id=tenant_id)}
    departments = {row.id: row for row in repo.list_departments(tenant_id=tenant_id)}
    patients = {
        row.id: row
        for row in repo.list_patients_by_ids(
            tenant_id=tenant_id, patient_ids=[row.patient_id for row in paid]
        )
    }
    suppliers = {
        row.id: row for row in repo.list_pharmacy_suppliers(tenant_id=tenant_id)
    }
    modes_by_invoice: dict[str, set[str]] = defaultdict(set)
    for payment in repo.list_recorded_payments_by_invoice_ids(
        tenant_id=tenant_id, invoice_ids=[row.id for row in paid]
    ):
        method = getattr(payment.method, "value", payment.method)
        modes_by_invoice[payment.invoice_id].add(str(method).replace("_", " ").title())

    def doctor_fee(invoice: Invoice) -> float:
        return float(report_doctor_fee(invoice, classifier.classify(invoice)))

    def vendor_cost(invoice: Invoice) -> float:
        return float(
            report_settlement(
                invoice, classifier.classify(invoice), items.get(invoice.id, [])
            )
        )

    def payment_modes(invoice: Invoice) -> str:
        values = set(modes_by_invoice.get(invoice.id, set()))
        if invoice_membership_benefit(invoice):
            values.add("Membership Benefit")
        return " + ".join(sorted(values)) or "-"

    metrics = {
        "invoices": len(paid),
        "gross": sum(invoice_item_total(row) for row in paid),
        "discount": sum(invoice_billing_discount(reads[row.id]) for row in paid),
        "net": sum(_amount(row.total_amount) for row in paid),
        "paid": sum(_amount(row.paid_amount) for row in paid),
        "balance": sum(invoice_due_balance(row) for row in paid),
        "tax": sum(tax_paid_basis(row) for row in paid),
        "doctor": sum(doctor_fee(row) for row in paid),
        "vendor": sum(vendor_cost(row) for row in paid),
    }
    metrics["profit"] = (
        metrics["paid"] - metrics["tax"] - metrics["doctor"] - metrics["vendor"]
    )
    collections = settlement_repo.list_collected_payments(
        tenant_id=tenant_id, branch_id=None, from_date=start, to_date=end
    )
    cash_collected = sum(
        _amount(row.amount) - _amount(row.refunded_amount) for row in collections
    )
    doctor_settlements = settlement_repo.list_doctor_settlements_for_period(
        tenant_id=tenant_id, start=start, end=end
    )
    vendor_settlements = settlement_repo.list_vendor_settlements_for_period(
        tenant_id=tenant_id, start=start, end=end
    )
    doctor_paid = sum(_amount(row.settlement_amount) for row in doctor_settlements)
    vendor_paid = sum(_amount(row.settlement_amount) for row in vendor_settlements)
    workbook = XlsxWorkbook()

    if filters.get("overall", True):
        summary = [
            [
                "Reporting period",
                f"{start.isoformat()} to {end.isoformat()}",
                "Three date bases are reported separately",
            ],
            ["Paid invoices", metrics["invoices"], "Invoice-date basis"],
            ["Gross item value", metrics["gross"], "Before discounts"],
            [
                "Billing discounts",
                metrics["discount"],
                "All invoice discounts and benefits",
            ],
            ["Net invoice revenue", metrics["net"], "Invoice-date basis"],
            [
                "Paid revenue",
                metrics["paid"],
                "Payments applied to invoices raised in period",
            ],
            ["Cash collected", cash_collected, "Payment collected-date basis"],
            ["GST from paid revenue", metrics["tax"], "Pro-rated paid basis"],
            ["Doctor fee accrued", metrics["doctor"], "Invoice-date basis"],
            ["Doctor settlements paid", doctor_paid, "Settlement finalized-date basis"],
            [
                "Vendor cost accrued",
                metrics["vendor"],
                "Supplier cost on invoice items",
            ],
            ["Vendor settlements paid", vendor_paid, "Settlement finalized-date basis"],
            [
                "Clinic profit",
                metrics["profit"],
                "Paid revenue − GST − doctor fee − vendor cost",
            ],
        ]
        rows = [
            [styled("Monthly Revenue & Settlement Report", "title")],
            [styled(subtitle, "subtitle")],
            [],
            [styled("Executive Summary", "section")],
            [
                styled(value, "header")
                for value in ["Metric", "Value", "Basis / definition"]
            ],
        ]
        for index, row in enumerate(summary):
            rows.append(
                [
                    row[0],
                    styled(row[1], "integer" if index == 1 else "currency"),
                    row[2],
                ]
            )
        workbook.add_sheet(
            Worksheet(
                name="Executive Summary",
                rows=rows,
                widths=[31, 21, 58],
                merges=["A1:C1", "A2:C2", "A4:C4"],
                freeze_row=6,
                landscape=False,
            )
        )

    grouped: dict[str, dict[str, dict[str, Any]]] = {"doctor": {}, "department": {}}
    invoice_rows, vendor_buckets = [], {}
    include_patient = bool(filters.get("include_patient_details", False))
    for invoice in paid:
        appointment = appointments.get(invoice.appointment_id or "")
        doctor_id = appointment.practitioner_id if appointment else None
        department_id = appointment.department_id if appointment else None
        doctor_name = (
            doctors[doctor_id].full_name if doctor_id in doctors else "Unassigned"
        )
        department_name = (
            departments[department_id].name
            if department_id in departments
            else "Unassigned"
        )
        values = {
            "count": 1,
            "gross": float(invoice_item_total(invoice)),
            "discount": float(invoice_billing_discount(reads[invoice.id])),
            "net": _amount(invoice.total_amount),
            "paid": _amount(invoice.paid_amount),
            "balance": float(invoice_due_balance(invoice)),
            "tax": float(tax_paid_basis(invoice)),
            "doctor": doctor_fee(invoice),
            "vendor": vendor_cost(invoice),
        }
        values["profit"] = (
            values["paid"] - values["tax"] - values["doctor"] - values["vendor"]
        )
        for kind, key, label in (
            ("doctor", doctor_id or "unassigned", doctor_name),
            ("department", department_id or "unassigned", department_name),
        ):
            bucket = grouped[kind].setdefault(
                key, {"label": label, **{name: 0 for name in values}}
            )
            for name, value in values.items():
                bucket[name] += value
        patient = patients.get(invoice.patient_id)
        invoice_rows.append(
            [
                invoice.invoice_number,
                invoice.created_at.date(),
                patient.full_name
                if include_patient and patient
                else ("Protected" if patient else "-"),
                doctor_name,
                department_name,
                values["gross"],
                values["discount"],
                values["net"],
                values["paid"],
                values["balance"],
                payment_modes(invoice),
                values["tax"],
                values["doctor"],
                values["vendor"],
                values["profit"],
                values["profit"] / values["paid"] if values["paid"] else 0,
            ]
        )
        for item in items.get(invoice.id, []):
            if not item.supplier_id or not _amount(item.buying_amount):
                continue
            bucket = vendor_buckets.setdefault(
                item.supplier_id,
                {
                    "name": suppliers[item.supplier_id].name
                    if item.supplier_id in suppliers
                    else item.supplier_id,
                    "lines": 0,
                    "units": 0,
                    "sales": 0.0,
                    "cost": 0.0,
                },
            )
            bucket["lines"] += 1
            bucket["units"] += int(item.quantity)
            bucket["sales"] += _amount(item.total_amount)
            bucket["cost"] += _amount(item.buying_amount) * int(item.quantity)

    group_headers = [
        "Name",
        "Invoices",
        "Gross item value",
        "Billing discounts",
        "Net revenue",
        "Paid revenue",
        "Balance",
        "GST",
        "Doctor fee",
        "Vendor cost",
        "Clinic profit",
        "Margin %",
    ]
    group_widths = [28, 12, 18, 18, 18, 18, 16, 15, 16, 16, 18, 13]

    def group_rows(kind: str) -> list[list[Any]]:
        result = []
        for row in sorted(
            grouped[kind].values(), key=lambda value: value["paid"], reverse=True
        ):
            result.append(
                [
                    row["label"],
                    row["count"],
                    row["gross"],
                    row["discount"],
                    row["net"],
                    row["paid"],
                    row["balance"],
                    row["tax"],
                    row["doctor"],
                    row["vendor"],
                    row["profit"],
                    row["profit"] / row["paid"] if row["paid"] else 0,
                ]
            )
        return result

    if filters.get("doctor", True):
        actual = [
            [
                row.id,
                doctors[row.practitioner_id].full_name
                if row.practitioner_id in doctors
                else "All / Unassigned",
                row.period_start,
                row.period_end,
                row.finalized_at.date(),
                row.invoice_count,
                _amount(row.total_paid_amount),
                _amount(row.total_doctor_share),
                _amount(row.settlement_amount),
                row.payment_method or "-",
                row.payment_reference or "-",
            ]
            for row in doctor_settlements
        ]
        workbook.add_sheet(
            _sheet(
                "Doctor Settlements",
                "Doctor Settlements Paid",
                subtitle,
                [
                    "Settlement ID",
                    "Doctor",
                    "Period start",
                    "Period end",
                    "Finalized date",
                    "Invoices",
                    "Paid revenue basis",
                    "Doctor share",
                    "Amount settled",
                    "Payment method",
                    "Reference",
                ],
                actual,
                [24, 26, 14, 14, 15, 11, 19, 17, 18, 18, 22],
                {7, 8, 9},
            )
        )
        workbook.add_sheet(
            _sheet(
                "Doctor Ledger",
                "Doctor Revenue & Accrued Settlement",
                subtitle,
                group_headers,
                group_rows("doctor"),
                group_widths,
                set(range(3, 12)),
                {12},
            )
        )
    if filters.get("vendor", True):
        paid_by_supplier: dict[str, float] = defaultdict(float)
        for row in vendor_settlements:
            paid_by_supplier[row.supplier_id] += _amount(row.settlement_amount)
        ledger = [
            [
                value["name"],
                value["lines"],
                value["units"],
                value["sales"],
                value["cost"],
                paid_by_supplier.get(key, 0),
                value["cost"] - paid_by_supplier.get(key, 0),
            ]
            for key, value in sorted(
                vendor_buckets.items(), key=lambda item: item[1]["cost"], reverse=True
            )
        ]
        workbook.add_sheet(
            _sheet(
                "Vendor Ledger",
                "Vendor Cost & Settlement Ledger",
                subtitle,
                [
                    "Vendor",
                    "Invoice lines",
                    "Units",
                    "Attributed sales",
                    "Cost accrued",
                    "Settlement paid",
                    "Unsettled estimate",
                ],
                ledger,
                [29, 14, 12, 19, 18, 18, 20],
                {4, 5, 6, 7},
            )
        )
        actual = [
            [
                row.id,
                suppliers[row.supplier_id].name
                if row.supplier_id in suppliers
                else row.supplier_id,
                row.source_type,
                row.period_start,
                row.period_end,
                row.finalized_at.date(),
                _amount(row.gross_payable),
                _amount(row.adjustment_amount),
                _amount(row.settlement_amount),
                row.payment_method or "-",
                row.payment_reference or "-",
                row.notes or "-",
            ]
            for row in vendor_settlements
        ]
        workbook.add_sheet(
            _sheet(
                "Vendor Settlements",
                "Vendor Settlements Paid",
                subtitle,
                [
                    "Settlement ID",
                    "Vendor",
                    "Source",
                    "Period start",
                    "Period end",
                    "Finalized date",
                    "Gross payable",
                    "Adjustment",
                    "Amount settled",
                    "Payment method",
                    "Reference",
                    "Notes",
                ],
                actual,
                [24, 27, 14, 14, 14, 15, 18, 16, 18, 18, 22, 30],
                {7, 8, 9},
            )
        )
    if filters.get("department", True):
        workbook.add_sheet(
            _sheet(
                "Department Revenue",
                "Medical Department Revenue",
                subtitle,
                group_headers,
                group_rows("department"),
                group_widths,
                set(range(3, 12)),
                {12},
            )
        )
    if filters.get("invoice", True):
        workbook.add_sheet(
            _sheet(
                "Invoice Detail",
                "Paid Invoice Profit Detail",
                subtitle
                + (
                    " · Patient names included"
                    if include_patient
                    else " · Patient names protected"
                ),
                [
                    "Invoice",
                    "Date",
                    "Patient",
                    "Doctor",
                    "Department",
                    "Gross item value",
                    "Billing discounts",
                    "Net total",
                    "Paid",
                    "Balance",
                    "Payment modes",
                    "GST",
                    "Doctor fee",
                    "Vendor cost",
                    "Clinic profit",
                    "Margin %",
                ],
                invoice_rows,
                [20, 14, 20, 24, 24, 18, 18, 17, 17, 16, 22, 15, 16, 16, 18, 13],
                set(range(6, 16)),
                {16},
            )
        )
    if filters.get("collections", True):
        rows = []
        for payment in collections:
            invoice = invoice_by_id.get(payment.invoice_id) or session.get(
                Invoice, payment.invoice_id
            )
            method = getattr(payment.method, "value", payment.method)
            rows.append(
                [
                    payment.id,
                    payment.collected_at.date(),
                    invoice.invoice_number if invoice else payment.invoice_id,
                    str(method).replace("_", " ").title(),
                    _amount(payment.amount),
                    _amount(payment.refunded_amount),
                    _amount(payment.amount) - _amount(payment.refunded_amount),
                    payment.reference_number or "-",
                ]
            )
        workbook.add_sheet(
            _sheet(
                "Collections",
                "Payment Collections",
                subtitle + " · payment collected-date basis",
                [
                    "Payment ID",
                    "Collected date",
                    "Invoice",
                    "Method",
                    "Gross collected",
                    "Refunded",
                    "Net collected",
                    "Reference",
                ],
                rows,
                [24, 16, 20, 17, 18, 16, 18, 23],
                {5, 6, 7},
            )
        )

    checks = [
        [
            "Invoice profit identity",
            metrics["profit"],
            metrics["paid"] - metrics["tax"] - metrics["doctor"] - metrics["vendor"],
            0.0,
            "PASS",
        ],
        [
            "Doctor accrued vs payout",
            metrics["doctor"],
            doctor_paid,
            metrics["doctor"] - doctor_paid,
            "INFORMATIONAL",
        ],
        [
            "Vendor accrued vs payout",
            metrics["vendor"],
            vendor_paid,
            metrics["vendor"] - vendor_paid,
            "INFORMATIONAL",
        ],
        [
            "Invoice paid vs cash collected",
            metrics["paid"],
            cash_collected,
            metrics["paid"] - cash_collected,
            "INFORMATIONAL",
        ],
    ]
    workbook.add_sheet(
        _sheet(
            "Reconciliation",
            "Control & Reconciliation Checks",
            subtitle + " · variances may reflect different date bases",
            [
                "Check",
                "Invoice / accrued basis",
                "Compared basis",
                "Variance",
                "Status",
            ],
            checks,
            [39, 23, 21, 18, 18],
            {2, 3, 4},
        )
    )
    definitions = [
        ["Paid revenue", "Paid value on invoices created in the selected month."],
        ["Cash collected", "Payments collected in the month, net of refunds."],
        ["Doctor fee accrued", "Doctor share attributed to selected invoices."],
        ["Doctor settlement paid", "Doctor settlements finalized during the month."],
        [
            "Vendor cost accrued",
            "Buying cost on supplier-linked invoice items; not proof of payment.",
        ],
        ["Vendor settlement paid", "Vendor settlements finalized during the month."],
        [
            "Clinic profit",
            "Paid revenue minus GST, accrued doctor fee, and accrued vendor cost.",
        ],
        [
            "Patient privacy",
            "Patient names are protected unless explicitly enabled for authorized recipients.",
        ],
    ]
    workbook.add_sheet(
        _sheet(
            "Definitions",
            "Report Definitions & Data Policy",
            subtitle,
            ["Term", "Definition"],
            definitions,
            [29, 90],
        )
    )
    return (
        f"monthly-revenue-settlement-{start.isoformat()}-{end.isoformat()}.xlsx",
        workbook.to_bytes(),
    )
