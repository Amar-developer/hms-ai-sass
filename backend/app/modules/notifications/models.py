from datetime import datetime
from enum import Enum

from sqlalchemy import Index, UniqueConstraint
from sqlmodel import Field, SQLModel

from app.modules.tenants.models import new_id, now_utc


class NotificationProvider(str, Enum):
    WHATSAPP = "whatsapp"
    SMS = "sms"
    VOICE = "voice"


class NotificationEventType(str, Enum):
    APPOINTMENT_REMINDER = "appointment_reminder"
    QUEUE_TOKEN_CALL = "queue_token_call"
    PAYMENT_REMINDER = "payment_reminder"
    FOLLOW_UP_REMINDER = "follow_up_reminder"
    LAB_REPORT_READY = "lab_report_ready"
    PATIENT_MESSAGE = "patient_message"


class NotificationStatus(str, Enum):
    QUEUED = "queued"
    SENT = "sent"
    FAILED = "failed"
    CANCELLED = "cancelled"


class InAppNotificationCategory(str, Enum):
    APPOINTMENT = "appointment"
    QUEUE = "queue"
    CLINICAL = "clinical"
    BILLING = "billing"
    REQUEST = "request"
    COMMENT = "comment"
    ADMINISTRATION = "administration"
    SUBSCRIPTION = "subscription"
    FEATURE_UPDATE = "feature_update"
    VERSION_UPDATE = "version_update"
    MAINTENANCE = "maintenance"
    SECURITY = "security"


class InAppNotificationPriority(str, Enum):
    LOW = "low"
    NORMAL = "normal"
    HIGH = "high"
    URGENT = "urgent"


class NotificationEvent(SQLModel, table=True):
    id: str = Field(default_factory=lambda: new_id("notification"), primary_key=True)
    tenant_id: str = Field(index=True, foreign_key="tenant.id")
    branch_id: str | None = Field(default=None, index=True, foreign_key="branch.id")
    provider: NotificationProvider = Field(index=True)
    event_type: NotificationEventType = Field(index=True)
    status: NotificationStatus = Field(default=NotificationStatus.QUEUED, index=True)
    recipient: str = Field(min_length=2, max_length=160)
    subject: str | None = Field(default=None, max_length=200)
    message: str = Field(min_length=1, max_length=2000)
    resource_type: str | None = Field(default=None, index=True, max_length=80)
    resource_id: str | None = Field(default=None, index=True, max_length=120)
    queued_by_user_id: str | None = Field(default=None, index=True)
    provider_message_id: str | None = Field(default=None, max_length=160)
    failure_reason: str | None = Field(default=None, max_length=500)
    created_at: datetime = Field(default_factory=now_utc, index=True)
    updated_at: datetime = Field(default_factory=now_utc)
    sent_at: datetime | None = Field(default=None, index=True)


class InAppNotification(SQLModel, table=True):
    """A private, durable inbox row for one authenticated user."""

    __table_args__ = (
        UniqueConstraint(
            "recipient_user_id",
            "dedupe_key",
            name="uq_inappnotification_recipient_dedupe",
        ),
        Index(
            "ix_inappnotification_user_read_created",
            "recipient_user_id",
            "is_read",
            "created_at",
        ),
    )

    id: str = Field(default_factory=lambda: new_id("inapp"), primary_key=True)
    tenant_id: str | None = Field(default=None, index=True, foreign_key="tenant.id")
    branch_id: str | None = Field(default=None, index=True, foreign_key="branch.id")
    department_id: str | None = Field(
        default=None, index=True, foreign_key="department.id"
    )
    recipient_user_id: str = Field(index=True, foreign_key="user.id")
    category: InAppNotificationCategory = Field(index=True)
    event_type: str = Field(index=True, max_length=100)
    priority: InAppNotificationPriority = Field(
        default=InAppNotificationPriority.NORMAL, index=True
    )
    title: str = Field(min_length=2, max_length=200)
    message: str = Field(min_length=1, max_length=2000)
    action_module: str | None = Field(default=None, max_length=80)
    resource_type: str | None = Field(default=None, index=True, max_length=80)
    resource_id: str | None = Field(default=None, index=True, max_length=120)
    metadata_json: str = Field(default="{}", max_length=8000)
    dedupe_key: str | None = Field(default=None, max_length=240)
    is_read: bool = Field(default=False, index=True)
    read_at: datetime | None = Field(default=None, index=True)
    archived_at: datetime | None = Field(default=None, index=True)
    created_by_user_id: str | None = Field(default=None, index=True)
    created_at: datetime = Field(default_factory=now_utc, index=True)
    expires_at: datetime | None = Field(default=None, index=True)


class ProductAnnouncement(SQLModel, table=True):
    """Release/product notice and the audience used for inbox delivery."""

    id: str = Field(default_factory=lambda: new_id("announce"), primary_key=True)
    tenant_id: str | None = Field(default=None, index=True, foreign_key="tenant.id")
    category: InAppNotificationCategory = Field(index=True)
    priority: InAppNotificationPriority = Field(
        default=InAppNotificationPriority.NORMAL, index=True
    )
    title: str = Field(min_length=2, max_length=200)
    message: str = Field(min_length=1, max_length=4000)
    version: str | None = Field(default=None, index=True, max_length=60)
    module_key: str | None = Field(default=None, index=True, max_length=100)
    target_user_type: str | None = Field(default=None, index=True, max_length=60)
    target_permission: str | None = Field(default=None, index=True, max_length=120)
    action_module: str | None = Field(default=None, max_length=80)
    published_by_user_id: str = Field(index=True, foreign_key="user.id")
    published_at: datetime = Field(default_factory=now_utc, index=True)
    expires_at: datetime | None = Field(default=None, index=True)
    is_active: bool = Field(default=True, index=True)
