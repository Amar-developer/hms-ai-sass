from datetime import datetime
from enum import Enum

from sqlmodel import Field, SQLModel

from app.modules.tenants.models import new_id, now_utc


class ReportJobStatus(str, Enum):
    QUEUED = "queued"
    RUNNING = "running"
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
    provider_message_id: str | None = Field(default=None, max_length=160)
    failure_reason: str | None = Field(default=None, max_length=1000)
    queued_by_user_id: str | None = Field(default=None, index=True)
    created_at: datetime = Field(default_factory=now_utc, index=True)
    updated_at: datetime = Field(default_factory=now_utc)
    started_at: datetime | None = Field(default=None, index=True)
    sent_at: datetime | None = Field(default=None, index=True)
