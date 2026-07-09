from datetime import date, datetime

from sqlmodel import Session

from app.modules.billing.models import InvoiceItem
from app.modules.reports.repositories import ReportDataRepository
from app.modules.reports.services.classification import ReportInvoiceClassifier
from app.modules.reports.services.calculations import (
    allocated_line_membership_benefit,
    allocated_line_offer_discount,
    allocated_line_revenue,
    invoice_item_total,
    invoice_membership_benefit,
    invoice_offer_discount,
    is_paid_invoice,
    settlement_paid_basis,
)
from app.modules.reports.services.rendering import table as _table
from app.modules.reports.services.rendering import xls_document as _xls_document


def build_profit_report_email_attachments(
    session: Session,
    *,
    tenant_id: str,
    start: date,
    end: date,
    doctor_id: str | None = None,
    invoice_type: str = "overall",
    supplier_id: str | None = None,
    supplier_ids: list[str] | None = None,
    report_sections: list[str] | None = None,
    branch_id: str | None = None,
) -> list[tuple[str, bytes]]:
    repo = ReportDataRepository(session)
    tenant = repo.get_tenant(tenant_id)
    invoices = repo.list_invoices_for_period(
        tenant_id=tenant_id,
        start_at=datetime.combine(start, datetime.min.time()),
        end_at=datetime.combine(end, datetime.max.time()),
    )
    paid_invoices = [invoice for invoice in invoices if is_paid_invoice(invoice)]
    if branch_id:
        paid_invoices = [
            invoice for invoice in paid_invoices if invoice.branch_id == branch_id
        ]
    invoice_ids = [invoice.id for invoice in paid_invoices]
    invoice_items_by_invoice: dict[str, list[InvoiceItem]] = {
        invoice.id: [] for invoice in paid_invoices
    }
    for item in repo.list_invoice_items_by_invoice_ids(
        tenant_id=tenant_id, invoice_ids=invoice_ids
    ):
        invoice_items_by_invoice.setdefault(item.invoice_id, []).append(item)

    allowed_sections = {
        "overall",
        "consultation",
        "lab",
        "service",
        "pharmacy",
        "home_visit",
        "home_care",
        "ip",
        "physiotherapy",
        "lab_suppliers",
    }
    selected_sections = {
        section for section in (report_sections or []) if section in allowed_sections
    } or {"overall", "consultation", "lab", "service", "pharmacy"}
    supplier_filter_ids = {
        supplier for supplier in (supplier_ids or []) if supplier and supplier != "all"
    }
    pharmacy_supplier_filter_ids: set[str] = set()
    if supplier_id:
        supplier_filter_ids.add(supplier_id)
        pharmacy_supplier_filter_ids.add(supplier_id)
    classifier = ReportInvoiceClassifier(invoice_items_by_invoice)

    if invoice_type in {
        "consultation",
        "lab",
        "service",
        "pharmacy",
        "home_visit",
        "home_care",
        "ip",
        "physiotherapy",
    }:
        paid_invoices = [
            invoice
            for invoice in paid_invoices
            if classifier.classify(invoice)
            == ("lab" if invoice_type == "service" else invoice_type)
        ]
    elif "overall" not in selected_sections:
        selected_invoice_types = set()
        if "consultation" in selected_sections:
            selected_invoice_types.add("consultation")
        if (
            "lab" in selected_sections
            or "service" in selected_sections
            or "lab_suppliers" in selected_sections
        ):
            selected_invoice_types.add("lab")
        for value in ("pharmacy", "home_visit", "home_care", "ip", "physiotherapy"):
            if value in selected_sections:
                selected_invoice_types.add(value)
        paid_invoices = [
            invoice
            for invoice in paid_invoices
            if classifier.classify(invoice) in selected_invoice_types
        ]

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
    if doctor_id:
        paid_invoices = [
            invoice
            for invoice in paid_invoices
            if appointments.get(invoice.appointment_id or "")
            and appointments[invoice.appointment_id or ""].practitioner_id == doctor_id
        ]
    patients = {
        row.id: row
        for row in repo.list_patients_by_ids(
            tenant_id=tenant_id,
            patient_ids=[invoice.patient_id for invoice in paid_invoices],
        )
    }
    doctors = {row.id: row for row in repo.list_practitioners(tenant_id=tenant_id)}

    completed_appointments = repo.list_completed_appointments(
        tenant_id=tenant_id,
        start=start,
        end=end,
        doctor_id=doctor_id,
        branch_id=branch_id,
    )

    doctor_buckets: dict[str, dict] = {}
    for invoice in paid_invoices:
        appointment = appointments.get(invoice.appointment_id or "")
        key = (
            appointment.practitioner_id
            if appointment and appointment.practitioner_id
            else "unassigned"
        )
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
        bucket["clinic_fee"] += int(invoice.clinic_share_amount or 0) or max(
            int(invoice.total_amount or 0) - doctor_fee, 0
        )
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
        for row in sorted(
            doctor_buckets.values(), key=lambda item: item["final_profit"], reverse=True
        )
    ]
    if settlement_rows:
        total_gross = sum(int(row["gross"] or 0) for row in doctor_buckets.values())
        total_doctor_fee = sum(
            int(row["doctor_fee"] or 0) for row in doctor_buckets.values()
        )
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
        doctor = (
            doctors.get(appointment.practitioner_id)
            if appointment and appointment.practitioner_id
            else None
        )
        settlement = settlement_paid_basis(invoice)
        paid = int(invoice.paid_amount or 0)
        invoice_rows.append(
            [
                invoice.invoice_number,
                invoice.created_at.date().isoformat(),
                classifier.label(classifier.classify(invoice)),
                patient.full_name if patient else invoice.patient_id,
                doctor.full_name if doctor else "Unassigned",
                invoice.status.value
                if hasattr(invoice.status, "value")
                else invoice.status,
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
                sum(
                    max(
                        int(invoice.paid_amount or 0) - settlement_paid_basis(invoice),
                        0,
                    )
                    for invoice in paid_invoices
                ),
            ]
        )

    lab_invoices = [invoice for invoice in paid_invoices if invoice.lab_order_id]
    lab_order_ids = [
        invoice.lab_order_id for invoice in lab_invoices if invoice.lab_order_id
    ]
    lab_items = repo.list_lab_order_items(
        tenant_id=tenant_id, lab_order_ids=lab_order_ids
    )
    lab_tests = {
        row.id: row
        for row in (repo.list_lab_tests(tenant_id=tenant_id) if lab_items else [])
    }
    lab_packages = {
        row.id: row
        for row in (repo.list_lab_packages(tenant_id=tenant_id) if lab_items else [])
    }
    suppliers = {
        row.id: row.name
        for row in (
            repo.list_pharmacy_suppliers(tenant_id=tenant_id) if paid_invoices else []
        )
    }
    lab_invoice_by_order = {
        invoice.lab_order_id: invoice
        for invoice in lab_invoices
        if invoice.lab_order_id
    }
    lab_buckets: dict[tuple[str, str], dict] = {}
    for item in lab_items:
        invoice = lab_invoice_by_order.get(item.lab_order_id)
        catalog_item = (
            lab_packages.get(item.package_id or "")
            if item.package_id
            else lab_tests.get(item.test_id or "")
        )
        item_supplier_id = (
            getattr(catalog_item, "supplier_id", None) if catalog_item else None
        )
        if (
            supplier_filter_ids
            and (item_supplier_id or "none") not in supplier_filter_ids
        ):
            continue
        supplier_name = suppliers.get(
            item_supplier_id or "", "Tenant Hospital / In-house"
        )
        purchase_price = (
            int(getattr(catalog_item, "purchase_price", 0) or 0) if catalog_item else 0
        )
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
        bucket["offer"] += (
            allocated_line_offer_discount(invoice, line_amount) if invoice else 0
        )
        bucket["membership"] += (
            allocated_line_membership_benefit(invoice, line_amount) if invoice else 0
        )
        bucket["revenue"] += (
            allocated_line_revenue(invoice, line_amount) if invoice else 0
        )
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
        for row in sorted(
            lab_buckets.values(),
            key=lambda item: item["revenue"] - item["purchase"],
            reverse=True,
        )
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
                sum(
                    max(int(row["revenue"] or 0) - int(row["purchase"] or 0), 0)
                    for row in lab_buckets.values()
                ),
            ]
        )

    pharmacy_invoices = [
        invoice for invoice in paid_invoices if invoice.pharmacy_issue_id
    ]
    pharmacy_issue_ids = [
        invoice.pharmacy_issue_id
        for invoice in pharmacy_invoices
        if invoice.pharmacy_issue_id
    ]
    pharmacy_items = repo.list_pharmacy_issue_items(
        tenant_id=tenant_id, pharmacy_issue_ids=pharmacy_issue_ids
    )
    medicines = {
        row.id: row
        for row in (repo.list_medicines(tenant_id=tenant_id) if pharmacy_items else [])
    }
    pharmacy_invoice_by_issue = {
        invoice.pharmacy_issue_id: invoice
        for invoice in pharmacy_invoices
        if invoice.pharmacy_issue_id
    }
    pharmacy_buckets: dict[tuple[str, str], dict] = {}
    for item in pharmacy_items:
        invoice = pharmacy_invoice_by_issue.get(item.pharmacy_issue_id)
        medicine = medicines.get(item.medicine_id or "")
        item_supplier_id = getattr(medicine, "supplier_id", None) if medicine else None
        if (
            pharmacy_supplier_filter_ids
            and (item_supplier_id or "none") not in pharmacy_supplier_filter_ids
        ):
            continue
        supplier_name = suppliers.get(
            item_supplier_id or "", "Tenant Hospital / In-house"
        )
        quantity = int(item.dispensed_quantity or item.quantity or 1)
        line_amount = int(item.unit_price or 0) * quantity
        revenue = allocated_line_revenue(invoice, line_amount) if invoice else 0
        purchase = (
            int(getattr(medicine, "purchase_price", 0) or 0) * quantity
            if medicine
            else 0
        )
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
        bucket["offer"] += (
            allocated_line_offer_discount(invoice, line_amount) if invoice else 0
        )
        bucket["membership"] += (
            allocated_line_membership_benefit(invoice, line_amount) if invoice else 0
        )
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
        for row in sorted(
            pharmacy_buckets.values(),
            key=lambda item: item["revenue"] - item["purchase"],
            reverse=True,
        )
    ]

    period = f"{tenant.name if tenant else tenant_id} | {start.isoformat()} to {end.isoformat()}"
    doctor_suffix = f"-{doctor_id}" if doctor_id else "-all-doctors"
    type_suffix = f"-{invoice_type}" if invoice_type != "overall" else "-overall"
    base = f"{start.isoformat()}-{end.isoformat()}{doctor_suffix}{type_suffix}"
    attachments: list[tuple[str, bytes]] = []
    if "overall" in selected_sections or "consultation" in selected_sections:
        attachments.append(
            (
                f"doctor-settlement-{base}.xls",
                _xls_document(
                    "Doctor Settlement",
                    period,
                    [
                        _table(
                            "Doctor Settlement and Profitability",
                            settlement_headers,
                            settlement_rows,
                        )
                    ],
                ),
            )
        )
    if (
        "overall" in selected_sections
        or "lab" in selected_sections
        or "service" in selected_sections
        or "lab_suppliers" in selected_sections
    ):
        attachments.append(
            (
                f"lab-settlement-{base}.xls",
                _xls_document(
                    "Lab Settlement",
                    period,
                    [
                        _table(
                            "Lab Test Settlement and Profitability",
                            lab_settlement_headers,
                            lab_settlement_rows,
                        )
                    ],
                ),
            )
        )
    if "overall" in selected_sections or "pharmacy" in selected_sections:
        attachments.append(
            (
                f"pharmacy-settlement-{base}.xls",
                _xls_document(
                    "Pharmacy Settlement",
                    period,
                    [
                        _table(
                            "Pharmacy Settlement and Profitability",
                            pharmacy_settlement_headers,
                            pharmacy_settlement_rows,
                        )
                    ],
                ),
            )
        )
    attachments.append(
        (
            f"invoice-profit-details-{base}.xls",
            _xls_document(
                "Invoice Profit Details",
                period,
                [_table("Invoice Profit Details", invoice_headers, invoice_rows)],
            ),
        )
    )
    return attachments
