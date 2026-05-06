from datetime import datetime

from pydantic import BaseModel, Field


class AuditEventCreate(BaseModel):
    action: str = Field(min_length=3, max_length=140)
    resource_type: str = Field(min_length=2, max_length=80)
    resource_id: str = Field(min_length=2, max_length=120)
    branch_id: str | None = Field(default=None)
    actor_user_id: str | None = Field(default=None)
    actor_role: str | None = Field(default=None, max_length=80)
    purpose: str | None = Field(default=None, max_length=120)
    metadata_json: str = "{}"


class AuditEventRead(AuditEventCreate):
    id: str
    tenant_id: str
    created_at: datetime
