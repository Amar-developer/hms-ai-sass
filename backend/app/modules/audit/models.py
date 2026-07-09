from datetime import datetime

from sqlmodel import Field, SQLModel

from app.modules.tenants.models import new_id, now_utc


class AuditEvent(SQLModel, table=True):
    id: str = Field(default_factory=lambda: new_id("audit"), primary_key=True)
    tenant_id: str = Field(index=True, foreign_key="tenant.id")
    branch_id: str | None = Field(default=None, index=True, foreign_key="branch.id")
    actor_user_id: str | None = Field(default=None, index=True)
    actor_role: str | None = Field(default=None, max_length=80)
    actor_name: str | None = Field(default=None, max_length=160)
    actor_email: str | None = Field(default=None, max_length=220)
    action: str = Field(index=True, min_length=3, max_length=140)
    resource_type: str = Field(index=True, min_length=2, max_length=80)
    resource_id: str = Field(index=True, min_length=2, max_length=120)
    purpose: str | None = Field(default=None, max_length=120)
    metadata_json: str = Field(default="{}")
    created_at: datetime = Field(default_factory=now_utc, index=True)


class DocumentComment(SQLModel, table=True):
    id: str = Field(default_factory=lambda: new_id("comment"), primary_key=True)
    tenant_id: str = Field(index=True, foreign_key="tenant.id")
    branch_id: str | None = Field(default=None, index=True, foreign_key="branch.id")
    resource_type: str = Field(index=True, min_length=2, max_length=80)
    resource_id: str = Field(index=True, min_length=2, max_length=120)
    author_user_id: str = Field(index=True, foreign_key="user.id")
    author_name: str | None = Field(default=None, max_length=160)
    author_email: str | None = Field(default=None, max_length=220)
    body: str = Field(min_length=1, max_length=4000)
    created_at: datetime = Field(default_factory=now_utc, index=True)
    updated_at: datetime = Field(default_factory=now_utc)
