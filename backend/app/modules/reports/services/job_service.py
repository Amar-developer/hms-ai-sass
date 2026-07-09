import json
from datetime import date

from fastapi import HTTPException, status
from sqlmodel import Session

from app.modules.identity.models import User
from app.modules.reports.models import ReportJob, ReportJobStatus
from app.modules.reports.queue import enqueue_monthly_report_job
from app.modules.reports.repositories import ReportJobRepository
from app.modules.reports.schemas import MonthlyReportSendRequest, ReportJobRead
from app.modules.reports.services.config_service import load_monthly_report_config
from app.modules.reports.services.email_delivery import send_report_email
from app.modules.reports.services.monthly_revenue import build_monthly_revenue_report
from app.modules.reports.services.period import previous_month_range
from app.modules.reports.services.profit import build_profit_report_email_attachments
from app.modules.reports.services.read_models import read_job
from app.modules.tenants.models import now_utc


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


def queue_monthly_report(
    session: Session,
    *,
    tenant_id: str,
    payload: MonthlyReportSendRequest,
    actor: User,
) -> ReportJobRead:
    config = load_monthly_report_config(session, tenant_id)
    start, end = previous_month_range()
    recipients = (
        [str(email) for email in payload.recipients]
        if payload.recipients is not None
        else config["recipients"]
    )
    cc = (
        [str(email) for email in payload.cc] if payload.cc is not None else config["cc"]
    )
    if not recipients:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="At least one recipient email is required.",
        )
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
        queued_by_user_id=actor.id,
    )
    ReportJobRepository(session).add(job)
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
    return read_job(job)


def list_monthly_report_jobs(
    session: Session, *, tenant_id: str, limit: int
) -> list[ReportJobRead]:
    jobs = ReportJobRepository(session).list_for_tenant(
        tenant_id=tenant_id,
        limit=limit,
    )
    return [read_job(job) for job in jobs]


def download_monthly_report_job(
    session: Session, *, tenant_id: str, job_id: str
) -> tuple[str, bytes]:
    job = ReportJobRepository(session).get_for_tenant(tenant_id, job_id)
    if not job:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Report job not found"
        )
    return build_monthly_revenue_report(
        session,
        tenant_id=tenant_id,
        start=date.fromisoformat(job.period_start),
        end=date.fromisoformat(job.period_end),
        filters=json.loads(job.filters_json),
    )
