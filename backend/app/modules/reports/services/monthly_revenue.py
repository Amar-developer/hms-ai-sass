from datetime import date, datetime
from html import escape

from sqlmodel import Session

from app.modules.reports.repositories import ReportDataRepository
from app.modules.reports.services.classification import ReportInvoiceClassifier
from app.modules.reports.services.calculations import (
    invoice_approved_discount,
    invoice_billing_discount,
    invoice_item_total,
    invoice_membership_benefit,
    invoice_offer_discount,
    is_paid_invoice,
    report_doctor_fee,
    report_settlement,
    tax_paid_basis,
)
from app.modules.billing.services.read_models import invoice_read
from app.modules.reports.services.rendering import money as _money
from app.modules.reports.services.rendering import table as _table


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
    tenant = repo.get_tenant(tenant_id)
    invoices = repo.list_invoices_for_period(
        tenant_id=tenant_id,
        start_at=datetime.combine(start, datetime.min.time()),
        end_at=datetime.combine(end, datetime.max.time()),
    )
    paid_invoices = [invoice for invoice in invoices if is_paid_invoice(invoice)]
    report_invoice_by_id = {
        invoice.id: invoice_read(session, invoice) for invoice in paid_invoices
    }
    invoice_items_by_invoice = {invoice.id: [] for invoice in paid_invoices}
    for item in repo.list_invoice_items_by_invoice_ids(
        tenant_id=tenant_id,
        invoice_ids=[invoice.id for invoice in paid_invoices],
    ):
        invoice_items_by_invoice.setdefault(item.invoice_id, []).append(item)
    classifier = ReportInvoiceClassifier(invoice_items_by_invoice)

    def invoice_doctor_fee(invoice) -> int:
        return report_doctor_fee(invoice, classifier.classify(invoice))

    def invoice_settlement(invoice) -> int:
        invoice_kind = classifier.classify(invoice)
        return report_settlement(
            invoice, invoice_kind, invoice_items_by_invoice.get(invoice.id, [])
        )

    payment_modes_by_invoice: dict[str, set[str]] = {
        invoice.id: set() for invoice in paid_invoices
    }
    for payment in repo.list_recorded_payments_by_invoice_ids(
        tenant_id=tenant_id,
        invoice_ids=[invoice.id for invoice in paid_invoices],
    ):
        method = (
            payment.method.value if hasattr(payment.method, "value") else payment.method
        )
        payment_modes_by_invoice.setdefault(payment.invoice_id, set()).add(str(method))

    def payment_mode(invoice) -> str:
        modes = {
            value.replace("_", " ").title()
            for value in payment_modes_by_invoice.get(invoice.id, set())
        }
        if invoice_membership_benefit(invoice) > 0:
            modes.add("Membership Benefit")
        return " + ".join(sorted(modes)) if modes else "-"

    def combined_payment_modes(values: set[str]) -> str:
        modes = sorted(value for value in values if value and value != "-")
        return " + ".join(modes) if modes else "-"

    appointments = {
        row.id: row
        for row in repo.list_appointments_by_ids(
            tenant_id=tenant_id,
            appointment_ids=[
                invoice.appointment_id
                for invoice in paid_invoices
                if invoice.appointment_id
            ],
        )
    }
    patients = {
        row.id: row
        for row in repo.list_patients_by_ids(
            tenant_id=tenant_id,
            patient_ids=[invoice.patient_id for invoice in paid_invoices],
        )
    }
    doctors = {row.id: row for row in repo.list_practitioners(tenant_id=tenant_id)}
    departments = {row.id: row for row in repo.list_departments(tenant_id=tenant_id)}

    total_paid = sum(int(invoice.paid_amount or 0) for invoice in paid_invoices)
    total_invoice = sum(int(invoice.total_amount or 0) for invoice in paid_invoices)
    total_item = sum(invoice_item_total(invoice) for invoice in paid_invoices)
    total_approved = sum(
        invoice_approved_discount(report_invoice_by_id[invoice.id])
        for invoice in paid_invoices
    )
    total_offer = sum(
        invoice_offer_discount(report_invoice_by_id[invoice.id])
        for invoice in paid_invoices
    )
    total_membership = sum(
        invoice_membership_benefit(invoice) for invoice in paid_invoices
    )
    total_billing_discount = sum(
        invoice_billing_discount(report_invoice_by_id[invoice.id])
        for invoice in paid_invoices
    )
    total_doctor = sum(invoice_doctor_fee(invoice) for invoice in paid_invoices)
    total_settlement = sum(invoice_settlement(invoice) for invoice in paid_invoices)
    total_paid_tax = sum(tax_paid_basis(invoice) for invoice in paid_invoices)
    total_profit = total_paid - total_paid_tax - total_doctor - total_settlement
    sections: list[str] = []
    if filters.get("overall", True):
        sections.append(
            _table(
                "Overall Summary",
                ["Metric", "Value"],
                [
                    ["Tenant", tenant.name if tenant else tenant_id],
                    ["Period", f"{start.isoformat()} to {end.isoformat()}"],
                    ["Settled Invoices", len(paid_invoices)],
                    ["Item Total", _money(total_item)],
                    ["Admin Approved Discounts", _money(total_approved)],
                    ["Offer Discounts Used", _money(total_offer)],
                    ["Membership Benefits Used", _money(total_membership)],
                    ["Total Billing Discounts", _money(total_billing_discount)],
                    [
                        "Payment Modes",
                        combined_payment_modes(
                            {payment_mode(invoice) for invoice in paid_invoices}
                        ),
                    ],
                    ["Net Invoice Revenue", _money(total_invoice)],
                    ["Paid Revenue", _money(total_paid)],
                    ["GST from Paid Revenue", _money(total_paid_tax)],
                    ["Doctor Fee", _money(total_doctor)],
                    ["Settlement", _money(total_settlement)],
                    [
                        "Settlement %",
                        "0%"
                        if not total_paid
                        else f"{round((total_settlement / total_paid) * 100)}%",
                    ],
                    ["Clinic Profit", _money(total_profit)],
                ],
            )
        )

    def bucket_rows(group: str) -> list[list[object]]:
        buckets: dict[str, dict] = {}
        for invoice in paid_invoices:
            appointment = appointments.get(invoice.appointment_id or "")
            if group == "doctor":
                key = appointment.practitioner_id if appointment else "unassigned"
                label = doctors.get(key).full_name if key in doctors else "Unassigned"
            elif group == "department":
                key = appointment.department_id if appointment else "unassigned"
                label = (
                    departments.get(key).name if key in departments else "Unassigned"
                )
            else:
                key = invoice.branch_id
                label = key
            bucket = buckets.setdefault(
                key or "unassigned",
                {
                    "label": label,
                    "invoices": 0,
                    "item": 0,
                    "offer": 0,
                    "approved": 0,
                    "billing_discount": 0,
                    "membership": 0,
                    "invoice": 0,
                    "paid": 0,
                    "balance": 0,
                    "payment_modes": set(),
                    "doctor": 0,
                    "settlement": 0,
                    "tax": 0,
                },
            )
            bucket["invoices"] += 1
            bucket["item"] += invoice_item_total(invoice)
            report_invoice = report_invoice_by_id[invoice.id]
            bucket["approved"] += invoice_approved_discount(report_invoice)
            bucket["offer"] += invoice_offer_discount(report_invoice)
            bucket["billing_discount"] += invoice_billing_discount(report_invoice)
            bucket["membership"] += invoice_membership_benefit(invoice)
            bucket["invoice"] += int(invoice.total_amount or 0)
            bucket["paid"] += int(invoice.paid_amount or 0)
            bucket["balance"] += int(invoice.balance_amount or 0)
            bucket["payment_modes"].add(payment_mode(invoice))
            bucket["doctor"] += invoice_doctor_fee(invoice)
            bucket["settlement"] += invoice_settlement(invoice)
            bucket["tax"] += tax_paid_basis(invoice)
        return [
            [
                row["label"],
                row["invoices"],
                _money(row["item"]),
                _money(row["approved"]),
                _money(row["offer"]),
                _money(row["membership"]),
                _money(row["billing_discount"]),
                _money(row["invoice"]),
                _money(row["paid"]),
                _money(row["balance"]),
                combined_payment_modes(row["payment_modes"]),
                _money(row["tax"]),
                _money(row["doctor"]),
                _money(row["settlement"]),
                "0%"
                if not row["paid"]
                else f"{round((row['settlement'] / row['paid']) * 100)}%",
                _money(row["paid"] - row["tax"] - row["doctor"] - row["settlement"]),
            ]
            for row in sorted(
                buckets.values(), key=lambda item: item["paid"], reverse=True
            )
        ]

    grouped_headers = [
        "Name",
        "Settled Invoices",
        "Item Total",
        "Admin Approved Discount",
        "Offer Discount",
        "Membership Benefit",
        "Total Billing Discount",
        "Net Invoice Revenue",
        "Paid Revenue",
        "Balance",
        "Mode of Payment",
        "GST from Paid Revenue",
        "Doctor Fee",
        "Settlement",
        "Settlement %",
        "Clinic Profit",
    ]
    if filters.get("doctor", True):
        sections.append(
            _table(
                "Doctor Revenue and Settlement", grouped_headers, bucket_rows("doctor")
            )
        )
    if filters.get("department", True):
        sections.append(
            _table(
                "Medical Department Revenue", grouped_headers, bucket_rows("department")
            )
        )
    if filters.get("invoice", True):
        invoice_rows = []
        for invoice in paid_invoices:
            appointment = appointments.get(invoice.appointment_id or "")
            patient = patients.get(invoice.patient_id)
            doctor = (
                doctors.get(appointment.practitioner_id)
                if appointment and appointment.practitioner_id
                else None
            )
            department = (
                departments.get(appointment.department_id)
                if appointment and appointment.department_id
                else None
            )
            doctor_fee = invoice_doctor_fee(invoice)
            settlement = invoice_settlement(invoice)
            paid = int(invoice.paid_amount or 0)
            paid_tax = tax_paid_basis(invoice)
            report_invoice = report_invoice_by_id[invoice.id]
            invoice_rows.append(
                [
                    invoice.invoice_number,
                    invoice.created_at.date().isoformat(),
                    patient.full_name if patient else invoice.patient_id,
                    doctor.full_name if doctor else "Unassigned",
                    department.name if department else "Unassigned",
                    _money(invoice_item_total(invoice)),
                    _money(invoice_approved_discount(report_invoice)),
                    _money(invoice_offer_discount(report_invoice)),
                    _money(invoice_membership_benefit(invoice)),
                    _money(invoice_billing_discount(report_invoice)),
                    _money(int(invoice.total_amount or 0)),
                    _money(paid),
                    _money(int(invoice.balance_amount or 0)),
                    payment_mode(invoice),
                    _money(paid_tax),
                    _money(doctor_fee),
                    _money(settlement),
                    "0%" if not paid else f"{round((settlement / paid) * 100)}%",
                    _money(paid - paid_tax - doctor_fee - settlement),
                ]
            )
        sections.append(
            _table(
                "Settled Invoice Profit Details",
                [
                    "Invoice",
                    "Date",
                    "Patient",
                    "Doctor",
                    "Medical Department",
                    "Item Total",
                    "Admin Approved Discount",
                    "Offer Discount",
                    "Membership Benefit",
                    "Total Billing Discount",
                    "Net Total",
                    "Paid",
                    "Balance",
                    "Mode of Payment",
                    "GST from Paid Revenue",
                    "Doctor Fee",
                    "Settlement",
                    "Settlement %",
                    "Clinic Profit",
                ],
                invoice_rows,
            )
        )

    html = f"""
    <html>
      <head>
        <meta charset="utf-8" />
        <style>
          body {{ font-family: Arial, sans-serif; color: #0f172a; }}
          h1 {{ margin: 0 0 8px; }}
          h2 {{ margin: 24px 0 8px; }}
          table {{ border-collapse: collapse; width: 100%; margin-bottom: 20px; }}
          th, td {{ border: 1px solid #cbd5e1; padding: 8px; text-align: left; }}
          th {{ background: #f1f5f9; font-size: 12px; text-transform: uppercase; }}
        </style>
      </head>
      <body>
        <h1>Monthly Revenue and Settlement Report</h1>
        <p>{escape(tenant.name if tenant else tenant_id)} · {start.isoformat()} to {end.isoformat()}</p>
        {"".join(sections)}
      </body>
    </html>
    """
    filename = f"monthly-revenue-report-{start.isoformat()}-{end.isoformat()}.xls"
    return filename, html.encode("utf-8")
