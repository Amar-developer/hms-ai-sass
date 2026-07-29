import json

from app.modules.reports.models import MonthlyRevenueSnapshot, ReportJob
from app.modules.reports.schemas import (
    MonthlyReportConfigRead,
    MonthlyReportFilters,
    MonthlySnapshotRead,
    ReportJobRead,
)


def read_config(raw: dict) -> MonthlyReportConfigRead:
    return MonthlyReportConfigRead(
        enabled=raw["enabled"],
        recipients=raw["recipients"],
        cc=raw["cc"],
        send_day=raw["send_day"],
        filters=MonthlyReportFilters(**raw["filters"]),
        last_sent_period=raw["last_sent_period"],
    )


def read_job(job: ReportJob) -> ReportJobRead:
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
        artifact_file_id=job.artifact_file_id,
        artifact_file_ids=json.loads(job.artifact_file_ids_json or "[]"),
        provider_message_id=job.provider_message_id,
        failure_reason=job.failure_reason,
        queued_by_user_id=job.queued_by_user_id,
        created_at=job.created_at.isoformat(),
        updated_at=job.updated_at.isoformat(),
        started_at=job.started_at.isoformat() if job.started_at else None,
        sent_at=job.sent_at.isoformat() if job.sent_at else None,
    )


def read_snapshot(snapshot: MonthlyRevenueSnapshot) -> MonthlySnapshotRead:
    return MonthlySnapshotRead(
        id=snapshot.id,
        branch_id=snapshot.branch_id,
        period_year=snapshot.period_year,
        period_month=snapshot.period_month,
        period_start=snapshot.period_start,
        period_end=snapshot.period_end,
        period_label=snapshot.period_label,
        invoice_count=snapshot.invoice_count,
        gross_revenue=snapshot.gross_revenue,
        paid_revenue=snapshot.paid_revenue,
        final_profit=snapshot.final_profit,
        metrics=snapshot.metrics_json or {},
        created_at=snapshot.created_at.isoformat(),
        updated_at=snapshot.updated_at.isoformat(),
    )
