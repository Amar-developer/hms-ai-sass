from datetime import datetime
from enum import Enum

from sqlalchemy import UniqueConstraint
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
    INVOICE_LOGO_URL = "invoice.logo_url"
    NUMBERING_RULES = "numbering.rules"
    FOLLOW_UP_VALIDITY_DAYS = "follow_up.validity_days"
    APPOINTMENT_SLOT_INTERVALS_ENABLED = "appointment.slot_intervals_enabled"
    APPOINTMENT_SLOT_INTERVAL_MINUTES = "appointment.slot_interval_minutes"
    TOKEN_LANGUAGE = "token.language"
    COMMUNICATION_PROVIDERS_ENABLED = "communication.providers_enabled"
    REPORT_MONTHLY_EMAIL_ENABLED = "report.monthly_email_enabled"
    REPORT_MONTHLY_EMAIL_RECIPIENTS = "report.monthly_email_recipients"
    REPORT_MONTHLY_EMAIL_CC = "report.monthly_email_cc"
    REPORT_MONTHLY_EMAIL_SEND_DAY = "report.monthly_email_send_day"
    REPORT_MONTHLY_EMAIL_FILTERS = "report.monthly_email_filters"
    REPORT_MONTHLY_EMAIL_LAST_SENT_PERIOD = "report.monthly_email_last_sent_period"
    CATALOG_INTEGRATIONS = "catalog.integrations"
    SIDEBAR_ROLE_MODULES = "navigation.role_modules"


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


class DocumentSequence(SQLModel, table=True):
    __table_args__ = (
        UniqueConstraint("tenant_id", "branch_id", "entity", name="uq_document_sequence_scope_entity"),
    )

    id: str = Field(default_factory=lambda: new_id("seq"), primary_key=True)
    tenant_id: str = Field(index=True, foreign_key="tenant.id")
    branch_id: str = Field(default="", index=True)
    entity: str = Field(index=True, min_length=2, max_length=80)
    prefix: str = Field(index=True, min_length=1, max_length=40)
    entity_code: str = Field(index=True, min_length=1, max_length=40)
    digits: int = Field(default=5, ge=1, le=12)
    current_value: int = Field(default=0, ge=0)
    created_at: datetime = Field(default_factory=now_utc, index=True)
    updated_at: datetime = Field(default_factory=now_utc)
