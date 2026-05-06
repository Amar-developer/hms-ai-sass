from datetime import datetime
from enum import Enum

from sqlmodel import Field, SQLModel

from app.modules.tenants.models import new_id, now_utc


class SettingScope(str, Enum):
    TENANT = "tenant"
    BRANCH = "branch"


class SettingKey(str, Enum):
    QUEUE_REQUEUE_AFTER_PATIENTS = "queue.requeue_after_patients"
    QUEUE_AUTO_NO_SHOW_AFTER_MISSED_CALLS = "queue.auto_no_show_after_missed_calls"
    PAYMENT_METHODS_ENABLED = "payment.methods_enabled"
    INVOICE_PREFIX = "invoice.prefix"
    FOLLOW_UP_VALIDITY_DAYS = "follow_up.validity_days"
    APPOINTMENT_SLOT_INTERVALS_ENABLED = "appointment.slot_intervals_enabled"
    APPOINTMENT_SLOT_INTERVAL_MINUTES = "appointment.slot_interval_minutes"
    TOKEN_LANGUAGE = "token.language"
    COMMUNICATION_PROVIDERS_ENABLED = "communication.providers_enabled"


class AdminSetting(SQLModel, table=True):
    id: str = Field(default_factory=lambda: new_id("setting"), primary_key=True)
    tenant_id: str = Field(index=True, foreign_key="tenant.id")
    scope: SettingScope = Field(index=True)
    scope_id: str = Field(index=True)
    module: str = Field(index=True, min_length=2, max_length=80)
    key: SettingKey = Field(index=True)
    value_json: str = Field(default="{}")
    created_by_user_id: str | None = Field(default=None, index=True)
    updated_by_user_id: str | None = Field(default=None, index=True)
    created_at: datetime = Field(default_factory=now_utc, index=True)
    updated_at: datetime = Field(default_factory=now_utc)
