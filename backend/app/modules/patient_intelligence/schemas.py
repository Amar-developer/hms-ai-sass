from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


HEX_COLOR_PATTERN = r"^#[0-9a-fA-F]{6}$"


class IntelligenceRuleBase(BaseModel):
    rule_key: str = Field(min_length=2, max_length=100, pattern=r"^[a-z0-9_]+$")
    name: str = Field(min_length=2, max_length=180)
    category: str
    metric_key: str = Field(min_length=2, max_length=100)
    operator: str
    threshold: Decimal
    threshold_secondary: Decimal | None
    window_days: int | None = Field(ge=1, le=3650)
    flag_key: str = Field(min_length=2, max_length=100, pattern=r"^[A-Z0-9_]+$")
    severity: str = Field(min_length=2, max_length=20)
    badge_label: str | None = Field(max_length=80)
    badge_background_color: str | None = Field(pattern=HEX_COLOR_PATTERN)
    badge_text_color: str | None = Field(pattern=HEX_COLOR_PATTERN)
    badge_border_color: str | None = Field(pattern=HEX_COLOR_PATTERN)
    display_as_patient_badge: bool
    priority: int = Field(ge=0, le=10000)
    exclusive_group: str | None = Field(max_length=100)
    score_dimension: str | None = Field(default=None, max_length=30)
    score_weight: Decimal = Field(default=Decimal("0"), ge=0, le=10000)
    required_flag_keys: list[str]
    expires_after_days: int | None = Field(ge=1, le=3650)
    auto_resolve: bool
    requires_active_membership: bool
    action_enabled: bool
    action_key: str | None = Field(max_length=100)
    action_channel: str | None = Field(max_length=30)
    action_template_key: str | None = Field(max_length=120)
    action_requires_approval: bool
    action_cooldown_days: int | None = Field(ge=1, le=3650)
    is_enabled: bool

    @field_validator("category")
    @classmethod
    def validate_category(cls, value: str) -> str:
        allowed = {
            "value",
            "recurring",
            "loyalty",
            "engagement",
            "care_operational",
            "membership",
        }
        if value not in allowed:
            raise ValueError("Unsupported flag category")
        return value

    @field_validator("operator")
    @classmethod
    def validate_operator(cls, value: str) -> str:
        if value not in {"gte", "gt", "lte", "lt", "eq", "neq", "between"}:
            raise ValueError("Unsupported rule operator")
        return value

    @field_validator("score_dimension")
    @classmethod
    def validate_score_dimension(cls, value: str | None) -> str | None:
        if value in {None, ""}:
            return None
        if value not in {"value", "engagement", "risk", "loyalty"}:
            raise ValueError("Unsupported score dimension")
        return value

    @model_validator(mode="after")
    def validate_configuration(self):
        if self.operator == "between" and self.threshold_secondary is None:
            raise ValueError("Between rules require a second threshold")
        if self.display_as_patient_badge and not all(
            [
                self.badge_label,
                self.badge_background_color,
                self.badge_text_color,
                self.badge_border_color,
            ]
        ):
            raise ValueError("Patient badges require a label and all three colors")
        if self.action_enabled and not all(
            [self.action_key, self.action_channel, self.action_template_key]
        ):
            raise ValueError(
                "Enabled actions require an action key, channel, and template"
            )
        return self


class IntelligenceRuleCreate(IntelligenceRuleBase):
    pass


class IntelligenceRuleUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=180)
    category: str | None = None
    metric_key: str | None = Field(default=None, min_length=2, max_length=100)
    operator: str | None = None
    threshold: Decimal | None = None
    threshold_secondary: Decimal | None = None
    window_days: int | None = Field(default=None, ge=1, le=3650)
    flag_key: str | None = Field(default=None, pattern=r"^[A-Z0-9_]+$")
    severity: str | None = None
    badge_label: str | None = None
    badge_background_color: str | None = Field(default=None, pattern=HEX_COLOR_PATTERN)
    badge_text_color: str | None = Field(default=None, pattern=HEX_COLOR_PATTERN)
    badge_border_color: str | None = Field(default=None, pattern=HEX_COLOR_PATTERN)
    display_as_patient_badge: bool | None = None
    priority: int | None = Field(default=None, ge=0, le=10000)
    exclusive_group: str | None = None
    score_dimension: str | None = None
    score_weight: Decimal | None = Field(default=None, ge=0, le=10000)
    required_flag_keys: list[str] | None = None
    expires_after_days: int | None = Field(default=None, ge=1, le=3650)
    auto_resolve: bool | None = None
    is_enabled: bool | None = None
    requires_active_membership: bool | None = None
    action_enabled: bool | None = None
    action_key: str | None = None
    action_channel: str | None = None
    action_template_key: str | None = None
    action_requires_approval: bool | None = None
    action_cooldown_days: int | None = Field(default=None, ge=1, le=3650)


class IntelligenceRuleRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    rule_key: str
    name: str
    category: str
    metric_key: str
    operator: str
    threshold: Decimal
    threshold_secondary: Decimal | None
    window_days: int | None
    flag_key: str
    severity: str
    badge_label: str | None
    badge_background_color: str | None
    badge_text_color: str | None
    badge_border_color: str | None
    display_as_patient_badge: bool
    priority: int
    exclusive_group: str | None
    score_dimension: str | None
    score_weight: Decimal
    required_flag_keys: list[str]
    expires_after_days: int | None
    auto_resolve: bool
    requires_active_membership: bool
    action_enabled: bool
    action_key: str | None
    action_channel: str | None
    action_template_key: str | None
    action_requires_approval: bool
    action_cooldown_days: int | None
    is_enabled: bool
    version: int


class IntelligenceContentBase(BaseModel):
    content_key: str = Field(min_length=2, max_length=100, pattern=r"^[a-z0-9_]+$")
    title: str = Field(min_length=2, max_length=180)
    category: str = Field(default="health_tip", max_length=40)
    language: str = Field(default="en", min_length=2, max_length=20)
    audience_flag_key: str | None = Field(
        default=None, max_length=100, pattern=r"^[A-Z0-9_]+$"
    )
    body_text: str = Field(min_length=2, max_length=2000)
    priority: int = Field(default=100, ge=0, le=10000)
    is_enabled: bool = True

    @field_validator("category")
    @classmethod
    def validate_content_category(cls, value: str) -> str:
        normalized = value.strip().lower()
        allowed = {
            "health_tip",
            "awareness",
            "medicine",
            "lab",
            "membership",
            "general",
        }
        if normalized not in allowed:
            raise ValueError("Unsupported content category")
        return normalized

    @field_validator("language")
    @classmethod
    def normalize_language(cls, value: str) -> str:
        return value.strip().lower().replace("_", "-")


class IntelligenceContentCreate(IntelligenceContentBase):
    pass


class IntelligenceContentUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=2, max_length=180)
    category: str | None = Field(default=None, max_length=40)
    language: str | None = Field(default=None, min_length=2, max_length=20)
    audience_flag_key: str | None = Field(
        default=None, max_length=100, pattern=r"^[A-Z0-9_]+$"
    )
    body_text: str | None = Field(default=None, min_length=2, max_length=2000)
    priority: int | None = Field(default=None, ge=0, le=10000)
    is_enabled: bool | None = None

    @field_validator("category")
    @classmethod
    def validate_content_category(cls, value: str | None) -> str | None:
        if value is None:
            return None
        return IntelligenceContentBase.validate_content_category(value)

    @field_validator("language")
    @classmethod
    def normalize_language(cls, value: str | None) -> str | None:
        if value is None:
            return None
        return IntelligenceContentBase.normalize_language(value)


class IntelligenceContentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    content_key: str
    title: str
    category: str
    language: str
    audience_flag_key: str | None
    body_text: str
    priority: int
    is_enabled: bool
    created_at: datetime
    updated_at: datetime


class MetricSnapshotRead(BaseModel):
    first_activity_at: datetime | None
    last_activity_at: datetime | None
    completed_visits: int
    no_show_count: int
    lab_order_count: int
    pharmacy_dispense_count: int
    home_care_visit_count: int
    net_collected_30d: Decimal
    net_collected_365d: Decimal
    lifetime_net_collected: Decimal
    outstanding_amount: Decimal
    active_membership: bool
    membership_ends_on: datetime | None
    expected_refill_at: datetime | None
    recurring_medicine_id: str | None
    recurring_interval_days: int | None
    calculated_at: datetime


class IntelligenceFlagRead(BaseModel):
    id: str
    flag_key: str
    category: str
    severity: str
    status: str
    explanation: str
    evidence: dict
    first_detected_at: datetime
    last_detected_at: datetime
    resolved_at: datetime | None
    label: str | None = None
    background_color: str | None = None
    text_color: str | None = None
    border_color: str | None = None
    priority: int | None = None


class TimelineItemRead(BaseModel):
    occurred_at: datetime
    activity_type: str
    source_module: str
    source_id: str
    status: str
    title: str
    amount: Decimal | None = None


class EngagementActionRead(BaseModel):
    id: str
    action_key: str
    template_key: str
    status: str
    requires_approval: bool
    personalization: dict
    reason: str
    notification_event_id: str | None
    created_at: datetime


class BulkEngagementQueueRequest(BaseModel):
    flag_key: str | None = Field(default=None, max_length=100)
    category: str | None = Field(default=None, max_length=40)
    action_key: str | None = Field(default=None, max_length=100)
    limit: int = Field(default=100, ge=1, le=500)
    dry_run: bool = False


class BulkEngagementQueueRead(BaseModel):
    matched: int
    queued: int
    suppressed: int
    skipped: int
    failed: int
    notification_event_ids: list[str] = Field(default_factory=list)


class PatientIntelligenceRead(BaseModel):
    patient_id: str
    current_tier: str | None
    score_summary: dict[str, Decimal] = Field(default_factory=dict)
    manual_expected_refill_at: datetime | None = None
    manual_refill_notes: str | None = None
    manual_expected_lab_at: datetime | None = None
    manual_lab_test_name: str | None = None
    manual_lab_notes: str | None = None
    metrics: MetricSnapshotRead
    flags: list[IntelligenceFlagRead]
    timeline: list[TimelineItemRead]
    engagement_actions: list[EngagementActionRead]


class ManualRefillScheduleUpdate(BaseModel):
    expected_refill_on: date | None = None
    auto_schedule: bool = False
    notes: str | None = Field(default=None, max_length=1000)


class ManualRefillScheduleRead(BaseModel):
    patient_id: str
    expected_refill_at: datetime | None
    notes: str | None
    updated_at: datetime | None


class ManualLabScheduleUpdate(BaseModel):
    expected_lab_on: date | None = None
    auto_schedule: bool = False
    lab_test_name: str | None = Field(default=None, max_length=180)
    notes: str | None = Field(default=None, max_length=1000)


class ManualLabScheduleRead(BaseModel):
    patient_id: str
    expected_lab_at: datetime | None
    lab_test_name: str | None
    notes: str | None
    updated_at: datetime | None


class IntelligenceDashboardFlag(BaseModel):
    flag_key: str
    label: str
    category: str
    severity: str
    background_color: str | None = None
    text_color: str | None = None
    border_color: str | None = None
    priority: int


class IntelligenceDashboardPatient(BaseModel):
    patient_id: str
    patient_number: str
    full_name: str
    mobile: str | None
    branch_id: str | None
    last_activity_at: datetime | None
    net_collected_30d: Decimal
    net_collected_365d: Decimal
    completed_visits: int
    score_summary: dict[str, Decimal] = Field(default_factory=dict)
    active_flag_count: int
    open_engagement_count: int
    expected_refill_at: datetime | None
    manual_expected_refill_at: datetime | None
    manual_refill_notes: str | None
    manual_expected_lab_at: datetime | None = None
    manual_lab_test_name: str | None = None
    manual_lab_notes: str | None = None
    monthly_reminder_status: str = "not_sent"
    monthly_reminder_at: datetime | None = None
    membership_reminder_status: str = "not_sent"
    membership_reminder_at: datetime | None = None
    health_tip_status: str = "not_sent"
    health_tip_at: datetime | None = None
    flags: list[IntelligenceDashboardFlag]


class IntelligenceDashboardSegment(BaseModel):
    flag_key: str
    label: str
    category: str
    severity: str
    patient_count: int
    open_engagement_count: int
    recommended_count: int
    approved_count: int
    queued_count: int
    sent_count: int
    suppressed_count: int
    failed_count: int
    background_color: str | None = None
    text_color: str | None = None
    border_color: str | None = None
    priority: int


class IntelligenceDashboardRead(BaseModel):
    summary: dict[str, int]
    badge_distribution: list[dict]
    segments: list[IntelligenceDashboardSegment] = Field(default_factory=list)
    flag_options: list[dict]
    rows: list[IntelligenceDashboardPatient]
    total: int
    limit: int
    offset: int
