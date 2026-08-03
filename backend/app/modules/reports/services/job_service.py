import json
from datetime import date

from fastapi import HTTPException, status
from sqlmodel import Session, select

from app.modules.identity.models import User
from app.modules.files.models import FileDocument
from app.modules.files.services.artifact_service import ArtifactService
from app.modules.notifications.models import (
    DocumentDelivery,
    DocumentDeliveryChannel,
    DocumentDeliveryStatus,
)
from app.modules.notifications.services.document_delivery import queue_document_delivery
from app.modules.reports.models import ReportJob, ReportJobStatus
from app.modules.reports.queue import enqueue_monthly_report_job
from app.modules.reports.repositories import ReportJobRepository
from app.modules.reports.schemas import (
    MonthlyReportSendRequest,
    ReportJobRead,
    ReportResendRequest,
)
from app.modules.reports.services.config_service import load_monthly_report_config
from app.modules.reports.services.monthly_revenue import build_monthly_revenue_report
from app.modules.reports.services.period import previous_month_range
from app.modules.reports.services.profit import build_profit_report_email_attachments
from app.modules.reports.services.read_models import read_job
from app.modules.tenants.models import now_utc


def process_report_job(session: Session, job_id: str) -> ReportJob:
    # Claim under a row lock. Duplicate Redis hints and multiple worker
    # processes are therefore harmless: only a queued job can transition.
    job = session.exec(
        select(ReportJob).where(ReportJob.id == job_id).with_for_update()
    ).first()
    if not job:
        raise RuntimeError(f"Report job {job_id} not found")
    if job.status != ReportJobStatus.QUEUED:
        return job
    job.status = ReportJobStatus.RUNNING
    job.started_at = now_utc()
    job.updated_at = now_utc()
    session.add(job)
    session.commit()
    # queue_document_delivery commits independently. If a worker stopped after
    # that commit but before the final ReportJob update, recovery must reuse the
    # existing outbox row and artifacts instead of generating a second set.
    existing_delivery = session.exec(
        select(DocumentDelivery).where(
            DocumentDelivery.tenant_id == job.tenant_id,
            DocumentDelivery.channel == DocumentDeliveryChannel.EMAIL,
            DocumentDelivery.idempotency_key == f"report-job:{job.id}:email",
        )
    ).first()
    if existing_delivery:
        if existing_delivery.status == DocumentDeliveryStatus.SENT:
            job.status = ReportJobStatus.SENT
            job.sent_at = existing_delivery.sent_at
            job.provider_message_id = existing_delivery.provider_message_id
            job.failure_reason = None
        elif existing_delivery.status == DocumentDeliveryStatus.FAILED:
            job.status = ReportJobStatus.FAILED
            job.failure_reason = existing_delivery.failure_reason
        else:
            job.status = ReportJobStatus.DELIVERING
            job.failure_reason = None
        job.updated_at = now_utc()
        session.add(job)
        session.commit()
        session.refresh(job)
        return job
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
        artifact_service = ArtifactService(session)
        artifact_rows = [
            artifact_service.store_generated(
                tenant_id=job.tenant_id,
                branch_id=job.branch_id,
                file_name=attachment_name,
                data=attachment_content,
                content_type=(
                    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                ),
                category="report",
                source_module="reports",
                attached_to_doctype="ReportJob",
                attached_to_name=job.id,
                attached_to_field=f"attachment_{index}",
                actor_user_id=job.queued_by_user_id,
                notes=(
                    f"Permanent {job.report_type} report for "
                    f"{job.period_start} to {job.period_end}"
                ),
            )
            for index, (attachment_name, attachment_content) in enumerate(attachments)
        ]
        primary = artifact_rows[0]
        job.artifact_file_id = primary.id
        job.artifact_file_ids_json = json.dumps([row.id for row in artifact_rows])
        queue_document_delivery(
            session,
            tenant_id=job.tenant_id,
            branch_id=job.branch_id,
            channel=DocumentDeliveryChannel.EMAIL,
            resource_type="report_job",
            resource_id=job.id,
            artifact_file_id=primary.id,
            artifact_version=primary.document_version,
            artifact_file_ids=[row.id for row in artifact_rows],
            recipient=", ".join([*recipients, *cc]),
            subject=f"Monthly revenue report: {start.isoformat()} to {end.isoformat()}",
            message=(
                "Please find the permanent monthly revenue and settlement reports "
                "attached. Resends reuse these exact stored artifacts."
            ),
            idempotency_key=f"report-job:{job.id}:email",
            queued_by_user_id=job.queued_by_user_id,
        )
        job.status = ReportJobStatus.DELIVERING
        job.attachment_filename = f"{len(attachments)} attachments: {filename}"
        job.provider_message_id = None
        job.sent_at = None
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
        # Redis is only a low-latency wake-up signal. Keeping the durable row
        # queued lets the worker's database fallback pick it up after a cache
        # outage instead of incorrectly declaring the report failed.
        job.failure_reason = f"Queue wake-up unavailable; recovery pending: {exc}"[
            :1000
        ]
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
    if job.artifact_file_id:
        artifact = session.get(FileDocument, job.artifact_file_id)
        if artifact and artifact.tenant_id == tenant_id:
            return artifact.file_name, ArtifactService.read_bytes(artifact)
    return build_monthly_revenue_report(
        session,
        tenant_id=tenant_id,
        start=date.fromisoformat(job.period_start),
        end=date.fromisoformat(job.period_end),
        filters=json.loads(job.filters_json),
    )


def resend_monthly_report_job(
    session: Session,
    *,
    tenant_id: str,
    job_id: str,
    payload: ReportResendRequest,
    actor: User,
) -> ReportJobRead:
    job = ReportJobRepository(session).get_for_tenant(tenant_id, job_id)
    if not job:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Report job not found"
        )
    file_ids = json.loads(job.artifact_file_ids_json or "[]")
    if not job.artifact_file_id or not file_ids:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This report has no permanent artifact to resend",
        )
    recipients = payload.recipients or json.loads(job.recipients_json)
    cc = payload.cc if payload.cc is not None else json.loads(job.cc_json)
    if not recipients:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="At least one recipient email is required.",
        )
    artifact = session.get(FileDocument, job.artifact_file_id)
    if not artifact or artifact.tenant_id != tenant_id:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="The permanent report artifact is unavailable",
        )
    queue_document_delivery(
        session,
        tenant_id=tenant_id,
        branch_id=job.branch_id,
        channel=DocumentDeliveryChannel.EMAIL,
        resource_type="report_job",
        resource_id=job.id,
        artifact_file_id=artifact.id,
        artifact_version=artifact.document_version,
        artifact_file_ids=file_ids,
        recipient=", ".join([*recipients, *cc]),
        subject=(f"Monthly revenue report: {job.period_start} to {job.period_end}"),
        message=(
            "Please find the previously generated permanent report attached. "
            "This resend uses the original stored artifact."
        ),
        idempotency_key=f"report-job:{job.id}:resend:{payload.idempotency_key}",
        queued_by_user_id=actor.id,
    )
    job.status = ReportJobStatus.DELIVERING
    job.failure_reason = None
    job.updated_at = now_utc()
    session.add(job)
    session.commit()
    session.refresh(job)
    return read_job(job)
