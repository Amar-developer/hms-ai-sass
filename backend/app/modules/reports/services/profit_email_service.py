from fastapi import HTTPException, status
from sqlmodel import Session

from app.core.auth import is_tenant_admin_user
from app.modules.identity.models import User
from app.modules.reports.schemas import ProfitReportEmailRead, ProfitReportEmailRequest
from app.modules.reports.services.email_delivery import send_report_email
from app.modules.reports.services.profit import build_profit_report_email_attachments


def send_profit_report(
    session: Session,
    *,
    tenant_id: str,
    payload: ProfitReportEmailRequest,
    actor: User,
) -> ProfitReportEmailRead:
    if actor.is_super_admin or not is_tenant_admin_user(session, actor):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Tenant admin access required"
        )
    if payload.to_date < payload.from_date:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="To date must be after from date.",
        )
    recipients = [
        email.strip()
        for email in (payload.recipients or [actor.email])
        if email.strip()
    ]
    cc = [email.strip() for email in payload.cc if email.strip()]
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
    provider_id = send_report_email(
        recipients=recipients,
        cc=cc,
        subject=f"Healthcare profit report: {payload.from_date.isoformat()} to {payload.to_date.isoformat()}",
        body=(
            "Please find the filtered healthcare profit report attached. "
            "The email includes separate Excel files based on the selected report sections."
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
