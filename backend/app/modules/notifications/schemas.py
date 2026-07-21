from datetime import datetime

from pydantic import BaseModel, Field

from app.modules.notifications.models import (
    InAppNotificationCategory,
    InAppNotificationPriority,
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


class InAppNotificationRead(BaseModel):
    id: str
    tenant_id: str | None
    branch_id: str | None
    department_id: str | None
    recipient_user_id: str
    category: InAppNotificationCategory
    event_type: str
    priority: InAppNotificationPriority
    title: str
    message: str
    action_module: str | None
    resource_type: str | None
    resource_id: str | None
    metadata_json: str
    is_read: bool
    read_at: datetime | None
    archived_at: datetime | None
    created_by_user_id: str | None
    created_at: datetime
    expires_at: datetime | None


class InAppNotificationList(BaseModel):
    items: list[InAppNotificationRead]
    total: int
    unread_count: int


class InAppNotificationUpdate(BaseModel):
    is_read: bool | None = None
    archived: bool | None = None


class ProductAnnouncementCreate(BaseModel):
    target_tenant_id: str | None = None
    category: InAppNotificationCategory
    priority: InAppNotificationPriority = InAppNotificationPriority.NORMAL
    title: str = Field(min_length=2, max_length=200)
    message: str = Field(min_length=1, max_length=4000)
    version: str | None = Field(default=None, max_length=60)
    module_key: str | None = Field(default=None, max_length=100)
    target_user_type: str | None = Field(default=None, max_length=60)
    target_permission: str | None = Field(default=None, max_length=120)
    action_module: str | None = Field(default=None, max_length=80)
    expires_at: datetime | None = None


class ProductAnnouncementRead(BaseModel):
    id: str
    tenant_id: str | None
    category: InAppNotificationCategory
    priority: InAppNotificationPriority
    title: str
    message: str
    version: str | None
    module_key: str | None
    target_user_type: str | None
    target_permission: str | None
    action_module: str | None
    published_by_user_id: str
    published_at: datetime
    expires_at: datetime | None
    is_active: bool
    delivered_count: int = 0
