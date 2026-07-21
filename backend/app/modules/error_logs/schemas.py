from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class ClientErrorLogCreate(BaseModel):
    level: str = Field(default="error", pattern="^(warning|error|critical)$")
    event: str = Field(min_length=3, max_length=160)
    message: str = Field(min_length=1, max_length=4000)
    module: str | None = Field(default=None, max_length=120)
    route: str | None = Field(default=None, max_length=500)
    method: str | None = Field(default=None, max_length=12)
    status_code: int | None = Field(default=None, ge=100, le=599)
    request_id: str | None = Field(default=None, max_length=100)
    stack: str | None = Field(default=None, max_length=12000)
    category: str | None = Field(default=None, max_length=60)
    metadata_json: str = Field(default="{}", max_length=8000)


class ErrorLogAccepted(BaseModel):
    accepted: bool
    id: str | None = None


class ErrorLogRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    tenant_id: str | None
    branch_id: str | None
    user_id: str | None
    source: str
    level: str
    category: str
    event: str
    message: str
    module: str | None
    route: str | None
    method: str | None
    status_code: int | None
    request_id: str | None
    stack_trace: str | None
    metadata_json: str
    occurrence_count: int
    is_resolved: bool
    resolution_note: str | None
    resolved_by_user_id: str | None
    resolved_at: datetime | None
    first_seen_at: datetime
    last_seen_at: datetime
    created_at: datetime


class ErrorLogSummary(BaseModel):
    errors: int
    warnings: int
    permission_issues: int


class ErrorLogPage(BaseModel):
    items: list[ErrorLogRead]
    total: int
    limit: int
    offset: int
    summary: ErrorLogSummary


class ErrorLogResolve(BaseModel):
    resolved: bool = True
    resolution_note: str | None = Field(default=None, max_length=2000)
