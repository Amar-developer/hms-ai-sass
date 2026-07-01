from datetime import datetime
from enum import Enum

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
