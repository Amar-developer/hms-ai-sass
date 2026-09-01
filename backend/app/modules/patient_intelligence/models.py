from datetime import datetime
from decimal import Decimal
from enum import Enum
import json

from sqlalchemy import Index, Numeric, UniqueConstraint
from sqlmodel import Field, SQLModel

from app.modules.tenants.models import new_id, now_utc


class IntelligenceFlagCategory(str, Enum):
    VALUE = "value"
    RECURRING = "recurring"
    LOYALTY = "loyalty"
    ENGAGEMENT = "engagement"
    CARE_OPERATIONAL = "care_operational"
    MEMBERSHIP = "membership"


class IntelligenceFlagStatus(str, Enum):
    OPEN = "open"
    ACKNOWLEDGED = "acknowledged"
    ACTION_TAKEN = "action_taken"
    RESOLVED = "resolved"
    CLOSED = "closed"


class EngagementActionStatus(str, Enum):
    RECOMMENDED = "recommended"
    APPROVED = "approved"
    QUEUED = "queued"
    SENT = "sent"
    SUPPRESSED = "suppressed"
    CANCELLED = "cancelled"
    FAILED = "failed"


class PatientIntelligenceRule(SQLModel, table=True):
    __table_args__ = (
        UniqueConstraint("tenant_id", "rule_key", name="uq_pi_rule_tenant_key"),
    )

    id: str = Field(default_factory=lambda: new_id("pirule"), primary_key=True)
    tenant_id: str = Field(index=True, foreign_key="tenant.id")
    rule_key: str = Field(index=True, max_length=100)
    name: str = Field(max_length=180)
    category: IntelligenceFlagCategory = Field(index=True)
    metric_key: str = Field(index=True, max_length=100)
    operator: str = Field(default="gte", max_length=16)
    threshold: Decimal = Field(default=Decimal("0"), sa_type=Numeric(14, 2))
    threshold_secondary: Decimal | None = Field(default=None, sa_type=Numeric(14, 2))
    window_days: int | None = Field(default=None, ge=1, le=3650)
    flag_key: str = Field(index=True, max_length=100)
    severity: str = Field(default="info", max_length=20)
    badge_label: str | None = Field(default=None, max_length=80)
    badge_background_color: str | None = Field(default=None, max_length=20)
    badge_text_color: str | None = Field(default=None, max_length=20)
    badge_border_color: str | None = Field(default=None, max_length=20)
    display_as_patient_badge: bool = Field(default=False, index=True)
    priority: int = Field(default=100, ge=0, le=10000, index=True)
    exclusive_group: str | None = Field(default=None, max_length=100, index=True)
    score_dimension: str | None = Field(default=None, max_length=30, index=True)
    score_weight: Decimal = Field(default=Decimal("0"), sa_type=Numeric(10, 2))
    required_flag_keys_json: str = Field(default="[]", max_length=4000)
    expires_after_days: int | None = Field(default=None, ge=1, le=3650)
    auto_resolve: bool = Field(default=True)
    requires_active_membership: bool = Field(default=False, index=True)
    action_enabled: bool = Field(default=False, index=True)
    action_key: str | None = Field(default=None, max_length=100)
    action_channel: str | None = Field(default=None, max_length=30)
    action_template_key: str | None = Field(default=None, max_length=120)
    action_requires_approval: bool = Field(default=True)
    action_cooldown_days: int | None = Field(default=None, ge=1, le=3650)
    is_enabled: bool = Field(default=True, index=True)
    version: int = Field(default=1, ge=1)
    created_at: datetime = Field(default_factory=now_utc, index=True)
    updated_at: datetime = Field(default_factory=now_utc)

    @property
    def required_flag_keys(self) -> list[str]:
        try:
            value = json.loads(self.required_flag_keys_json or "[]")
            return [str(item) for item in value] if isinstance(value, list) else []
        except (TypeError, ValueError):
            return []


class PatientIntelligenceContentItem(SQLModel, table=True):
    __table_args__ = (
        UniqueConstraint(
            "tenant_id",
            "content_key",
            name="uq_pi_content_tenant_key",
        ),
        Index("ix_pi_content_tenant_enabled", "tenant_id", "is_enabled", "priority"),
    )

    id: str = Field(default_factory=lambda: new_id("picontent"), primary_key=True)
    tenant_id: str = Field(index=True, foreign_key="tenant.id")
    content_key: str = Field(index=True, max_length=100)
    title: str = Field(max_length=180)
    category: str = Field(default="health_tip", index=True, max_length=40)
    language: str = Field(default="en", index=True, max_length=20)
    audience_flag_key: str | None = Field(default=None, index=True, max_length=100)
    body_text: str = Field(max_length=2000)
    priority: int = Field(default=100, ge=0, le=10000, index=True)
    is_enabled: bool = Field(default=True, index=True)
    created_at: datetime = Field(default_factory=now_utc, index=True)
    updated_at: datetime = Field(default_factory=now_utc)


class PatientMetricSnapshot(SQLModel, table=True):
    __table_args__ = (
        UniqueConstraint("tenant_id", "patient_id", name="uq_pi_metric_tenant_patient"),
        Index("ix_pi_metric_tenant_last_activity", "tenant_id", "last_activity_at"),
    )

    id: str = Field(default_factory=lambda: new_id("pimetric"), primary_key=True)
    tenant_id: str = Field(index=True, foreign_key="tenant.id")
    patient_id: str = Field(index=True, foreign_key="patient.id")
    first_activity_at: datetime | None = Field(default=None, index=True)
    last_activity_at: datetime | None = Field(default=None, index=True)
    completed_visits: int = Field(default=0, ge=0)
    no_show_count: int = Field(default=0, ge=0)
    lab_order_count: int = Field(default=0, ge=0)
    pharmacy_dispense_count: int = Field(default=0, ge=0)
    home_care_visit_count: int = Field(default=0, ge=0)
    net_collected_30d: Decimal = Field(default=Decimal("0"), sa_type=Numeric(14, 2))
    net_collected_365d: Decimal = Field(default=Decimal("0"), sa_type=Numeric(14, 2))
    lifetime_net_collected: Decimal = Field(
        default=Decimal("0"), sa_type=Numeric(14, 2)
    )
    outstanding_amount: Decimal = Field(default=Decimal("0"), sa_type=Numeric(14, 2))
    active_membership: bool = Field(default=False, index=True)
    membership_ends_on: datetime | None = Field(default=None, index=True)
    expected_refill_at: datetime | None = Field(default=None, index=True)
    recurring_medicine_id: str | None = Field(default=None, index=True, max_length=120)
    recurring_interval_days: int | None = Field(default=None, ge=1, le=730)
    evidence_json: str = Field(default="{}", max_length=12000)
    calculated_at: datetime = Field(default_factory=now_utc, index=True)
    calculation_version: int = Field(default=1, ge=1)


class PatientIntelligencePatientSetting(SQLModel, table=True):
    __table_args__ = (
        UniqueConstraint(
            "tenant_id",
            "patient_id",
            name="uq_pi_patient_setting_tenant_patient",
        ),
    )

    id: str = Field(default_factory=lambda: new_id("pisetting"), primary_key=True)
    tenant_id: str = Field(index=True, foreign_key="tenant.id")
    patient_id: str = Field(index=True, foreign_key="patient.id")
    manual_expected_refill_at: datetime | None = Field(default=None, index=True)
    manual_expected_lab_at: datetime | None = Field(default=None, index=True)
    manual_lab_test_name: str | None = Field(default=None, max_length=180)
    manual_lab_notes: str | None = Field(default=None, max_length=1000)
    notes: str | None = Field(default=None, max_length=1000)
    updated_by_user_id: str | None = Field(default=None, index=True)
    created_at: datetime = Field(default_factory=now_utc)
    updated_at: datetime = Field(default_factory=now_utc)


class PatientIntelligenceFlag(SQLModel, table=True):
    __table_args__ = (
        UniqueConstraint(
            "tenant_id", "patient_id", "flag_key", name="uq_pi_flag_patient_key"
        ),
        Index("ix_pi_flag_tenant_status", "tenant_id", "status", "severity"),
    )

    id: str = Field(default_factory=lambda: new_id("piflag"), primary_key=True)
    tenant_id: str = Field(index=True, foreign_key="tenant.id")
    branch_id: str | None = Field(default=None, index=True, foreign_key="branch.id")
    patient_id: str = Field(index=True, foreign_key="patient.id")
    rule_id: str | None = Field(
        default=None, index=True, foreign_key="patientintelligencerule.id"
    )
    flag_key: str = Field(index=True, max_length=100)
    category: IntelligenceFlagCategory = Field(index=True)
    severity: str = Field(default="info", index=True, max_length=20)
    status: IntelligenceFlagStatus = Field(
        default=IntelligenceFlagStatus.OPEN, index=True
    )
    explanation: str = Field(max_length=1000)
    evidence_json: str = Field(default="{}", max_length=12000)
    first_detected_at: datetime = Field(default_factory=now_utc, index=True)
    last_detected_at: datetime = Field(default_factory=now_utc, index=True)
    resolved_at: datetime | None = Field(default=None, index=True)
    assigned_to_user_id: str | None = Field(default=None, index=True)
    updated_at: datetime = Field(default_factory=now_utc)


class PatientIntelligenceFlagHistory(SQLModel, table=True):
    id: str = Field(default_factory=lambda: new_id("piflaghist"), primary_key=True)
    tenant_id: str = Field(index=True, foreign_key="tenant.id")
    patient_id: str = Field(index=True, foreign_key="patient.id")
    flag_id: str = Field(index=True, foreign_key="patientintelligenceflag.id")
    from_status: str | None = Field(default=None, max_length=30)
    to_status: str = Field(max_length=30)
    reason: str = Field(max_length=1000)
    evidence_json: str = Field(default="{}", max_length=12000)
    actor_user_id: str | None = Field(default=None, index=True)
    created_at: datetime = Field(default_factory=now_utc, index=True)


class PatientEngagementAction(SQLModel, table=True):
    __table_args__ = (
        UniqueConstraint("tenant_id", "dedupe_key", name="uq_pi_action_tenant_dedupe"),
        Index("ix_pi_action_tenant_status", "tenant_id", "status", "created_at"),
    )

    id: str = Field(default_factory=lambda: new_id("piaction"), primary_key=True)
    tenant_id: str = Field(index=True, foreign_key="tenant.id")
    branch_id: str | None = Field(default=None, index=True, foreign_key="branch.id")
    patient_id: str = Field(index=True, foreign_key="patient.id")
    source_flag_id: str | None = Field(
        default=None, index=True, foreign_key="patientintelligenceflag.id"
    )
    action_key: str = Field(index=True, max_length=100)
    channel: str = Field(default="whatsapp", index=True, max_length=30)
    template_key: str = Field(index=True, max_length=120)
    status: EngagementActionStatus = Field(
        default=EngagementActionStatus.RECOMMENDED, index=True
    )
    requires_approval: bool = Field(default=True, index=True)
    personalization_json: str = Field(default="{}", max_length=12000)
    reason: str = Field(max_length=1000)
    dedupe_key: str = Field(max_length=240)
    notification_event_id: str | None = Field(
        default=None, index=True, foreign_key="notificationevent.id"
    )
    approved_by_user_id: str | None = Field(default=None, index=True)
    approved_at: datetime | None = Field(default=None, index=True)
    created_at: datetime = Field(default_factory=now_utc, index=True)
    updated_at: datetime = Field(default_factory=now_utc)
