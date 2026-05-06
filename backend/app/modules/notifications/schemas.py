from datetime import datetime

from pydantic import BaseModel, Field

from app.modules.notifications.models import (
    NotificationEventType,
    NotificationProvider,
    NotificationStatus,
)


class NotificationEventCreate(BaseModel):
    branch_id: str | None = None
    provider: NotificationProvider
    event_type: NotificationEventType
    recipient: str = Field(min_length=2, max_length=160)
    subject: str | None = Field(default=None, max_length=200)
    message: str = Field(min_length=1, max_length=2000)
    resource_type: str | None = Field(default=None, max_length=80)
    resource_id: str | None = Field(default=None, max_length=120)
    queued_by_user_id: str | None = None


class NotificationEventRead(BaseModel):
    id: str
    tenant_id: str
    branch_id: str | None
    provider: NotificationProvider
    event_type: NotificationEventType
    status: NotificationStatus
    recipient: str
    subject: str | None
    message: str
    resource_type: str | None
    resource_id: str | None
    queued_by_user_id: str | None
    provider_message_id: str | None
    failure_reason: str | None
    created_at: datetime
    updated_at: datetime
    sent_at: datetime | None
