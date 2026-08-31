import secrets
from typing import Literal

from pydantic import BaseModel, Field, HttpUrl, field_validator, model_validator


SmsProviderKey = Literal["smscountry"]
SmsCountryApiMode = Literal["unknown", "rest", "http_legacy"]
# P0: required for the first production release (see sms_readiness.P0_SMS_FLOWS).
# P1: expansion flows added in Phase 5 - optional, not part of the readiness gate.
SmsFlowKey = Literal[
    "appointment_booked_patient",
    "appointment_reminder_patient",
    "appointment_rescheduled_patient",
    "appointment_cancelled_patient",
    "queue_token_alert_patient",
    "payment_pending_patient",
    "lab_report_ready_patient",
    "follow_up_reminder_patient",
    "payment_receipt_patient",
    "document_ready_patient",
    "home_care_visit_reminder_patient",
    "membership_expiry_patient",
]
SmsLanguage = Literal[
    "en",
    "hi",
    "mr",
    "gu",
    "ta",
    "te",
    "kn",
    "ml",
    "bn",
    "pa",
    "ur",
]
SmsMessageClassification = Literal[
    "transactional",
    "service_implicit",
    "service_explicit",
    "promotional",
]
SmsConsentBasis = Literal[
    "patient_transaction",
    "explicit_consent",
    "not_applicable",
]
SmsReadinessStatus = Literal["ready", "attention", "not_ready"]
SmsReadinessCheckStatus = Literal["pass", "warning", "block"]


class SmsFlowReadiness(BaseModel):
    """One DLT-approved SMS template registered against a trigger event.

    `flow_key` names the application event this fires on (the trigger points
    are fixed in code - SMS cannot be sent on an event nothing queues), but a
    tenant may register several templates for the same event and switch
    which one is live, or delete one it no longer needs. `id` is what makes
    each entry independently addressable for that add/delete workflow, the
    same role WhatsApp's `custom_templates.id` plays.
    """

    id: str = Field(
        default_factory=lambda: f"sms_tpl_{secrets.token_hex(6)}",
        pattern=r"^sms_tpl_[a-z0-9_]{1,80}$",
    )
    flow_key: SmsFlowKey
    name: str = Field(default="", max_length=120)
    # DLT templates are approved per language in India, so a Hindi and an
    # English version of the same workflow are two separate registrations,
    # not two variants of one. Uniqueness and "one enabled" are therefore
    # scoped to (flow_key, language), not flow_key alone.
    language: SmsLanguage = "en"
    enabled: bool = False
    classification: SmsMessageClassification = "service_implicit"
    consent_basis: SmsConsentBasis = "patient_transaction"
    dlt_template_id: str = Field(default="", max_length=120)
    registered_body: str = Field(default="", max_length=1000)
    variable_keys: list[str] = Field(default_factory=list, max_length=12)
    approved_by_provider: bool = False

    @field_validator(
        "dlt_template_id",
        "registered_body",
        "name",
        mode="before",
    )
    @classmethod
    def normalize_text(cls, value) -> str:
        return str(value or "").strip()

    @field_validator("variable_keys", mode="before")
    @classmethod
    def normalize_variable_keys(cls, value) -> list[str]:
        return [
            str(item or "").strip() for item in (value or []) if str(item or "").strip()
        ]

    @model_validator(mode="after")
    def validate_enabled_flow(self):
        if not self.enabled:
            return self
        if not self.dlt_template_id:
            raise ValueError(f"DLT template ID is required for {self.flow_key}")
        if not self.registered_body:
            raise ValueError(
                f"Registered template body is required for {self.flow_key}"
            )
        if not self.approved_by_provider:
            raise ValueError(f"Provider approval is required for {self.flow_key}")
        if self.classification == "promotional":
            raise ValueError("Promotional SMS is not part of Phase 1 readiness")
        return self


class SmsReadinessUpdate(BaseModel):
    provider: SmsProviderKey = "smscountry"
    sms_country_api_mode: SmsCountryApiMode = "unknown"
    account_confirmed: bool = False
    dpa_confirmed: bool = False
    pricing_confirmed: bool = False
    delivery_receipts_confirmed: bool = False
    callback_contract_confirmed: bool = False
    static_ip_allowlisting_confirmed: bool = False
    dlt_entity_id: str = Field(default="", max_length=120)
    default_sender_id: str = Field(default="", max_length=40)
    throughput_limit_per_minute: int | None = Field(default=None, ge=1, le=100000)
    retention_days: int | None = Field(default=None, ge=1, le=3650)
    notes: str = Field(default="", max_length=2000)
    # A tenant may register several templates against the same flow_key (a
    # reworded DLT resubmission, a seasonal variant) - only the id must be
    # unique, and only one of them may be enabled at a time per flow_key.
    flows: list[SmsFlowReadiness] = Field(default_factory=list, max_length=50)

    @field_validator(
        "dlt_entity_id",
        "default_sender_id",
        "notes",
        mode="before",
    )
    @classmethod
    def normalize_text(cls, value) -> str:
        return str(value or "").strip()

    @model_validator(mode="after")
    def validate_unique_flows(self):
        template_ids = [flow.id for flow in self.flows]
        if len(set(template_ids)) != len(template_ids):
            raise ValueError("SMS template identifiers must be unique")
        enabled_keys = [
            (flow.flow_key, flow.language) for flow in self.flows if flow.enabled
        ]
        if len(set(enabled_keys)) != len(enabled_keys):
            raise ValueError(
                "Only one enabled SMS template is allowed per workflow and"
                " language — disable the other one first"
            )
        return self


class SmsSettingsUpdate(SmsReadinessUpdate):
    enabled: bool = False
    api_url: HttpUrl | None = None
    api_key: str | None = Field(default=None, min_length=4, max_length=500)
    api_token: str | None = Field(default=None, min_length=4, max_length=500)
    username: str | None = Field(default=None, min_length=2, max_length=120)
    password: str | None = Field(default=None, min_length=4, max_length=500)
    webhook_secret: str | None = Field(default=None, min_length=8, max_length=500)
    default_country_code: str = Field(default="+91", pattern=r"^\+[1-9]\d{0,3}$")
    timeout_seconds: int = Field(default=15, ge=5, le=60)
    max_attempts: int = Field(default=5, ge=1, le=10)
    max_segments_per_message: int = Field(default=3, ge=1, le=8)
    daily_message_limit: int | None = Field(default=None, ge=1, le=1_000_000)
    monthly_segment_limit: int | None = Field(default=None, ge=1, le=10_000_000)
    patient_notifications_enabled: bool = True
    staff_notifications_enabled: bool = False
    default_language: SmsLanguage = "en"
    # Provider-negotiated per-segment rate, stored in paise (integer) so cost
    # reporting never carries float rounding error. 0 means unpriced - usage
    # cost reporting is simply omitted rather than shown as free.
    cost_per_segment_paise: int = Field(default=0, ge=0, le=10_000)

    @field_validator(
        "api_key",
        "api_token",
        "username",
        "password",
        "webhook_secret",
        mode="before",
    )
    @classmethod
    def normalize_secret(cls, value):
        normalized = str(value or "").strip()
        return normalized or None

    @model_validator(mode="after")
    def validate_provider_credentials(self):
        if self.api_url and self.api_url.scheme != "https":
            raise ValueError("SMSCountry API URL must use HTTPS")
        if self.enabled and not self.api_url:
            raise ValueError("SMSCountry API URL is required when SMS is enabled")
        rest_values = [self.api_key, self.api_token]
        legacy_values = [self.username, self.password]
        if any(rest_values) and not all(rest_values):
            raise ValueError("Both SMSCountry REST auth key and token are required")
        if any(legacy_values) and not all(legacy_values):
            raise ValueError(
                "Both SMSCountry legacy username and password are required"
            )
        return self


class SmsReadinessCheck(BaseModel):
    key: str
    label: str
    status: SmsReadinessCheckStatus
    message: str


class SmsReadinessRead(SmsReadinessUpdate):
    status: SmsReadinessStatus
    passed: int
    warnings: int
    blockers: int
    checks: list[SmsReadinessCheck]
    updated_at: str | None = None


class SmsSettingsRead(SmsReadinessRead):
    enabled: bool
    api_url: str
    has_credentials: bool
    credential_last_four: str | None
    has_webhook_secret: bool
    default_country_code: str
    timeout_seconds: int
    max_attempts: int
    max_segments_per_message: int
    daily_message_limit: int | None
    monthly_segment_limit: int | None
    patient_notifications_enabled: bool
    staff_notifications_enabled: bool
    default_language: SmsLanguage
    cost_per_segment_paise: int


SmsDeliveryStatus = Literal[
    "accepted",
    "delivered",
    "undelivered",
    "expired",
    "rejected",
    "blocked",
    "failed",
    "unknown",
]


class SmsTestRequest(BaseModel):
    mobile: str = Field(min_length=6, max_length=20)
    flow_key: SmsFlowKey
    language: SmsLanguage | None = None
    variables: dict[str, str] = Field(default_factory=dict)

    @field_validator("mobile", mode="before")
    @classmethod
    def normalize_mobile(cls, value) -> str:
        return str(value or "").strip()

    @field_validator("variables", mode="before")
    @classmethod
    def normalize_variables(cls, value) -> dict[str, str]:
        return {
            str(key).strip(): str(item or "").strip()
            for key, item in (value or {}).items()
            if str(key).strip()
        }


class SmsTestRead(BaseModel):
    success: bool
    status: str
    message: str
    external_message_id: str | None = None
    segment_count: int | None = None
    encoding: str | None = None


class SmsQueueCounts(BaseModel):
    queued: int = 0
    processing: int = 0
    sent: int = 0
    failed: int = 0
    cancelled: int = 0


class SmsQueueItemRead(BaseModel):
    id: str
    flow_key: str
    recipient_name: str
    recipient_masked: str
    status: str
    delivery_status: str | None
    provider_status: str | None
    resource_type: str | None
    resource_reference: str | None
    sender_id: str | None
    segment_count: int | None
    attempt_count: int
    max_attempts: int
    next_attempt_at: str | None
    failure_reason: str | None
    created_at: str
    sent_at: str | None
    delivered_at: str | None


class SmsQueueListRead(BaseModel):
    items: list[SmsQueueItemRead]
    total: int
    limit: int
    offset: int
    counts: SmsQueueCounts


class SmsUsageRead(BaseModel):
    plan_name: str
    monthly_segment_limit: int | None
    daily_message_limit: int | None
    # The plan's included segment allowance plus any active top-up credits -
    # the hard ceiling a tenant cannot raise by editing its own SMS settings.
    plan_segment_limit: int
    plan_segment_credits: int
    messages_used: int
    segments_used: int
    messages_used_today: int
    segments_remaining: int
    limit_reached: bool
    cost_per_segment_paise: int
    estimated_cost_paise: int | None
    period_start: str
    period_end: str


class SmsHealthRead(BaseModel):
    status: Literal["healthy", "warning", "critical"]
    sent_24h: int
    delivered_24h: int
    failed_24h: int
    failure_rate_24h: float
    delivery_rate_24h: float
    queued: int
    retry_pending: int
    stuck_processing: int
    awaiting_receipt: int
    oldest_queued_age_minutes: int | None
    last_sent_at: str | None
    alerts: list[str]


class SmsDeliveryReceiptRead(BaseModel):
    accepted: bool
    matched: bool
    delivery_status: SmsDeliveryStatus | None = None
    message: str


class SmsReconciliationCreate(BaseModel):
    """What the provider's own invoice for a billing period says.

    Entered by hand: SMSCountry does not expose a reconciliation API, so an
    admin reads the provider's invoice and records its totals here for
    comparison against what this system counted for the same period.
    """

    period_start: str
    period_end: str
    provider_billed_segments: int = Field(ge=0)
    provider_amount_paise: int = Field(ge=0)
    notes: str = Field(default="", max_length=1000)

    @field_validator("notes", mode="before")
    @classmethod
    def normalize_notes(cls, value) -> str:
        return str(value or "").strip()


class SmsReconciliationRead(BaseModel):
    id: str
    period_start: str
    period_end: str
    provider_billed_segments: int
    provider_amount_paise: int
    internal_segments: int
    variance_segments: int
    notes: str
    recorded_by_user_id: str | None
    created_at: str
