from datetime import date
from uuid import uuid4

from pydantic import BaseModel, Field

from app.modules.reports.models import ReportJobStatus


class MonthlyReportFilters(BaseModel):
    overall: bool = True
    doctor: bool = True
    vendor: bool = True
    department: bool = True
    invoice: bool = True
    collections: bool = True
    include_patient_details: bool = False


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
    cc: list[str] | None = None
    from_date: date
    to_date: date
    doctor_id: str | None = None
    invoice_type: str = "overall"
    supplier_id: str | None = None
    supplier_ids: list[str] = Field(default_factory=list)
    report_sections: list[str] = Field(default_factory=list)
    branch_id: str | None = None
    report_title: str | None = Field(default=None, max_length=160)
    table_title: str | None = Field(default=None, max_length=160)
    filter_description: str | None = Field(default=None, max_length=1000)
    summary_headers: list[str] = Field(default_factory=list, max_length=20)
    summary_rows: list[list[str | int | float | bool | None]] = Field(
        default_factory=list, max_length=100
    )
    table_headers: list[str] = Field(default_factory=list, max_length=50)
    table_rows: list[list[str | int | float | bool | None]] = Field(
        default_factory=list, max_length=10000
    )
    export_name: str | None = Field(default=None, max_length=180)


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
    artifact_file_id: str | None
    artifact_file_ids: list[str]
    provider_message_id: str | None
    failure_reason: str | None
    queued_by_user_id: str | None
    created_at: str
    updated_at: str
    started_at: str | None
    sent_at: str | None


class ReportResendRequest(BaseModel):
    recipients: list[str] | None = None
    cc: list[str] | None = None
    idempotency_key: str = Field(
        default_factory=lambda: str(uuid4()), min_length=8, max_length=120
    )


class MonthlySnapshotRead(BaseModel):
    id: str
    branch_id: str | None
    period_year: int
    period_month: int
    period_start: str
    period_end: str
    period_label: str
    invoice_count: int
    gross_revenue: int
    paid_revenue: int
    final_profit: int
    metrics: dict
    created_at: str
    updated_at: str


class MonthlySnapshotArchiveRequest(BaseModel):
    year: int | None = None
    month: int | None = Field(default=None, ge=1, le=12)
    overwrite: bool = False


class DashboardMetricsRead(BaseModel):
    period_start: str
    period_end: str
    previous_period_start: str
    previous_period_end: str
    totals: dict
    previous_totals: dict
    profit_summary: dict
    previous_profit_summary: dict
    gross_profit: float
    final_profit: float
    previous_final_profit: float
    lab_settlement_summary: dict
    membership_claim_rows: list[dict]
    trend_rows: list[dict]
