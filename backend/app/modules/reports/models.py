from datetime import datetime
from enum import Enum

from sqlmodel import Field, SQLModel
from sqlalchemy import Column, UniqueConstraint
from sqlalchemy import JSON as SAJSON

from app.modules.tenants.models import new_id, now_utc


class ReportJobStatus(str, Enum):
    QUEUED = "queued"
    RUNNING = "running"
    DELIVERING = "delivering"
    SENT = "sent"
    FAILED = "failed"


class ReportJob(SQLModel, table=True):
    id: str = Field(default_factory=lambda: new_id("reportjob"), primary_key=True)
    tenant_id: str = Field(index=True, foreign_key="tenant.id")
    branch_id: str | None = Field(default=None, index=True, foreign_key="branch.id")
    status: ReportJobStatus = Field(default=ReportJobStatus.QUEUED, index=True)
    report_type: str = Field(default="monthly_revenue", index=True, max_length=80)
    period_start: str = Field(index=True, max_length=10)
    period_end: str = Field(index=True, max_length=10)
    recipients_json: str = Field(default="[]")
    cc_json: str = Field(default="[]")
    filters_json: str = Field(default="{}")
    attachment_filename: str | None = Field(default=None, max_length=220)
    artifact_file_id: str | None = Field(
        default=None, index=True, foreign_key="filedocument.id"
    )
    artifact_file_ids_json: str = Field(default="[]")
    provider_message_id: str | None = Field(default=None, max_length=160)
    failure_reason: str | None = Field(default=None, max_length=1000)
    queued_by_user_id: str | None = Field(default=None, index=True)
    created_at: datetime = Field(default_factory=now_utc, index=True)
    updated_at: datetime = Field(default_factory=now_utc)
    started_at: datetime | None = Field(default=None, index=True)
    sent_at: datetime | None = Field(default=None, index=True)


class MonthlyRevenueSnapshot(SQLModel, table=True):
    """A frozen, end-of-month copy of the income dashboard for a closed period.

    One row per (tenant, branch, month). ``branch_id`` is NULL for the
    all-branches aggregate. The ``metrics_json`` blob mirrors exactly what the
    live dashboard renders (totals, profit figures, lab settlement summary,
    membership claim rows) so a stored month can be re-opened in the same card
    layout. Once written a snapshot is frozen: later refunds of that month's
    invoices land in the current month instead of mutating the closed period.
    """

    __table_args__ = (
        UniqueConstraint(
            "tenant_id",
            "branch_id",
            "period_year",
            "period_month",
            name="uq_monthly_revenue_snapshot_period",
        ),
    )

    id: str = Field(default_factory=lambda: new_id("revsnapshot"), primary_key=True)
    tenant_id: str = Field(index=True, foreign_key="tenant.id")
    branch_id: str | None = Field(default=None, index=True, foreign_key="branch.id")
    period_year: int = Field(index=True)
    period_month: int = Field(index=True)
    period_start: str = Field(index=True, max_length=10)
    period_end: str = Field(index=True, max_length=10)
    period_label: str = Field(max_length=40)
    invoice_count: int = Field(default=0)
    gross_revenue: int = Field(default=0)
    paid_revenue: int = Field(default=0)
    final_profit: int = Field(default=0)
    metrics_json: dict = Field(default_factory=dict, sa_column=Column(SAJSON))
    created_at: datetime = Field(default_factory=now_utc, index=True)
    updated_at: datetime = Field(default_factory=now_utc)
    created_by_user_id: str | None = Field(default=None, index=True)
