import json
import smtplib
from calendar import monthrange
from datetime import date, datetime
from email.message import EmailMessage
from html import escape

from sqlmodel import Session, select

from app.core.config import get_settings
from app.modules.appointments.models import Appointment, AppointmentStatus
from app.modules.billing.models import Invoice, InvoiceStatus
from app.modules.lab.models import LabOrderItem, LabTestCatalog, LabTestPackage
from app.modules.patients.models import Patient
from app.modules.pharmacy.models import MedicineCatalog, PharmacyIssueItem, PharmacySupplier
from app.modules.practitioners.models import Practitioner
from app.modules.reports.models import ReportJob, ReportJobStatus
from app.modules.settings.models import AdminSetting, SettingKey, SettingScope
from app.modules.settings.service import decode_value, upsert_setting
from app.modules.tenants.models import Department, Tenant, now_utc


REPORT_SETTING_KEYS = {
    SettingKey.REPORT_MONTHLY_EMAIL_ENABLED,
    SettingKey.REPORT_MONTHLY_EMAIL_RECIPIENTS,
    SettingKey.REPORT_MONTHLY_EMAIL_CC,
    SettingKey.REPORT_MONTHLY_EMAIL_SEND_DAY,
    SettingKey.REPORT_MONTHLY_EMAIL_FILTERS,
    SettingKey.REPORT_MONTHLY_EMAIL_LAST_SENT_PERIOD,
}


def previous_month_range(today: date | None = None) -> tuple[date, date]:
    today = today or date.today()
    year = today.year
    month = today.month - 1
    if month == 0:
        year -= 1
        month = 12
    return date(year, month, 1), date(year, month, monthrange(year, month)[1])


def report_period_key(start: date, end: date) -> str:
    return f"{start.isoformat()}:{end.isoformat()}"


def _list(value: object) -> list[str]:
    if isinstance(value, list):
        return [str(item).strip() for item in value if str(item).strip()]
    if isinstance(value, str):
        return [item.strip() for item in value.split(",") if item.strip()]
    return []


def load_monthly_report_config(session: Session, tenant_id: str) -> dict:
    rows = session.exec(
        select(AdminSetting).where(
            AdminSetting.tenant_id == tenant_id,
            AdminSetting.scope == SettingScope.TENANT,
            AdminSetting.module == "reports",
        )
    ).all()
    values = {row.key: decode_value(row.value_json) for row in rows if row.key in REPORT_SETTING_KEYS}
    return {
        "enabled": bool(values.get(SettingKey.REPORT_MONTHLY_EMAIL_ENABLED, False)),
        "recipients": _list(values.get(SettingKey.REPORT_MONTHLY_EMAIL_RECIPIENTS, [])),
        "cc": _list(values.get(SettingKey.REPORT_MONTHLY_EMAIL_CC, [])),
        "send_day": int(values.get(SettingKey.REPORT_MONTHLY_EMAIL_SEND_DAY, 1) or 1),
        "filters": values.get(
            SettingKey.REPORT_MONTHLY_EMAIL_FILTERS,
            {"overall": True, "doctor": True, "department": True, "invoice": True},
        )
        or {},
        "last_sent_period": str(values.get(SettingKey.REPORT_MONTHLY_EMAIL_LAST_SENT_PERIOD, "") or ""),
    }


def save_monthly_report_config(
    session: Session,
    *,
    tenant_id: str,
    recipients: list[str],
    cc: list[str],
    enabled: bool,
    send_day: int,
    filters: dict,
    actor_user_id: str | None,
) -> dict:
    send_day = min(max(int(send_day or 1), 1), 28)
    values = [
        (SettingKey.REPORT_MONTHLY_EMAIL_ENABLED, enabled),
        (SettingKey.REPORT_MONTHLY_EMAIL_RECIPIENTS, recipients),
        (SettingKey.REPORT_MONTHLY_EMAIL_CC, cc),
        (SettingKey.REPORT_MONTHLY_EMAIL_SEND_DAY, send_day),
        (SettingKey.REPORT_MONTHLY_EMAIL_FILTERS, filters),
    ]
    for key, value in values:
        upsert_setting(
            session,
            tenant_id=tenant_id,
            scope=SettingScope.TENANT,
            scope_id=tenant_id,
            module="reports",
            key=key,
            value=value,
            actor_user_id=actor_user_id,
        )
    return load_monthly_report_config(session, tenant_id)


def settlement_paid_basis(invoice: Invoice) -> int:
    total = int(invoice.total_amount or 0)
    paid = int(invoice.paid_amount or 0)
    doctor_share = int(invoice.doctor_share_amount or 0)
    if not total or not paid or not doctor_share:
        return 0
    return min(round((doctor_share * paid) / total), paid)


def invoice_item_total(invoice: Invoice) -> int:
    return int(invoice.subtotal_amount or invoice.total_amount or 0)


def invoice_membership_benefit(invoice: Invoice) -> int:
    return int(invoice.membership_discount_amount or 0)


def invoice_offer_discount(invoice: Invoice) -> int:
    return max(int(invoice.discount_amount or 0) - invoice_membership_benefit(invoice), 0)


def allocated_line_revenue(invoice: Invoice, line_amount: int) -> int:
    item_total = invoice_item_total(invoice)
    revenue = int(invoice.paid_amount or invoice.total_amount or 0)
    if not item_total or not line_amount or not revenue:
        return 0
    return round((line_amount * revenue) / item_total)


def allocated_line_offer_discount(invoice: Invoice, line_amount: int) -> int:
    item_total = invoice_item_total(invoice)
    offer_discount = invoice_offer_discount(invoice)
    if not item_total or not line_amount or not offer_discount:
        return 0
    return round((line_amount * offer_discount) / item_total)


def allocated_line_membership_benefit(invoice: Invoice, line_amount: int) -> int:
    item_total = invoice_item_total(invoice)
    membership_benefit = invoice_membership_benefit(invoice)
    if not item_total or not line_amount or not membership_benefit:
        return 0
    return round((line_amount * membership_benefit) / item_total)


def is_paid_invoice(invoice: Invoice) -> bool:
    total = int(invoice.total_amount or 0)
    balance = int(invoice.balance_amount or 0)
    settled_zero_invoice = total == 0 and balance <= 0 and int(invoice.discount_amount or 0) > 0
    return invoice.status == InvoiceStatus.PAID or (
        int(invoice.paid_amount or 0) > 0 and balance <= 0
    ) or settled_zero_invoice


def _money(value: int | float) -> str:
    return f"Rs. {int(value or 0):,}"


def _table(title: str, headers: list[str], rows: list[list[object]]) -> str:
    header_style = (
        "background-color:#2f6b52;color:#ffffff;font-family:Roboto,Arial,sans-serif;"
        "font-size:13px;font-weight:bold;border:1px solid #b7c5bd;padding:9px 10px;"
        "text-align:left;white-space:nowrap;"
    )
    text_style = (
        "font-family:Roboto,Arial,sans-serif;font-size:13px;color:#1f2937;"
        "border:1px solid #d9e2dd;padding:8px 10px;text-align:left;"
    )
    number_style = (
        "font-family:Roboto,Arial,sans-serif;font-size:13px;color:#1f2937;"
        "border:1px solid #d9e2dd;padding:8px 10px;text-align:right;"
    )
    empty_style = (
        "font-family:Roboto,Arial,sans-serif;font-size:13px;color:#64748b;"
        "border:1px solid #d9e2dd;padding:12px 10px;text-align:left;"
    )
    title_style = (
        "font-family:Roboto,Arial,sans-serif;font-size:16px;font-weight:bold;"
        "color:#0f172a;background-color:#eef6f1;border:1px solid #b7c5bd;"
        "padding:10px 12px;text-align:left;"
    )

    def td(cell: object, row_index: int) -> str:
        is_total = rows[row_index][0] == "Total" if rows[row_index] else False
        base_style = number_style if isinstance(cell, int | float) and not isinstance(cell, bool) else text_style
        background = "#e6f2ec" if is_total else "#f8faf9" if row_index % 2 else "#ffffff"
        if is_total:
            base_style += "font-weight:bold;"
        return f"<td style='{base_style}background-color:{background};'>{escape(str(cell))}</td>"

    body = "".join(
        "<tr>" + "".join(td(cell, index) for cell in row) + "</tr>"
        for index, row in enumerate(rows)
    )
    if not rows:
        body = f"<tr><td colspan='{len(headers)}' style='{empty_style}'>No rows</td></tr>"
    return (
        "<table style='border-collapse:collapse;width:100%;margin-bottom:22px;'>"
        f"<thead><tr><th colspan='{len(headers)}' style='{title_style}'>{escape(title)}</th></tr><tr>"
        + "".join(f"<th style='{header_style}'>{escape(header)}</th>" for header in headers)
        + f"</tr></thead><tbody>{body}</tbody></table>"
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
    tenant = session.get(Tenant, tenant_id)
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
    paid_invoices = [invoice for invoice in invoices if is_paid_invoice(invoice)]
    appointments = {
        row.id: row
        for row in session.exec(
            select(Appointment).where(
                Appointment.tenant_id == tenant_id,
                Appointment.id.in_([invoice.appointment_id for invoice in paid_invoices if invoice.appointment_id]),
            )
        ).all()
    }
    patients = {
        row.id: row
        for row in session.exec(
            select(Patient).where(
                Patient.tenant_id == tenant_id,
                Patient.id.in_([invoice.patient_id for invoice in paid_invoices]),
            )
        ).all()
    }
    doctors = {row.id: row for row in session.exec(select(Practitioner).where(Practitioner.tenant_id == tenant_id)).all()}
    departments = {row.id: row for row in session.exec(select(Department).where(Department.tenant_id == tenant_id)).all()}

    total_paid = sum(int(invoice.paid_amount or 0) for invoice in paid_invoices)
    total_invoice = sum(int(invoice.total_amount or 0) for invoice in paid_invoices)
    total_item = sum(invoice_item_total(invoice) for invoice in paid_invoices)
    total_offer = sum(invoice_offer_discount(invoice) for invoice in paid_invoices)
    total_membership = sum(invoice_membership_benefit(invoice) for invoice in paid_invoices)
    total_doctor = sum(int(invoice.doctor_share_amount or 0) for invoice in paid_invoices)
    total_settlement = sum(settlement_paid_basis(invoice) for invoice in paid_invoices)
    total_profit = max(total_paid - total_settlement, 0)
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
                    ["Offer Discounts Used", _money(total_offer)],
                    ["Membership Benefits Used", _money(total_membership)],
                    ["Net Invoice Revenue", _money(total_invoice)],
                    ["Paid Revenue", _money(total_paid)],
                    ["Doctor Fee", _money(total_doctor)],
                    ["Settlement", _money(total_settlement)],
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
                label = departments.get(key).name if key in departments else "Unassigned"
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
                    "membership": 0,
                    "invoice": 0,
                    "paid": 0,
                    "doctor": 0,
                    "settlement": 0,
                },
            )
            bucket["invoices"] += 1
            bucket["item"] += invoice_item_total(invoice)
            bucket["offer"] += invoice_offer_discount(invoice)
            bucket["membership"] += invoice_membership_benefit(invoice)
            bucket["invoice"] += int(invoice.total_amount or 0)
            bucket["paid"] += int(invoice.paid_amount or 0)
            bucket["doctor"] += int(invoice.doctor_share_amount or 0)
            bucket["settlement"] += settlement_paid_basis(invoice)
        return [
            [
                row["label"],
                row["invoices"],
                _money(row["item"]),
                _money(row["offer"]),
                _money(row["membership"]),
                _money(row["invoice"]),
                _money(row["paid"]),
                _money(row["doctor"]),
                _money(row["settlement"]),
                _money(max(row["paid"] - row["settlement"], 0)),
            ]
            for row in sorted(buckets.values(), key=lambda item: item["paid"], reverse=True)
        ]

    grouped_headers = [
        "Name",
        "Settled Invoices",
        "Item Total",
        "Offer Discount",
        "Membership Benefit",
        "Net Invoice Revenue",
        "Paid Revenue",
        "Doctor Fee",
        "Settlement",
        "Clinic Profit",
    ]
    if filters.get("doctor", True):
        sections.append(_table("Doctor Revenue and Settlement", grouped_headers, bucket_rows("doctor")))
    if filters.get("department", True):
        sections.append(_table("Department Revenue", grouped_headers, bucket_rows("department")))
    if filters.get("invoice", True):
        invoice_rows = []
        for invoice in paid_invoices:
            appointment = appointments.get(invoice.appointment_id or "")
            patient = patients.get(invoice.patient_id)
            doctor = doctors.get(appointment.practitioner_id) if appointment and appointment.practitioner_id else None
            department = departments.get(appointment.department_id) if appointment and appointment.department_id else None
            settlement = settlement_paid_basis(invoice)
            paid = int(invoice.paid_amount or 0)
            invoice_rows.append(
                [
                    invoice.invoice_number,
                    invoice.created_at.date().isoformat(),
                    patient.full_name if patient else invoice.patient_id,
                    doctor.full_name if doctor else "Unassigned",
                    department.name if department else "Unassigned",
                    _money(invoice_item_total(invoice)),
                    _money(invoice_offer_discount(invoice)),
                    _money(invoice_membership_benefit(invoice)),
                    _money(int(invoice.total_amount or 0)),
                    _money(paid),
                    _money(int(invoice.doctor_share_amount or 0)),
                    _money(settlement),
                    _money(max(paid - settlement, 0)),
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
                    "Department",
                    "Item Total",
                    "Offer Discount",
                    "Membership Benefit",
                    "Net Total",
                    "Paid",
                    "Doctor Fee",
                    "Settlement",
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
        {''.join(sections)}
      </body>
    </html>
    """
    filename = f"monthly-revenue-report-{start.isoformat()}-{end.isoformat()}.xls"
    return filename, html.encode("utf-8")


def _xls_document(title: str, period: str, sections: list[str]) -> bytes:
    html = f"""
    <html>
      <head>
        <meta charset="utf-8" />
        <style>
          body {{ font-family: Roboto, Arial, sans-serif; color: #1f2937; font-size: 13px; }}
          h1 {{ margin: 0 0 6px; font-size: 22px; color: #0f172a; }}
          p {{ margin: 0 0 18px; color: #475569; font-size: 13px; }}
          table {{ border-collapse: collapse; width: 100%; font-size: 10px;}}
        </style>
      </head>
      <body>
        <h1 style="font-family:Roboto,Arial,sans-serif;font-size:22px;font-weight:bold;color:#0f172a;margin:0 0 6px;">{escape(title)}</h1>
        <p style="font-family:Roboto,Arial,sans-serif;font-size:13px;color:#475569;margin:0 0 18px;">{escape(period)}</p>
        {''.join(sections)}
      </body>
    </html>
    """
    return html.encode("utf-8")


def build_profit_report_email_attachments(
    session: Session,
    *,
    tenant_id: str,
    start: date,
    end: date,
    doctor_id: str | None = None,
    invoice_type: str = "overall",
    supplier_id: str | None = None,
    branch_id: str | None = None,
) -> list[tuple[str, bytes]]:
    tenant = session.get(Tenant, tenant_id)
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
    paid_invoices = [invoice for invoice in invoices if is_paid_invoice(invoice)]
    if branch_id:
        paid_invoices = [invoice for invoice in paid_invoices if invoice.branch_id == branch_id]

    def classify_invoice(invoice: Invoice) -> str:
        if invoice.pharmacy_issue_id:
            return "pharmacy"
        if invoice.lab_order_id:
            return "lab"
        return "consultation"

    def type_label(value: str) -> str:
        if value == "pharmacy":
            return "Pharmacy"
        if value == "lab":
            return "Lab"
        return "Consultation"

    if invoice_type in {"consultation", "lab", "pharmacy"}:
        paid_invoices = [invoice for invoice in paid_invoices if classify_invoice(invoice) == invoice_type]

    appointments = {
        row.id: row
        for row in session.exec(
            select(Appointment).where(
                Appointment.tenant_id == tenant_id,
                Appointment.id.in_([invoice.appointment_id for invoice in paid_invoices if invoice.appointment_id]),
            )
        ).all()
    }
    if doctor_id:
        paid_invoices = [
            invoice
            for invoice in paid_invoices
            if appointments.get(invoice.appointment_id or "")
            and appointments[invoice.appointment_id or ""].practitioner_id == doctor_id
        ]
    patients = {
        row.id: row
        for row in session.exec(
            select(Patient).where(
                Patient.tenant_id == tenant_id,
                Patient.id.in_([invoice.patient_id for invoice in paid_invoices]),
            )
        ).all()
    }
    doctors = {row.id: row for row in session.exec(select(Practitioner).where(Practitioner.tenant_id == tenant_id)).all()}

    completed_statement = select(Appointment).where(
        Appointment.tenant_id == tenant_id,
        Appointment.appointment_date >= start,
        Appointment.appointment_date <= end,
        Appointment.status.in_((AppointmentStatus.CONSULTATION_COMPLETED, AppointmentStatus.BILLED)),
    )
    if doctor_id:
        completed_statement = completed_statement.where(Appointment.practitioner_id == doctor_id)
    if branch_id:
        completed_statement = completed_statement.where(Appointment.branch_id == branch_id)
    completed_appointments = list(session.exec(completed_statement).all())

    doctor_buckets: dict[str, dict] = {}
    for invoice in paid_invoices:
        appointment = appointments.get(invoice.appointment_id or "")
        key = appointment.practitioner_id if appointment and appointment.practitioner_id else "unassigned"
        doctor = doctors.get(key)
        bucket = doctor_buckets.setdefault(
            key,
            {
                "doctor": doctor.full_name if doctor else "Unassigned",
                "consultations": 0,
                "invoices": 0,
                "gross": 0,
                "paid": 0,
                "offer": 0,
                "membership": 0,
                "doctor_fee": 0,
                "settlement": 0,
                "clinic_fee": 0,
                "final_profit": 0,
            },
        )
        paid = int(invoice.paid_amount or 0)
        doctor_fee = int(invoice.doctor_share_amount or 0)
        settlement = settlement_paid_basis(invoice)
        bucket["invoices"] += 1
        bucket["gross"] += int(invoice.total_amount or 0)
        bucket["paid"] += paid
        bucket["offer"] += invoice_offer_discount(invoice)
        bucket["membership"] += invoice_membership_benefit(invoice)
        bucket["doctor_fee"] += doctor_fee
        bucket["settlement"] += settlement
        bucket["clinic_fee"] += int(invoice.clinic_share_amount or 0) or max(int(invoice.total_amount or 0) - doctor_fee, 0)
        bucket["final_profit"] += max(paid - settlement, 0)
    for appointment in completed_appointments:
        key = appointment.practitioner_id or "unassigned"
        doctor = doctors.get(key)
        bucket = doctor_buckets.setdefault(
            key,
            {
                "doctor": doctor.full_name if doctor else "Unassigned",
                "consultations": 0,
                "invoices": 0,
                "gross": 0,
                "paid": 0,
                "offer": 0,
                "membership": 0,
                "doctor_fee": 0,
                "settlement": 0,
                "clinic_fee": 0,
                "final_profit": 0,
            },
        )
        bucket["consultations"] += 1

    def percent(value: int, total: int) -> str:
        return "0%" if not total else f"{round((value / total) * 100)}%"

    settlement_headers = [
        "Doctor",
        "Consultations",
        "Invoices",
        "Gross Revenue",
        "Paid Revenue",
        "Offer Discount",
        "Membership Benefit",
        "Doctor Fee",
        "Settlement",
        "Clinic Fee",
        "Gross Profit %",
        "Final Profit",
    ]
    settlement_rows = [
        [
            row["doctor"],
            row["consultations"],
            row["invoices"],
            row["gross"],
            row["paid"],
            row["offer"],
            row["membership"],
            row["doctor_fee"],
            row["settlement"],
            row["clinic_fee"],
            percent(max(row["gross"] - row["doctor_fee"], 0), row["gross"]),
            row["final_profit"],
        ]
        for row in sorted(doctor_buckets.values(), key=lambda item: item["final_profit"], reverse=True)
    ]
    if settlement_rows:
        total_gross = sum(int(row["gross"] or 0) for row in doctor_buckets.values())
        total_doctor_fee = sum(int(row["doctor_fee"] or 0) for row in doctor_buckets.values())
        settlement_rows.append(
            [
                "Total",
                sum(int(row["consultations"] or 0) for row in doctor_buckets.values()),
                sum(int(row["invoices"] or 0) for row in doctor_buckets.values()),
                total_gross,
                sum(int(row["paid"] or 0) for row in doctor_buckets.values()),
                sum(int(row["offer"] or 0) for row in doctor_buckets.values()),
                sum(int(row["membership"] or 0) for row in doctor_buckets.values()),
                total_doctor_fee,
                sum(int(row["settlement"] or 0) for row in doctor_buckets.values()),
                sum(int(row["clinic_fee"] or 0) for row in doctor_buckets.values()),
                percent(max(total_gross - total_doctor_fee, 0), total_gross),
                sum(int(row["final_profit"] or 0) for row in doctor_buckets.values()),
            ]
        )

    invoice_headers = [
        "Invoice",
        "Date",
        "Type",
        "Patient",
        "Doctor",
        "Status",
        "Item Total",
        "Offer Discount",
        "Membership Benefit",
        "Total",
        "Paid",
        "Balance",
        "Doctor Fee",
        "Settlement",
        "Clinic Profit",
    ]
    invoice_rows = []
    for invoice in paid_invoices:
        appointment = appointments.get(invoice.appointment_id or "")
        patient = patients.get(invoice.patient_id)
        doctor = doctors.get(appointment.practitioner_id) if appointment and appointment.practitioner_id else None
        settlement = settlement_paid_basis(invoice)
        paid = int(invoice.paid_amount or 0)
        invoice_rows.append(
            [
                invoice.invoice_number,
                invoice.created_at.date().isoformat(),
                type_label(classify_invoice(invoice)),
                patient.full_name if patient else invoice.patient_id,
                doctor.full_name if doctor else "Unassigned",
                invoice.status.value if hasattr(invoice.status, "value") else invoice.status,
                invoice_item_total(invoice),
                invoice_offer_discount(invoice),
                invoice_membership_benefit(invoice),
                int(invoice.total_amount or 0),
                paid,
                int(invoice.balance_amount or 0),
                int(invoice.doctor_share_amount or 0),
                settlement,
                max(paid - settlement, 0),
            ]
        )
    if invoice_rows:
        invoice_rows.append(
            [
                "Total",
                "",
                "",
                "",
                "",
                "",
                sum(invoice_item_total(invoice) for invoice in paid_invoices),
                sum(invoice_offer_discount(invoice) for invoice in paid_invoices),
                sum(invoice_membership_benefit(invoice) for invoice in paid_invoices),
                sum(int(invoice.total_amount or 0) for invoice in paid_invoices),
                sum(int(invoice.paid_amount or 0) for invoice in paid_invoices),
                sum(int(invoice.balance_amount or 0) for invoice in paid_invoices),
                sum(int(invoice.doctor_share_amount or 0) for invoice in paid_invoices),
                sum(settlement_paid_basis(invoice) for invoice in paid_invoices),
                sum(max(int(invoice.paid_amount or 0) - settlement_paid_basis(invoice), 0) for invoice in paid_invoices),
            ]
        )

    lab_invoices = [invoice for invoice in paid_invoices if invoice.lab_order_id]
    lab_order_ids = [invoice.lab_order_id for invoice in lab_invoices if invoice.lab_order_id]
    lab_items = (
        list(
            session.exec(
                select(LabOrderItem)
                .where(
                    LabOrderItem.tenant_id == tenant_id,
                    LabOrderItem.lab_order_id.in_(lab_order_ids),
                )
                .order_by(LabOrderItem.created_at)
            ).all()
        )
        if lab_order_ids
        else []
    )
    lab_tests = {
        row.id: row
        for row in (
            session.exec(select(LabTestCatalog).where(LabTestCatalog.tenant_id == tenant_id)).all()
            if lab_items
            else []
        )
    }
    lab_packages = {
        row.id: row
        for row in (
            session.exec(select(LabTestPackage).where(LabTestPackage.tenant_id == tenant_id)).all()
            if lab_items
            else []
        )
    }
    suppliers = {
        row.id: row.name
        for row in (
            session.exec(select(PharmacySupplier).where(PharmacySupplier.tenant_id == tenant_id)).all()
            if paid_invoices
            else []
        )
    }
    lab_invoice_by_order = {invoice.lab_order_id: invoice for invoice in lab_invoices if invoice.lab_order_id}
    lab_buckets: dict[tuple[str, str], dict] = {}
    for item in lab_items:
        invoice = lab_invoice_by_order.get(item.lab_order_id)
        catalog_item = lab_packages.get(item.package_id or "") if item.package_id else lab_tests.get(item.test_id or "")
        item_supplier_id = getattr(catalog_item, "supplier_id", None) if catalog_item else None
        if supplier_id and (item_supplier_id or "none") != supplier_id:
            continue
        supplier_name = suppliers.get(item_supplier_id or "", "No supplier")
        purchase_price = int(getattr(catalog_item, "purchase_price", 0) or 0) if catalog_item else 0
        line_amount = int(item.price or 0)
        key = (item_supplier_id or "none", item.test_name)
        bucket = lab_buckets.setdefault(
            key,
            {
                "supplier": supplier_name,
                "item": item.test_name,
                "orders": set(),
                "invoices": set(),
                "item_total": 0,
                "offer": 0,
                "membership": 0,
                "revenue": 0,
                "purchase": 0,
            },
        )
        bucket["orders"].add(item.lab_order_id)
        if invoice:
            bucket["invoices"].add(invoice.id)
        bucket["item_total"] += line_amount
        bucket["offer"] += allocated_line_offer_discount(invoice, line_amount) if invoice else 0
        bucket["membership"] += allocated_line_membership_benefit(invoice, line_amount) if invoice else 0
        bucket["revenue"] += allocated_line_revenue(invoice, line_amount) if invoice else 0
        bucket["purchase"] += purchase_price
    lab_settlement_headers = [
        "Supplier",
        "Lab Test / Package",
        "Orders",
        "Invoices",
        "Item Total",
        "Offer Discount",
        "Membership Benefit",
        "Net Revenue",
        "Purchase Cost",
        "Lab Profit",
    ]
    lab_settlement_rows = [
        [
            row["supplier"],
            row["item"],
            len(row["orders"]),
            len(row["invoices"]),
            row["item_total"],
            row["offer"],
            row["membership"],
            row["revenue"],
            row["purchase"],
            max(row["revenue"] - row["purchase"], 0),
        ]
        for row in sorted(lab_buckets.values(), key=lambda item: item["revenue"] - item["purchase"], reverse=True)
    ]
    if lab_settlement_rows:
        lab_settlement_rows.append(
            [
                "Total",
                "",
                sum(len(row["orders"]) for row in lab_buckets.values()),
                sum(len(row["invoices"]) for row in lab_buckets.values()),
                sum(int(row["item_total"] or 0) for row in lab_buckets.values()),
                sum(int(row["offer"] or 0) for row in lab_buckets.values()),
                sum(int(row["membership"] or 0) for row in lab_buckets.values()),
                sum(int(row["revenue"] or 0) for row in lab_buckets.values()),
                sum(int(row["purchase"] or 0) for row in lab_buckets.values()),
                sum(max(int(row["revenue"] or 0) - int(row["purchase"] or 0), 0) for row in lab_buckets.values()),
            ]
        )

    pharmacy_invoices = [invoice for invoice in paid_invoices if invoice.pharmacy_issue_id]
    pharmacy_issue_ids = [invoice.pharmacy_issue_id for invoice in pharmacy_invoices if invoice.pharmacy_issue_id]
    pharmacy_items = (
        list(
            session.exec(
                select(PharmacyIssueItem)
                .where(
                    PharmacyIssueItem.tenant_id == tenant_id,
                    PharmacyIssueItem.pharmacy_issue_id.in_(pharmacy_issue_ids),
                )
                .order_by(PharmacyIssueItem.created_at)
            ).all()
        )
        if pharmacy_issue_ids
        else []
    )
    medicines = {
        row.id: row
        for row in (
            session.exec(select(MedicineCatalog).where(MedicineCatalog.tenant_id == tenant_id)).all()
            if pharmacy_items
            else []
        )
    }
    pharmacy_invoice_by_issue = {
        invoice.pharmacy_issue_id: invoice for invoice in pharmacy_invoices if invoice.pharmacy_issue_id
    }
    pharmacy_buckets: dict[tuple[str, str], dict] = {}
    for item in pharmacy_items:
        invoice = pharmacy_invoice_by_issue.get(item.pharmacy_issue_id)
        medicine = medicines.get(item.medicine_id or "")
        item_supplier_id = getattr(medicine, "supplier_id", None) if medicine else None
        if supplier_id and (item_supplier_id or "none") != supplier_id:
            continue
        supplier_name = suppliers.get(item_supplier_id or "", "No supplier")
        quantity = int(item.dispensed_quantity or item.quantity or 1)
        line_amount = int(item.unit_price or 0) * quantity
        revenue = allocated_line_revenue(invoice, line_amount) if invoice else 0
        purchase = int(getattr(medicine, "purchase_price", 0) or 0) * quantity if medicine else 0
        key = (item_supplier_id or "none", item.medicine_name)
        bucket = pharmacy_buckets.setdefault(
            key,
            {
                "supplier": supplier_name,
                "item": item.medicine_name,
                "issues": set(),
                "invoices": set(),
                "quantity": 0,
                "item_total": 0,
                "offer": 0,
                "membership": 0,
                "revenue": 0,
                "purchase": 0,
            },
        )
        bucket["issues"].add(item.pharmacy_issue_id)
        if invoice:
            bucket["invoices"].add(invoice.id)
        bucket["quantity"] += quantity
        bucket["item_total"] += line_amount
        bucket["offer"] += allocated_line_offer_discount(invoice, line_amount) if invoice else 0
        bucket["membership"] += allocated_line_membership_benefit(invoice, line_amount) if invoice else 0
        bucket["revenue"] += revenue
        bucket["purchase"] += purchase
    pharmacy_settlement_headers = [
        "Supplier",
        "Medicine",
        "Issues",
        "Invoices",
        "Qty",
        "Item Total",
        "Offer Discount",
        "Membership Benefit",
        "Net Revenue",
        "Purchase Cost",
        "Pharmacy Profit",
    ]
    pharmacy_settlement_rows = [
        [
            row["supplier"],
            row["item"],
            len(row["issues"]),
            len(row["invoices"]),
            row["quantity"],
            row["item_total"],
            row["offer"],
            row["membership"],
            row["revenue"],
            row["purchase"],
            max(row["revenue"] - row["purchase"], 0),
        ]
        for row in sorted(pharmacy_buckets.values(), key=lambda item: item["revenue"] - item["purchase"], reverse=True)
    ]

    period = f"{tenant.name if tenant else tenant_id} | {start.isoformat()} to {end.isoformat()}"
    doctor_suffix = f"-{doctor_id}" if doctor_id else "-all-doctors"
    type_suffix = f"-{invoice_type}" if invoice_type != "overall" else "-overall"
    base = f"{start.isoformat()}-{end.isoformat()}{doctor_suffix}{type_suffix}"
    return [
        (
            f"doctor-settlement-{base}.xls",
            _xls_document(
                "Doctor Settlement",
                period,
                [_table("Doctor Settlement and Profitability", settlement_headers, settlement_rows)],
            ),
        ),
        (
            f"lab-settlement-{base}.xls",
            _xls_document(
                "Lab Settlement",
                period,
                [_table("Lab Test Settlement and Profitability", lab_settlement_headers, lab_settlement_rows)],
            ),
        ),
        (
            f"pharmacy-settlement-{base}.xls",
            _xls_document(
                "Pharmacy Settlement",
                period,
                [_table("Pharmacy Settlement and Profitability", pharmacy_settlement_headers, pharmacy_settlement_rows)],
            ),
        ),
        (
            f"invoice-profit-details-{base}.xls",
            _xls_document(
                "Invoice Profit Details",
                period,
                [_table("Invoice Profit Details", invoice_headers, invoice_rows)],
            ),
        ),
    ]


def send_report_email(
    *,
    recipients: list[str],
    cc: list[str],
    subject: str,
    body: str,
    filename: str | None = None,
    content: bytes | None = None,
    attachments: list[tuple[str, bytes]] | None = None,
) -> str:
    settings = get_settings()
    if not settings.smtp_host:
        raise RuntimeError("SMTP is not configured. Set MEDIZINHUB_SMTP_HOST and SMTP credentials.")
    message = EmailMessage()
    message["Subject"] = subject
    message["From"] = f"{settings.smtp_from_name} <{settings.smtp_from_email}>"
    message["To"] = ", ".join(recipients)
    if cc:
        message["Cc"] = ", ".join(cc)
    message.set_content(body)
    attachment_rows = list(attachments or [])
    if filename and content is not None:
        attachment_rows.append((filename, content))
    for attachment_filename, attachment_content in attachment_rows:
        message.add_attachment(
            attachment_content,
            maintype="application",
            subtype="vnd.ms-excel",
            filename=attachment_filename,
        )
    with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=30) as smtp:
        if settings.smtp_use_tls:
            smtp.starttls()
        if settings.smtp_username:
            smtp.login(settings.smtp_username, settings.smtp_password or "")
        smtp.send_message(message)
    return message["Message-ID"] or ""


def process_report_job(session: Session, job_id: str) -> ReportJob:
    job = session.get(ReportJob, job_id)
    if not job:
        raise RuntimeError(f"Report job {job_id} not found")
    job.status = ReportJobStatus.RUNNING
    job.started_at = now_utc()
    job.updated_at = now_utc()
    session.add(job)
    session.commit()
    try:
        recipients = json.loads(job.recipients_json)
        cc = json.loads(job.cc_json)
        filters = json.loads(job.filters_json)
        start = date.fromisoformat(job.period_start)
        end = date.fromisoformat(job.period_end)
        filename, content = build_monthly_revenue_report(
            session,
            tenant_id=job.tenant_id,
            start=start,
            end=end,
            filters=filters,
        )
        profit_attachments = build_profit_report_email_attachments(
            session,
            tenant_id=job.tenant_id,
            start=start,
            end=end,
        )
        attachments = [(filename, content), *profit_attachments]
        provider_id = send_report_email(
            recipients=recipients,
            cc=cc,
            subject=f"Monthly revenue report: {start.isoformat()} to {end.isoformat()}",
            body=(
                "Please find the monthly revenue report attached. "
                "This email also includes separate Excel files for doctor settlement, "
                "lab settlement, pharmacy settlement, and invoice profit details."
            ),
            attachments=attachments,
        )
        job.status = ReportJobStatus.SENT
        job.attachment_filename = f"{len(attachments)} attachments: {filename}"
        job.provider_message_id = provider_id
        job.sent_at = now_utc()
        job.failure_reason = None
    except Exception as exc:
        job.status = ReportJobStatus.FAILED
        job.failure_reason = str(exc)
    job.updated_at = now_utc()
    session.add(job)
    session.commit()
    session.refresh(job)
    return job


def mark_report_period_sent(
    session: Session,
    *,
    tenant_id: str,
    period_key: str,
    actor_user_id: str | None = None,
) -> None:
    upsert_setting(
        session,
        tenant_id=tenant_id,
        scope=SettingScope.TENANT,
        scope_id=tenant_id,
        module="reports",
        key=SettingKey.REPORT_MONTHLY_EMAIL_LAST_SENT_PERIOD,
        value=period_key,
        actor_user_id=actor_user_id,
    )
