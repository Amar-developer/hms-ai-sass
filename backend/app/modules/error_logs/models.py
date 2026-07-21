from datetime import datetime

from sqlmodel import Field, SQLModel

from app.modules.tenants.models import new_id, now_utc


class ErrorLog(SQLModel, table=True):
    id: str = Field(default_factory=lambda: new_id("error"), primary_key=True)
    tenant_id: str | None = Field(default=None, index=True, foreign_key="tenant.id")
    branch_id: str | None = Field(default=None, index=True, foreign_key="branch.id")
    user_id: str | None = Field(default=None, index=True, foreign_key="user.id")
    source: str = Field(index=True, min_length=2, max_length=40)
    level: str = Field(index=True, min_length=3, max_length=20)
    category: str = Field(index=True, min_length=3, max_length=60)
    event: str = Field(index=True, min_length=3, max_length=160)
    message: str = Field(min_length=1, max_length=4000)
    module: str | None = Field(default=None, index=True, max_length=120)
    route: str | None = Field(default=None, index=True, max_length=500)
    method: str | None = Field(default=None, max_length=12)
    status_code: int | None = Field(default=None, index=True)
    request_id: str | None = Field(default=None, index=True, max_length=100)
    stack_trace: str | None = Field(default=None, max_length=12000)
    metadata_json: str = Field(default="{}", max_length=8000)
    fingerprint: str = Field(index=True, max_length=64)
    occurrence_count: int = Field(default=1)
    is_resolved: bool = Field(default=False, index=True)
    resolution_note: str | None = Field(default=None, max_length=2000)
    resolved_by_user_id: str | None = Field(default=None, index=True)
    resolved_at: datetime | None = Field(default=None)
    first_seen_at: datetime = Field(default_factory=now_utc, index=True)
    last_seen_at: datetime = Field(default_factory=now_utc, index=True)
    created_at: datetime = Field(default_factory=now_utc, index=True)
