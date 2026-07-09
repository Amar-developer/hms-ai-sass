from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


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
    model_config = ConfigDict(from_attributes=True)

    id: str
    tenant_id: str
    actor_name: str | None = None
    actor_email: str | None = None
    created_at: datetime


class CommentCreate(BaseModel):
    body: str = Field(min_length=1, max_length=4000)


class CommentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    tenant_id: str
    resource_type: str
    resource_id: str
    author_user_id: str
    author_name: str | None = None
    author_email: str | None = None
    body: str
    created_at: datetime
    updated_at: datetime


class ActivityFeed(BaseModel):
    events: list[AuditEventRead]
    comments: list[CommentRead]
