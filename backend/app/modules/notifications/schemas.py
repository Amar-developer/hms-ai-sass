from datetime import datetime

from pydantic import BaseModel, Field

from app.modules.notifications.models import (
    DocumentDeliveryChannel,
    DocumentDeliveryStatus,
    InAppNotificationCategory,
    InAppNotificationPriority,
    NotificationEventType,
    NotificationProvider,
    NotificationStatus,
)


class DocumentDeliveryRequest(BaseModel):
    channel: DocumentDeliveryChannel
    idempotency_key: str = Field(min_length=8, max_length=160)
    artifact_file_id: str | None = None


class DocumentDeliveryRead(BaseModel):
    id: str
    tenant_id: str
    branch_id: str | None
    channel: DocumentDeliveryChannel
    status: DocumentDeliveryStatus
    resource_type: str
    resource_id: str
    artifact_file_id: str
    artifact_version: int
    recipient: str
    subject: str | None
    idempotency_key: str
    provider_message_id: str | None
    failure_reason: str | None
    attempt_count: int
    max_attempts: int
    created_at: datetime
    updated_at: datetime
    sent_at: datetime | None


class NotificationEventCreate(BaseModel):
    branch_id: str | None = None
    provider: NotificationProvider
    event_type: NotificationEventType
    recipient: str = Field(min_length=2, max_length=160)
    subject: str | None = Field(default=None, max_length=200)
    message: str = Field(min_length=1, max_length=2000)
    template_key: str | None = Field(default=None, max_length=120)
    dedupe_key: str | None = Field(default=None, max_length=240)
    max_attempts: int = Field(default=5, ge=1, le=10)
    resource_type: str | None = Field(default=None, max_length=80)
    resource_id: str | None = Field(default=None, max_length=120)
    artifact_file_id: str | None = None
    artifact_version: int | None = Field(default=None, ge=1)
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
    template_key: str | None
    dedupe_key: str | None
    resource_type: str | None
    resource_id: str | None
    artifact_file_id: str | None
    artifact_version: int | None
    queued_by_user_id: str | None
    provider_message_id: str | None
    failure_reason: str | None
    attempt_count: int
    max_attempts: int
    next_attempt_at: datetime
    processing_started_at: datetime | None
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
