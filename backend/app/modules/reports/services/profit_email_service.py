import re

from fastapi import HTTPException, status
from sqlmodel import Session

from app.modules.identity.models import User
from app.modules.reports.schemas import ProfitReportEmailRead, ProfitReportEmailRequest
from app.modules.reports.services.config_service import load_monthly_report_config
from app.modules.reports.services.email_delivery import send_report_email
from app.modules.reports.services.profit import build_profit_report_email_attachments
from app.modules.reports.services.rendering import table, xls_document


def send_profit_report(
    session: Session,
    *,
    tenant_id: str,
    payload: ProfitReportEmailRequest,
    actor: User,
) -> ProfitReportEmailRead:
    if payload.to_date < payload.from_date:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="To date must be after from date.",
        )
    monthly_config = load_monthly_report_config(session, tenant_id)
    configured_recipients = monthly_config.get("recipients", [])
    configured_cc = monthly_config.get("cc", [])
    recipient_source = (
        payload.recipients
        if payload.recipients
        else configured_recipients or ([actor.email] if actor.email else [])
    )
    cc_source = payload.cc if payload.cc is not None else configured_cc
    recipients = [email.strip() for email in recipient_source if email.strip()]
    cc = [email.strip() for email in cc_source if email.strip()]
    if not recipients:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="At least one recipient email is required.",
        )
    doctor_id = None if payload.doctor_id in (None, "", "all") else payload.doctor_id
    invoice_type = (
        payload.invoice_type
        if payload.invoice_type
        in {
            "overall",
            "consultation",
            "lab",
            "service",
            "pharmacy",
            "home_visit",
            "home_care",
            "ip",
            "physiotherapy",
        }
        else "overall"
    )
    supplier_id = (
        None if payload.supplier_id in (None, "", "all") else payload.supplier_id
    )
    supplier_ids = [
        supplier for supplier in payload.supplier_ids if supplier and supplier != "all"
    ]
    branch_id = None if payload.branch_id in (None, "", "all") else payload.branch_id
    if payload.table_headers:
        expected_cells = len(payload.table_headers)
        if any(len(row) != expected_cells for row in payload.table_rows):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Every report row must match the visible table columns.",
            )
        if payload.summary_headers and any(
            len(row) != len(payload.summary_headers) for row in payload.summary_rows
        ):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Every summary row must match the summary columns.",
            )
        report_title = payload.report_title or "Healthcare Profit Report"
        table_title = payload.table_title or report_title
        sections = []
        if payload.summary_headers:
            sections.append(
                table("Filtered Summary", payload.summary_headers, payload.summary_rows)
            )
        sections.append(table(table_title, payload.table_headers, payload.table_rows))
        safe_name = re.sub(
            r"[^a-z0-9-]+",
            "-",
            (payload.export_name or "filtered-report").lower(),
        ).strip("-")
        attachments = [
            (
                f"{safe_name or 'filtered-report'}.xls",
                xls_document(
                    report_title,
                    payload.filter_description
                    or f"{payload.from_date.isoformat()} to {payload.to_date.isoformat()}",
                    sections,
                ),
            )
        ]
    else:
        attachments = build_profit_report_email_attachments(
            session,
            tenant_id=tenant_id,
            start=payload.from_date,
            end=payload.to_date,
            doctor_id=doctor_id,
            invoice_type=invoice_type,
            supplier_id=supplier_id,
            supplier_ids=supplier_ids,
            report_sections=payload.report_sections,
            branch_id=branch_id,
        )
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
    selected_sections = [
        section_labels[value]
        for value in section_labels
        if value in payload.report_sections
    ] or ["Overall"]
    provider_id = send_report_email(
        recipients=recipients,
        cc=cc,
        subject=f"Healthcare profit report: {payload.from_date.isoformat()} to {payload.to_date.isoformat()}",
        body=(
            "Please find the filtered healthcare profit report attached.\n\n"
            f"Selected categories: {', '.join(selected_sections)}\n"
            f"Date range: {payload.from_date.isoformat()} to "
            f"{payload.to_date.isoformat()}\n"
            f"Type filter: {section_labels.get(invoice_type, invoice_type.title())}\n\n"
            "The attached Excel file contains the same columns, filtered rows, "
            "and totals shown in the report table."
        ),
        attachments=attachments,
    )
    return ProfitReportEmailRead(
        sent=True,
        recipients=recipients,
        cc=cc,
        attachment_filenames=[filename for filename, _content in attachments],
        provider_message_id=provider_id,
    )
