from datetime import date, datetime

from sqlmodel import Session

from app.modules.billing.models import InvoiceItem
from app.modules.billing.services.read_models import invoice_read
from app.modules.reports.repositories import ReportDataRepository
from app.modules.reports.services.classification import ReportInvoiceClassifier
from app.modules.reports.services.calculations import (
    allocate_values,
    invoice_approved_discount,
    invoice_billing_discount,
    invoice_due_balance,
    invoice_item_total,
    invoice_membership_benefit,
    invoice_offer_discount,
    invoice_report_total,
    is_paid_invoice,
    report_doctor_fee,
    report_settlement,
    tax_paid_basis,
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
    for invoice in paid_invoices:
        breakdown = invoice_read(session, invoice)
        invoice.__dict__["approved_discount_amount"] = (
            breakdown.approved_discount_amount
        )
        invoice.__dict__["offer_discount_amount"] = breakdown.offer_discount_amount
    invoice_ids = [invoice.id for invoice in paid_invoices]
    payment_modes_by_invoice: dict[str, set[str]] = {
        invoice_id: set() for invoice_id in invoice_ids
    }
    for payment in repo.list_recorded_payments_by_invoice_ids(
        tenant_id=tenant_id, invoice_ids=invoice_ids
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

    def invoice_settlement(invoice) -> int:
        invoice_kind = classifier.classify(invoice)
        return report_settlement(
            invoice, invoice_kind, invoice_items_by_invoice.get(invoice.id, [])
        )

    def invoice_doctor_fee(invoice) -> int:
        return report_doctor_fee(invoice, classifier.classify(invoice))

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
    consultation_invoices = [
        invoice
        for invoice in paid_invoices
        if classifier.classify(invoice) == "consultation"
    ]
    for invoice in consultation_invoices:
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
                "consultation_ids": set(),
                "invoices": 0,
                "gross": 0,
                "paid": 0,
                "balance": 0,
                "offer": 0,
                "approved": 0,
                "billing_discount": 0,
                "membership": 0,
                "payment_modes": set(),
                "doctor_fee": 0,
                "tax": 0,
                "clinic_fee": 0,
                "final_profit": 0,
            },
        )
        paid = int(invoice.paid_amount or 0)
        doctor_fee = invoice_doctor_fee(invoice)
        bucket["invoices"] += 1
        bucket["consultation_ids"].add(
            invoice.appointment_id or invoice.consultation_id or invoice.id
        )
        bucket["gross"] += invoice_report_total(invoice)
        bucket["paid"] += paid
        bucket["balance"] += invoice_due_balance(invoice)
        bucket["offer"] += invoice_offer_discount(invoice)
        bucket["approved"] += invoice_approved_discount(invoice)
        bucket["billing_discount"] += invoice_billing_discount(invoice)
        bucket["membership"] += invoice_membership_benefit(invoice)
        bucket["payment_modes"].add(payment_mode(invoice))
        bucket["doctor_fee"] += doctor_fee
        bucket["tax"] += tax_paid_basis(invoice)
        bucket["clinic_fee"] += int(invoice.clinic_share_amount or 0) or max(
            invoice_report_total(invoice)
            - invoice_membership_benefit(invoice)
            - doctor_fee,
            0,
        )
        bucket["final_profit"] += paid - tax_paid_basis(invoice) - doctor_fee
    for appointment in completed_appointments:
        key = appointment.practitioner_id or "unassigned"
        doctor = doctors.get(key)
        bucket = doctor_buckets.setdefault(
            key,
            {
                "doctor": doctor.full_name if doctor else "Unassigned",
                "consultations": 0,
                "consultation_ids": set(),
                "invoices": 0,
                "gross": 0,
                "paid": 0,
                "balance": 0,
                "offer": 0,
                "approved": 0,
                "billing_discount": 0,
                "membership": 0,
                "payment_modes": set(),
                "doctor_fee": 0,
                "tax": 0,
                "clinic_fee": 0,
                "final_profit": 0,
            },
        )
        bucket["consultation_ids"].add(appointment.id)

    for bucket in doctor_buckets.values():
        bucket["consultations"] = len(bucket["consultation_ids"])

    def percent(value: int, total: int, fallback_total: int = 0) -> str:
        basis = total or fallback_total
        return "0%" if not basis else f"{round((value / basis) * 100)}%"

    settlement_headers = [
        "Doctor",
        "Consultations",
        "Invoices",
        "Gross Revenue",
        "Paid Revenue",
        "Balance",
        "Admin Approved Discount",
        "Offer Discount",
        "Membership Benefit",
        "Total Billing Discount",
        "Mode of Payment",
        "GST from Paid Revenue",
        "Doctor Fee",
        "Doctor Fee %",
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
            row["balance"],
            row["approved"],
            row["offer"],
            row["membership"],
            row["billing_discount"],
            combined_payment_modes(row["payment_modes"]),
            row["tax"],
            row["doctor_fee"],
            percent(row["doctor_fee"], row["paid"] - row["tax"], row["gross"]),
            row["clinic_fee"],
            percent(row["final_profit"], row["paid"] - row["tax"], row["gross"]),
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
                sum(int(row["balance"] or 0) for row in doctor_buckets.values()),
                sum(int(row["approved"] or 0) for row in doctor_buckets.values()),
                sum(int(row["offer"] or 0) for row in doctor_buckets.values()),
                sum(int(row["membership"] or 0) for row in doctor_buckets.values()),
                sum(
                    int(row["billing_discount"] or 0) for row in doctor_buckets.values()
                ),
                "Multiple",
                sum(int(row["tax"] or 0) for row in doctor_buckets.values()),
                total_doctor_fee,
                percent(
                    total_doctor_fee,
                    sum(
                        int(row["paid"] or 0) - int(row["tax"] or 0)
                        for row in doctor_buckets.values()
                    ),
                    total_gross,
                ),
                sum(int(row["clinic_fee"] or 0) for row in doctor_buckets.values()),
                percent(
                    sum(
                        int(row["final_profit"] or 0) for row in doctor_buckets.values()
                    ),
                    sum(
                        int(row["paid"] or 0) - int(row["tax"] or 0)
                        for row in doctor_buckets.values()
                    ),
                    total_gross,
                ),
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
        "Admin Approved Discount",
        "Offer Discount",
        "Membership Benefit",
        "Total Billing Discount",
        "Total",
        "Paid",
        "Balance",
        "Mode of Payment",
        "GST from Paid Revenue",
        "Doctor Fee",
        "Settlement",
        "Settlement %",
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
        settlement = invoice_settlement(invoice)
        doctor_fee = invoice_doctor_fee(invoice)
        paid = int(invoice.paid_amount or 0)
        paid_tax = tax_paid_basis(invoice)
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
                invoice_approved_discount(invoice),
                invoice_offer_discount(invoice),
                invoice_membership_benefit(invoice),
                invoice_billing_discount(invoice),
                invoice_report_total(invoice),
                paid,
                invoice_due_balance(invoice),
                payment_mode(invoice),
                paid_tax,
                doctor_fee,
                settlement,
                percent(settlement, paid, invoice_report_total(invoice)),
                paid - paid_tax - doctor_fee - settlement,
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
                sum(invoice_approved_discount(invoice) for invoice in paid_invoices),
                sum(invoice_offer_discount(invoice) for invoice in paid_invoices),
                sum(invoice_membership_benefit(invoice) for invoice in paid_invoices),
                sum(invoice_billing_discount(invoice) for invoice in paid_invoices),
                sum(invoice_report_total(invoice) for invoice in paid_invoices),
                sum(int(invoice.paid_amount or 0) for invoice in paid_invoices),
                sum(invoice_due_balance(invoice) for invoice in paid_invoices),
                "Multiple",
                sum(tax_paid_basis(invoice) for invoice in paid_invoices),
                sum(invoice_doctor_fee(invoice) for invoice in paid_invoices),
                sum(invoice_settlement(invoice) for invoice in paid_invoices),
                percent(
                    sum(invoice_settlement(invoice) for invoice in paid_invoices),
                    sum(int(invoice.paid_amount or 0) for invoice in paid_invoices),
                    sum(invoice_report_total(invoice) for invoice in paid_invoices),
                ),
                sum(
                    int(invoice.paid_amount or 0)
                    - tax_paid_basis(invoice)
                    - invoice_doctor_fee(invoice)
                    - invoice_settlement(invoice)
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
    lab_allocations: dict[tuple[str, str], tuple[int, ...]] = {}
    for invoice in lab_invoices:
        related_items = [
            item for item in lab_items if item.lab_order_id == invoice.lab_order_id
        ]
        line_amounts = [int(item.price or 0) for item in related_items]
        subtotal = invoice_item_total(invoice)
        offer_values = allocate_values(
            line_amounts, subtotal, invoice_offer_discount(invoice)
        )
        approved_values = allocate_values(
            line_amounts, subtotal, invoice_approved_discount(invoice)
        )
        membership_values = allocate_values(
            line_amounts, subtotal, invoice_membership_benefit(invoice)
        )
        billing_discount_values = allocate_values(
            line_amounts, subtotal, invoice_billing_discount(invoice)
        )
        revenue_values = allocate_values(
            line_amounts, subtotal, int(invoice.paid_amount or 0)
        )
        balance_values = allocate_values(
            line_amounts, subtotal, invoice_due_balance(invoice)
        )
        tax_values = allocate_values(line_amounts, subtotal, tax_paid_basis(invoice))
        for index, item in enumerate(related_items):
            lab_allocations[(invoice.id, item.id)] = (
                approved_values[index],
                offer_values[index],
                membership_values[index],
                billing_discount_values[index],
                revenue_values[index],
                balance_values[index],
                tax_values[index],
            )
    lab_item_mode: str | None = None
    if invoice_type in {"lab", "service"}:
        lab_item_mode = invoice_type
    elif "overall" not in selected_sections:
        if "lab" in selected_sections and "service" not in selected_sections:
            lab_item_mode = "lab"
        elif "service" in selected_sections and "lab" not in selected_sections:
            lab_item_mode = "service"
    lab_buckets: dict[tuple[str, str], dict] = {}
    for item in lab_items:
        if lab_item_mode == "service":
            continue
        if lab_item_mode == "lab" and item.package_id:
            continue
        invoice = lab_invoice_by_order.get(item.lab_order_id)
        catalog_item = (
            lab_packages.get(item.package_id or "")
            if item.package_id
            else lab_tests.get(item.test_id or "")
        )
        billed_items = invoice_items_by_invoice.get(invoice.id, []) if invoice else []
        billed_item = next(
            (
                row
                for row in billed_items
                if row.external_item_code in {item.test_id, item.package_id}
                or row.description == item.test_name
            ),
            None,
        )
        item_supplier_id = (
            billed_item.supplier_id
            if billed_item
            else getattr(catalog_item, "supplier_id", None)
            if catalog_item
            else None
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
            int(billed_item.buying_amount or 0) * int(billed_item.quantity or 1)
            if billed_item
            else int(getattr(catalog_item, "purchase_price", 0) or 0)
            if catalog_item
            else 0
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
                "approved": 0,
                "offer": 0,
                "membership": 0,
                "billing_discount": 0,
                "revenue": 0,
                "balance": 0,
                "payment_modes": set(),
                "purchase": 0,
                "tax": 0,
            },
        )
        bucket["orders"].add(item.lab_order_id)
        allocation = (
            lab_allocations.get((invoice.id, item.id), (0, 0, 0, 0, 0, 0, 0))
            if invoice
            else (0, 0, 0, 0, 0, 0, 0)
        )
        if invoice:
            bucket["invoices"].add(invoice.id)
            bucket["payment_modes"].add(payment_mode(invoice))
        bucket["item_total"] += line_amount
        bucket["approved"] += allocation[0]
        bucket["offer"] += allocation[1]
        bucket["membership"] += allocation[2]
        bucket["billing_discount"] += allocation[3]
        bucket["revenue"] += allocation[4]
        bucket["balance"] += allocation[5]
        bucket["purchase"] += purchase_price
        bucket["tax"] += allocation[6]
    if lab_item_mode == "service":
        for invoice in lab_invoices:
            billed_items = [
                row
                for row in invoice_items_by_invoice.get(invoice.id, [])
                if row.item_type in {"lab", "lab_service"}
            ]
            line_amounts = [int(row.total_amount or 0) for row in billed_items]
            subtotal = invoice_item_total(invoice)
            allocated = [
                allocate_values(line_amounts, subtotal, value)
                for value in (
                    invoice_approved_discount(invoice),
                    invoice_offer_discount(invoice),
                    invoice_membership_benefit(invoice),
                    invoice_billing_discount(invoice),
                    int(invoice.paid_amount or 0),
                    invoice_due_balance(invoice),
                    tax_paid_basis(invoice),
                )
            ]
            for index, billed_item in enumerate(billed_items):
                if billed_item.item_type != "lab_service":
                    continue
                item_supplier_id = billed_item.supplier_id
                if (
                    supplier_filter_ids
                    and (item_supplier_id or "none") not in supplier_filter_ids
                ):
                    continue
                supplier_name = suppliers.get(
                    item_supplier_id or "", "Tenant Hospital / In-house"
                )
                key = (item_supplier_id or "none", billed_item.description)
                bucket = lab_buckets.setdefault(
                    key,
                    {
                        "supplier": supplier_name,
                        "item": billed_item.description,
                        "orders": set(),
                        "invoices": set(),
                        "item_total": 0,
                        "approved": 0,
                        "offer": 0,
                        "membership": 0,
                        "billing_discount": 0,
                        "revenue": 0,
                        "balance": 0,
                        "payment_modes": set(),
                        "purchase": 0,
                        "tax": 0,
                    },
                )
                if invoice.lab_order_id:
                    bucket["orders"].add(invoice.lab_order_id)
                bucket["invoices"].add(invoice.id)
                bucket["payment_modes"].add(payment_mode(invoice))
                bucket["item_total"] += line_amounts[index]
                bucket["approved"] += allocated[0][index]
                bucket["offer"] += allocated[1][index]
                bucket["membership"] += allocated[2][index]
                bucket["billing_discount"] += allocated[3][index]
                bucket["revenue"] += allocated[4][index]
                bucket["balance"] += allocated[5][index]
                bucket["tax"] += allocated[6][index]
                bucket["purchase"] += int(billed_item.buying_amount or 0) * int(
                    billed_item.quantity or 1
                )
    lab_item_heading = (
        "Lab Test"
        if lab_item_mode == "lab"
        else "Service"
        if lab_item_mode == "service"
        else "Lab Test / Service"
    )
    lab_settlement_headers = [
        "Supplier",
        lab_item_heading,
        "Orders",
        "Invoices",
        "Item Total",
        "Admin Approved Discount",
        "Offer Discount",
        "Membership Benefit",
        "Total Billing Discount",
        "Net Revenue",
        "Balance",
        "Mode of Payment",
        "GST from Paid Revenue",
        "Purchase Cost",
        "Settlement %",
        "Lab Profit",
    ]
    lab_settlement_rows = [
        [
            row["supplier"],
            row["item"],
            len(row["orders"]),
            len(row["invoices"]),
            row["item_total"],
            row["approved"],
            row["offer"],
            row["membership"],
            row["billing_discount"],
            row["revenue"],
            row["balance"],
            combined_payment_modes(row["payment_modes"]),
            row["tax"],
            row["purchase"],
            percent(row["purchase"], row["revenue"] - row["tax"], row["item_total"]),
            row["revenue"] - row["tax"] - row["purchase"],
        ]
        for row in sorted(
            lab_buckets.values(),
            key=lambda item: item["revenue"] - item["tax"] - item["purchase"],
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
                sum(int(row["approved"] or 0) for row in lab_buckets.values()),
                sum(int(row["offer"] or 0) for row in lab_buckets.values()),
                sum(int(row["membership"] or 0) for row in lab_buckets.values()),
                sum(int(row["billing_discount"] or 0) for row in lab_buckets.values()),
                sum(int(row["revenue"] or 0) for row in lab_buckets.values()),
                sum(int(row["balance"] or 0) for row in lab_buckets.values()),
                "Multiple",
                sum(int(row["tax"] or 0) for row in lab_buckets.values()),
                sum(int(row["purchase"] or 0) for row in lab_buckets.values()),
                percent(
                    sum(int(row["purchase"] or 0) for row in lab_buckets.values()),
                    sum(
                        int(row["revenue"] or 0) - int(row["tax"] or 0)
                        for row in lab_buckets.values()
                    ),
                    sum(int(row["item_total"] or 0) for row in lab_buckets.values()),
                ),
                sum(
                    int(row["revenue"] or 0)
                    - int(row["tax"] or 0)
                    - int(row["purchase"] or 0)
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
    pharmacy_allocations: dict[tuple[str, str], tuple[int, ...]] = {}
    for invoice in pharmacy_invoices:
        related_items = [
            item
            for item in pharmacy_items
            if item.pharmacy_issue_id == invoice.pharmacy_issue_id
        ]
        line_amounts = [
            int(item.unit_price or 0)
            * int(item.dispensed_quantity or item.quantity or 1)
            for item in related_items
        ]
        subtotal = invoice_item_total(invoice)
        offer_values = allocate_values(
            line_amounts, subtotal, invoice_offer_discount(invoice)
        )
        approved_values = allocate_values(
            line_amounts, subtotal, invoice_approved_discount(invoice)
        )
        membership_values = allocate_values(
            line_amounts, subtotal, invoice_membership_benefit(invoice)
        )
        billing_discount_values = allocate_values(
            line_amounts, subtotal, invoice_billing_discount(invoice)
        )
        revenue_values = allocate_values(
            line_amounts, subtotal, int(invoice.paid_amount or 0)
        )
        balance_values = allocate_values(
            line_amounts, subtotal, invoice_due_balance(invoice)
        )
        tax_values = allocate_values(line_amounts, subtotal, tax_paid_basis(invoice))
        for index, item in enumerate(related_items):
            pharmacy_allocations[(invoice.id, item.id)] = (
                approved_values[index],
                offer_values[index],
                membership_values[index],
                billing_discount_values[index],
                revenue_values[index],
                balance_values[index],
                tax_values[index],
            )
    pharmacy_buckets: dict[tuple[str, str], dict] = {}
    for item in pharmacy_items:
        invoice = pharmacy_invoice_by_issue.get(item.pharmacy_issue_id)
        medicine = medicines.get(item.medicine_id or "")
        billed_items = invoice_items_by_invoice.get(invoice.id, []) if invoice else []
        billed_item = next(
            (row for row in billed_items if row.description == item.medicine_name),
            None,
        )
        item_supplier_id = (
            billed_item.supplier_id
            if billed_item
            else getattr(medicine, "supplier_id", None)
            if medicine
            else None
        )
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
        allocation = (
            pharmacy_allocations.get((invoice.id, item.id), (0, 0, 0, 0, 0, 0, 0))
            if invoice
            else (0, 0, 0, 0, 0, 0, 0)
        )
        revenue = allocation[4]
        purchase = (
            int(billed_item.buying_amount or 0) * int(billed_item.quantity or quantity)
            if billed_item
            else int(getattr(medicine, "purchase_price", 0) or 0) * quantity
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
                "approved": 0,
                "offer": 0,
                "membership": 0,
                "billing_discount": 0,
                "revenue": 0,
                "balance": 0,
                "payment_modes": set(),
                "purchase": 0,
                "tax": 0,
            },
        )
        bucket["issues"].add(item.pharmacy_issue_id)
        if invoice:
            bucket["invoices"].add(invoice.id)
            bucket["payment_modes"].add(payment_mode(invoice))
        bucket["quantity"] += quantity
        bucket["item_total"] += line_amount
        bucket["approved"] += allocation[0]
        bucket["offer"] += allocation[1]
        bucket["membership"] += allocation[2]
        bucket["billing_discount"] += allocation[3]
        bucket["revenue"] += revenue
        bucket["balance"] += allocation[5]
        bucket["purchase"] += purchase
        bucket["tax"] += allocation[6]
    pharmacy_settlement_headers = [
        "Supplier",
        "Medicine",
        "Issues",
        "Invoices",
        "Qty",
        "Item Total",
        "Admin Approved Discount",
        "Offer Discount",
        "Membership Benefit",
        "Total Billing Discount",
        "Net Revenue",
        "Balance",
        "Mode of Payment",
        "GST from Paid Revenue",
        "Purchase Cost",
        "Settlement %",
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
            row["approved"],
            row["offer"],
            row["membership"],
            row["billing_discount"],
            row["revenue"],
            row["balance"],
            combined_payment_modes(row["payment_modes"]),
            row["tax"],
            row["purchase"],
            percent(row["purchase"], row["revenue"] - row["tax"], row["item_total"]),
            row["revenue"] - row["tax"] - row["purchase"],
        ]
        for row in sorted(
            pharmacy_buckets.values(),
            key=lambda item: item["revenue"] - item["tax"] - item["purchase"],
            reverse=True,
        )
    ]

    section_labels = {
        "overall": "Overall",
        "consultation": "Consultations",
        "lab": "Lab",
        "service": "Service",
        "pharmacy": "Pharmacy",
        "home_visit": "Home Visit",
        "home_care": "Home Care",
        "ip": "IP",
        "physiotherapy": "Physiotherapy",
        "lab_suppliers": "Lab Suppliers",
    }
    selected_section_labels = [
        section_labels[section]
        for section in section_labels
        if section in selected_sections
    ]
    active_filter_labels = [
        f"Categories: {', '.join(selected_section_labels)}",
        f"Type: {section_labels.get(invoice_type, invoice_type.title())}",
        f"Doctor: {doctors[doctor_id].full_name if doctor_id in doctors else 'All'}",
    ]
    if supplier_filter_ids:
        active_filter_labels.append(
            "Lab suppliers: "
            + ", ".join(
                "Tenant Hospital / In-house"
                if supplier == "none"
                else suppliers.get(supplier, supplier)
                for supplier in sorted(supplier_filter_ids)
            )
        )
    period = (
        f"{tenant.name if tenant else tenant_id} | {start.isoformat()} to "
        f"{end.isoformat()} | {' | '.join(active_filter_labels)}"
    )
    doctor_suffix = f"-{doctor_id}" if doctor_id else "-all-doctors"
    type_suffix = f"-{invoice_type}" if invoice_type != "overall" else "-overall"
    base = f"{start.isoformat()}-{end.isoformat()}{doctor_suffix}{type_suffix}"
    # Put the row-level filtered invoice file first. Settlement files are
    # summaries (often one row per finalized batch/doctor) and must not appear
    # to be the complete category result when an email client opens attachment 1.
    attachments: list[tuple[str, bytes]] = [
        (
            f"invoice-profit-details-{base}.xls",
            _xls_document(
                "Invoice Profit Details",
                period,
                [_table("Invoice Profit Details", invoice_headers, invoice_rows)],
            ),
        )
    ]
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
        lab_attachment_name = (
            "service-settlement"
            if lab_item_mode == "service"
            else "lab-test-settlement"
            if lab_item_mode == "lab"
            else "lab-service-settlement"
        )
        lab_report_title = (
            "Service Settlement"
            if lab_item_mode == "service"
            else "Lab Test Settlement"
            if lab_item_mode == "lab"
            else "Lab / Service Settlement"
        )
        attachments.append(
            (
                f"{lab_attachment_name}-{base}.xls",
                _xls_document(
                    lab_report_title,
                    period,
                    [
                        _table(
                            f"{lab_report_title} and Profitability",
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
    return attachments
