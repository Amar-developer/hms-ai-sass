from datetime import datetime

from sqlmodel import Field, SQLModel

from app.modules.tenants.models import new_id, now_utc


class AuditEvent(SQLModel, table=True):
    id: str = Field(default_factory=lambda: new_id("audit"), primary_key=True)
    tenant_id: str = Field(index=True, foreign_key="tenant.id")
    branch_id: str | None = Field(default=None, index=True, foreign_key="branch.id")
    actor_user_id: str | None = Field(default=None, index=True)
    actor_role: str | None = Field(default=None, max_length=80)
    action: str = Field(index=True, min_length=3, max_length=140)
    resource_type: str = Field(index=True, min_length=2, max_length=80)
    resource_id: str = Field(index=True, min_length=2, max_length=120)
    purpose: str | None = Field(default=None, max_length=120)
    metadata_json: str = Field(default="{}")
    created_at: datetime = Field(default_factory=now_utc, index=True)
