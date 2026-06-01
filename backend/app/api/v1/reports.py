import json
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from pydantic import BaseModel, Field
from sqlmodel import Session, select

from app.core.auth import is_tenant_admin_user, require_any_permission, require_permission
from app.core.database import get_session
from app.core.tenant_context import require_tenant_id
from app.modules.identity import permissions
from app.modules.identity.models import User
from app.modules.reports.models import ReportJob, ReportJobStatus
from app.modules.reports.queue import enqueue_monthly_report_job
from app.modules.reports.service import (
    build_profit_report_email_attachments,
    build_monthly_revenue_report,
    load_monthly_report_config,
    previous_month_range,
    save_monthly_report_config,
    send_report_email,
)
from app.modules.tenants.models import now_utc

router = APIRouter(prefix="/reports")


class MonthlyReportFilters(BaseModel):
    overall: bool = True
    doctor: bool = True
    department: bool = True
    invoice: bool = True


class MonthlyReportConfigRead(BaseModel):
    enabled: bool = False
    recipients: list[str] = Field(default_factory=list)
    cc: list[str] = Field(default_factory=list)
    send_day: int = 1
    filters: MonthlyReportFilters = Field(default_factory=MonthlyReportFilters)
    last_sent_period: str = ""


class MonthlyReportConfigUpdate(BaseModel):
    enabled: bool = False
    recipients: list[str] = Field(default_factory=list)
    cc: list[str] = Field(default_factory=list)
    send_day: int = Field(default=1, ge=1, le=28)
    filters: MonthlyReportFilters = Field(default_factory=MonthlyReportFilters)


class MonthlyReportSendRequest(BaseModel):
    recipients: list[str] | None = None
    cc: list[str] | None = None
    from_date: date | None = None
    to_date: date | None = None
    filters: MonthlyReportFilters | None = None


class ProfitReportEmailRequest(BaseModel):
    recipients: list[str] | None = None
    cc: list[str] = Field(default_factory=list)
    from_date: date
    to_date: date
    doctor_id: str | None = None
    invoice_type: str = "overall"
    supplier_id: str | None = None
    branch_id: str | None = None


class ProfitReportEmailRead(BaseModel):
    sent: bool
    recipients: list[str]
    cc: list[str]
    attachment_filenames: list[str]
    provider_message_id: str


class ReportJobRead(BaseModel):
    id: str
    tenant_id: str
    branch_id: str | None
    status: ReportJobStatus
    report_type: str
    period_start: str
    period_end: str
    recipients: list[str]
    cc: list[str]
    filters: dict
    attachment_filename: str | None
    provider_message_id: str | None
    failure_reason: str | None
    queued_by_user_id: str | None
    created_at: str
    updated_at: str
    started_at: str | None
    sent_at: str | None


def _read_config(raw: dict) -> MonthlyReportConfigRead:
    return MonthlyReportConfigRead(
        enabled=raw["enabled"],
        recipients=raw["recipients"],
        cc=raw["cc"],
        send_day=raw["send_day"],
        filters=MonthlyReportFilters(**raw["filters"]),
        last_sent_period=raw["last_sent_period"],
    )


def _read_job(job: ReportJob) -> ReportJobRead:
    return ReportJobRead(
        id=job.id,
        tenant_id=job.tenant_id,
        branch_id=job.branch_id,
        status=job.status,
        report_type=job.report_type,
        period_start=job.period_start,
        period_end=job.period_end,
        recipients=json.loads(job.recipients_json),
        cc=json.loads(job.cc_json),
        filters=json.loads(job.filters_json),
        attachment_filename=job.attachment_filename,
        provider_message_id=job.provider_message_id,
        failure_reason=job.failure_reason,
        queued_by_user_id=job.queued_by_user_id,
        created_at=job.created_at.isoformat(),
        updated_at=job.updated_at.isoformat(),
        started_at=job.started_at.isoformat() if job.started_at else None,
        sent_at=job.sent_at.isoformat() if job.sent_at else None,
    )


@router.get(
    "/monthly-email/config",
    response_model=MonthlyReportConfigRead,
    dependencies=[Depends(require_permission(permissions.SETTINGS_MANAGE))],
)
def get_monthly_report_config(
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    _current_user: User = Depends(require_permission(permissions.SETTINGS_MANAGE)),
) -> MonthlyReportConfigRead:
    return _read_config(load_monthly_report_config(session, tenant_id))


@router.put(
    "/monthly-email/config",
    response_model=MonthlyReportConfigRead,
    dependencies=[Depends(require_permission(permissions.SETTINGS_MANAGE))],
)
def update_monthly_report_config(
    payload: MonthlyReportConfigUpdate,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permission(permissions.SETTINGS_MANAGE)),
) -> MonthlyReportConfigRead:
    saved = save_monthly_report_config(
        session,
        tenant_id=tenant_id,
        recipients=[str(email) for email in payload.recipients],
        cc=[str(email) for email in payload.cc],
        enabled=payload.enabled,
        send_day=payload.send_day,
        filters=payload.filters.model_dump(),
        actor_user_id=current_user.id,
    )
    return _read_config(saved)


@router.post(
    "/monthly-email/send",
    response_model=ReportJobRead,
    status_code=status.HTTP_202_ACCEPTED,
)
def send_monthly_report_now(
    payload: MonthlyReportSendRequest,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(
        require_any_permission(permissions.REPORTS_READ, permissions.SETTINGS_MANAGE, permissions.BILLING_MANAGE)
    ),
) -> ReportJobRead:
    config = load_monthly_report_config(session, tenant_id)
    start, end = previous_month_range()
    recipients = [str(email) for email in payload.recipients] if payload.recipients is not None else config["recipients"]
    cc = [str(email) for email in payload.cc] if payload.cc is not None else config["cc"]
    if not recipients:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="At least one recipient email is required.")
    if payload.from_date:
        start = payload.from_date
    if payload.to_date:
        end = payload.to_date
    filters = payload.filters.model_dump() if payload.filters else config["filters"]
    job = ReportJob(
        tenant_id=tenant_id,
        status=ReportJobStatus.QUEUED,
        period_start=start.isoformat(),
        period_end=end.isoformat(),
        recipients_json=json.dumps(recipients),
        cc_json=json.dumps(cc),
        filters_json=json.dumps(filters),
        queued_by_user_id=current_user.id,
    )
    session.add(job)
    session.commit()
    session.refresh(job)
    try:
        enqueue_monthly_report_job(job.id)
    except Exception as exc:
        job.status = ReportJobStatus.FAILED
        job.failure_reason = str(exc)
        job.updated_at = now_utc()
        session.add(job)
        session.commit()
        session.refresh(job)
    return _read_job(job)


@router.post("/profit-email/send", response_model=ProfitReportEmailRead)
def send_profit_report_now(
    payload: ProfitReportEmailRequest,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permission(permissions.REPORTS_READ)),
) -> ProfitReportEmailRead:
    if current_user.is_super_admin or not is_tenant_admin_user(session, current_user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant admin access required")
    if payload.to_date < payload.from_date:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="To date must be after from date.")
    recipients = [email.strip() for email in (payload.recipients or [current_user.email]) if email.strip()]
    cc = [email.strip() for email in payload.cc if email.strip()]
    if not recipients:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="At least one recipient email is required.")
    doctor_id = None if payload.doctor_id in (None, "", "all") else payload.doctor_id
    invoice_type = payload.invoice_type if payload.invoice_type in {"overall", "consultation", "lab", "pharmacy"} else "overall"
    supplier_id = None if payload.supplier_id in (None, "", "all") else payload.supplier_id
    branch_id = None if payload.branch_id in (None, "", "all") else payload.branch_id
    attachments = build_profit_report_email_attachments(
        session,
        tenant_id=tenant_id,
        start=payload.from_date,
        end=payload.to_date,
        doctor_id=doctor_id,
        invoice_type=invoice_type,
        supplier_id=supplier_id,
        branch_id=branch_id,
    )
    provider_id = send_report_email(
        recipients=recipients,
        cc=cc,
        subject=f"Healthcare profit report: {payload.from_date.isoformat()} to {payload.to_date.isoformat()}",
        body=(
            "Please find the filtered healthcare profit report attached. "
            "The email includes separate Excel files for doctor settlement, lab settlement, pharmacy settlement, and invoice profit details."
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


@router.get("/monthly-email/jobs", response_model=list[ReportJobRead])
def list_monthly_report_jobs(
    tenant_id: str = Depends(require_tenant_id),
    limit: int = Query(default=10, ge=1, le=50),
    session: Session = Depends(get_session),
    _current_user: User = Depends(
        require_any_permission(permissions.REPORTS_READ, permissions.SETTINGS_MANAGE, permissions.BILLING_MANAGE)
    ),
) -> list[ReportJobRead]:
    jobs = list(
        session.exec(
            select(ReportJob)
            .where(ReportJob.tenant_id == tenant_id)
            .order_by(ReportJob.created_at.desc())
            .limit(limit)
        ).all()
    )
    return [_read_job(job) for job in jobs]


@router.get("/monthly-email/jobs/{job_id}/download")
def download_monthly_report_job(
    job_id: str,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    _current_user: User = Depends(
        require_any_permission(permissions.REPORTS_READ, permissions.SETTINGS_MANAGE, permissions.BILLING_MANAGE)
    ),
) -> Response:
    job = session.get(ReportJob, job_id)
    if not job or job.tenant_id != tenant_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Report job not found")
    filename, content = build_monthly_revenue_report(
        session,
        tenant_id=tenant_id,
        start=date.fromisoformat(job.period_start),
        end=date.fromisoformat(job.period_end),
        filters=json.loads(job.filters_json),
    )
    return Response(
        content=content,
        media_type="application/vnd.ms-excel",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
