import json
import time
from datetime import date

from sqlmodel import Session, select

from app.core.database import engine
from app.modules.error_logs.service import purge_expired_error_logs
from app.modules.reports.models import ReportJob, ReportJobStatus
from app.modules.reports.queue import (
    dequeue_monthly_report_job,
    enqueue_monthly_report_job,
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
        )
        session.add(job)
        session.commit()
        session.refresh(job)
        enqueue_monthly_report_job(job.id)


def run_once() -> None:
    # A single scheduler lock guards the monthly email digest, the month-end
    # dashboard snapshot, and error-log retention so only one worker runs
    # them per cycle. This is the app's only recurring background worker,
    # so periodic maintenance piggybacks on it rather than standing up a
    # separate scheduler.
    if scheduler_lock():
        with Session(engine) as session:
            enqueue_due_monthly_reports(session)
            # Freeze the just-finished month into income dashboard snapshots
            # once it rolls over (idempotent; skips already-archived tenants).
            archive_due_months(session)
            # Delete error logs past retention (idempotent no-op most cycles).
            purge_expired_error_logs(session)
    job_id = dequeue_monthly_report_job(timeout=5)
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


def main() -> None:
    while True:
        run_once()
        time.sleep(1)


if __name__ == "__main__":
    main()
