import json
import logging
import signal
import threading
from datetime import date, timedelta

from sqlmodel import Session, select

from app.core.config import get_settings
from app.core.database import engine
from app.core.logging import configure_logging
from app.modules.error_logs.service import purge_expired_error_logs
from app.modules.reports.models import ReportJob, ReportJobStatus
from app.modules.reports.queue import (
    dequeue_monthly_report_job,
    enqueue_monthly_report_job,
    record_worker_heartbeat,
    scheduler_lock,
)
from app.modules.reports.service import (
    load_monthly_report_config,
    mark_report_period_sent,
    previous_month_range,
    process_report_job,
    report_period_key,
)
from app.modules.reports.snapshots import archive_due_months
from app.modules.tenants.models import Tenant, TenantStatus, now_utc
from app.modules.identity.models import User
from app.modules.notifications.whatsapp_processor import (
    process_due_whatsapp_notifications,
)
from app.modules.notifications.email_processor import process_due_email_deliveries
from app.modules.notifications.sms_processor import process_due_sms_notifications
from app.modules.integrations.whatsapp.reminders import (
    queue_due_whatsapp_appointment_reminders,
)
from app.modules.integrations.whatsapp.daily_report import (
    queue_due_whatsapp_admin_daily_reports,
)
from app.modules.patient_intelligence.service import (
    refresh_due_patient_intelligence,
)


logger = logging.getLogger("medizinhub.report_worker")
_shutdown = threading.Event()


def _heartbeat_loop() -> None:
    interval = max(get_settings().report_worker_heartbeat_ttl_seconds // 3, 5)
    while not _shutdown.is_set():
        try:
            record_worker_heartbeat()
        except Exception:
            logger.exception("report_worker.heartbeat_failed")
        _shutdown.wait(interval)


def _tenant_admin_user_id(session: Session, tenant_id: str) -> str | None:
    tenant_admin = session.exec(
        select(User)
        .where(
            User.tenant_id == tenant_id,
            User.user_type == "tenant_admin",
            User.is_active == True,  # noqa: E712
        )
        .order_by(User.created_at)
    ).first()
    return tenant_admin.id if tenant_admin else None


def enqueue_due_monthly_reports(session: Session) -> None:
    today = date.today()
    start, end = previous_month_range(today)
    period_key = report_period_key(start, end)
    tenants = session.exec(
        select(Tenant).where(Tenant.status != TenantStatus.SUSPENDED)
    ).all()
    for tenant in tenants:
        config = load_monthly_report_config(session, tenant.id)
        if not config["enabled"] or not config["recipients"]:
            continue
        if int(config["send_day"] or 1) != today.day:
            continue
        if config["last_sent_period"] == period_key:
            continue
        existing = session.exec(
            select(ReportJob).where(
                ReportJob.tenant_id == tenant.id,
                ReportJob.period_start == start.isoformat(),
                ReportJob.period_end == end.isoformat(),
            )
        ).first()
        if existing:
            continue
        job = ReportJob(
            tenant_id=tenant.id,
            period_start=start.isoformat(),
            period_end=end.isoformat(),
            recipients_json=json.dumps(config["recipients"]),
            cc_json=json.dumps(config["cc"]),
            filters_json=json.dumps(config["filters"]),
            queued_by_user_id=_tenant_admin_user_id(session, tenant.id),
        )
        session.add(job)
        session.commit()
        session.refresh(job)
        try:
            enqueue_monthly_report_job(job.id)
        except Exception:
            logger.exception(
                "report_worker.queue_wakeup_failed",
                extra={"report_job_id": job.id},
            )


def recover_stale_report_jobs(session: Session) -> int:
    """Return abandoned RUNNING jobs to the durable queue after their lease."""
    cutoff = now_utc() - timedelta(
        seconds=get_settings().report_job_stale_after_seconds
    )
    jobs = session.exec(
        select(ReportJob)
        .where(
            ReportJob.status == ReportJobStatus.RUNNING,
            ReportJob.started_at <= cutoff,
        )
        .with_for_update(skip_locked=True)
    ).all()
    for job in jobs:
        job.status = ReportJobStatus.QUEUED
        job.started_at = None
        job.failure_reason = "Recovered after an interrupted worker run"
        job.updated_at = now_utc()
        session.add(job)
    if jobs:
        session.commit()
    return len(jobs)


def _next_durable_job_id(session: Session, hinted_job_id: str | None) -> str | None:
    if hinted_job_id:
        hinted = session.get(ReportJob, hinted_job_id)
        if hinted and hinted.status == ReportJobStatus.QUEUED:
            return hinted.id
    row = session.exec(
        select(ReportJob)
        .where(ReportJob.status == ReportJobStatus.QUEUED)
        .order_by(ReportJob.created_at)
        .limit(1)
    ).first()
    return row.id if row else None


def run_once() -> None:
    # A single scheduler lock guards the monthly email digest, the month-end
    # dashboard snapshot, and error-log retention so only one worker runs
    # them per cycle. This is the app's only recurring background worker,
    # so periodic maintenance piggybacks on it rather than standing up a
    # separate scheduler.
    try:
        has_scheduler_lock = scheduler_lock()
    except Exception:
        has_scheduler_lock = False
        logger.exception("report_worker.scheduler_lock_unavailable")
    if has_scheduler_lock:
        with Session(engine) as session:
            enqueue_due_monthly_reports(session)
            # Freeze the just-finished month into income dashboard snapshots
            # once it rolls over (idempotent; skips already-archived tenants).
            archive_due_months(session)
            # Delete error logs past retention (idempotent no-op most cycles).
            purge_expired_error_logs(session)
            queue_due_whatsapp_appointment_reminders(session)
            daily_reports = queue_due_whatsapp_admin_daily_reports(session)
            if daily_reports:
                logger.info(
                    "report_worker.whatsapp_admin_daily_reports_queued",
                    extra={"report_count": daily_reports},
                )
            # Progressively adapt existing HMS records and refresh stale
            # Patient 360 projections without a separate scheduler service.
            refreshed = refresh_due_patient_intelligence(session, limit=500)
            if refreshed:
                logger.info(
                    "report_worker.patient_intelligence_refreshed",
                    extra={"patient_count": refreshed},
                )
            session.commit()
    with Session(engine) as session:
        recovered = recover_stale_report_jobs(session)
        if recovered:
            logger.warning(
                "report_worker.stale_jobs_recovered",
                extra={"recovered_count": recovered},
            )
        process_due_whatsapp_notifications(session)
        process_due_sms_notifications(
            session, limit=get_settings().sms_worker_batch_limit
        )
        process_due_email_deliveries(session)
    try:
        job_id = dequeue_monthly_report_job(timeout=5)
    except Exception:
        job_id = None
        logger.exception("report_worker.queue_dequeue_unavailable")
    with Session(engine) as session:
        job_id = _next_durable_job_id(session, job_id)
    if not job_id:
        return
    with Session(engine) as session:
        job = process_report_job(session, job_id)
        if job.status == ReportJobStatus.SENT:
            mark_report_period_sent(
                session,
                tenant_id=job.tenant_id,
                period_key=report_period_key(
                    date.fromisoformat(job.period_start),
                    date.fromisoformat(job.period_end),
                ),
                actor_user_id=job.queued_by_user_id,
            )
        job.updated_at = now_utc()
        session.add(job)
        session.commit()
    with Session(engine) as session:
        process_due_email_deliveries(session)


def main() -> None:
    def request_shutdown(_signum, _frame) -> None:
        _shutdown.set()

    signal.signal(signal.SIGTERM, request_shutdown)
    signal.signal(signal.SIGINT, request_shutdown)
    heartbeat_thread = threading.Thread(
        target=_heartbeat_loop,
        name="report-worker-heartbeat",
        daemon=True,
    )
    heartbeat_thread.start()
    failure_delay = 1
    while not _shutdown.is_set():
        try:
            run_once()
            failure_delay = 1
        except Exception:
            logger.exception("report_worker.cycle_failed")
            failure_delay = min(failure_delay * 2, 30)
        _shutdown.wait(failure_delay)
    heartbeat_thread.join(timeout=2)


if __name__ == "__main__":
    # This worker runs as its own process (`python -m app.modules.reports.worker`),
    # separate from the FastAPI app in app/main.py — it never imports that
    # module, so the JSON log formatter configured there was never applied
    # here, silently dropping every structured `extra={...}` field (status
    # codes, provider responses, etc.) down to the bare message text.
    configure_logging()
    main()
