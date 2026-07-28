from typing import Literal

from pydantic import BaseModel, Field, HttpUrl, field_validator, model_validator


WhatsAppFlowKey = Literal[
    "appointment_booked_patient",
    "appointment_booked_doctor",
    "invoice_paid_patient",
    "payment_pending_patient",
    "appointment_cancelled_patient",
    "appointment_cancelled_doctor",
    "invoice_refunded_patient",
    "lab_report_ready_patient",
    "prescription_ready_patient",
    "follow_up_advice_patient",
    "appointment_reminder_patient",
]

WhatsAppLanguage = Literal[
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


class WhatsAppTemplateSettings(BaseModel):
    appointment_booked_patient: str = Field(default="", max_length=160)
    appointment_booked_doctor: str = Field(default="", max_length=160)
    invoice_paid_patient: str = Field(default="", max_length=160)
    payment_pending_patient: str = Field(default="", max_length=160)
    appointment_cancelled_patient: str = Field(default="", max_length=160)
    appointment_cancelled_doctor: str = Field(default="", max_length=160)
    invoice_refunded_patient: str = Field(default="", max_length=160)
    lab_report_ready_patient: str = Field(default="", max_length=160)
    prescription_ready_patient: str = Field(default="", max_length=160)
    follow_up_advice_patient: str = Field(default="", max_length=160)
    appointment_reminder_patient: str = Field(default="", max_length=160)

    @field_validator("*", mode="before")
    @classmethod
    def normalize_identifier(cls, value) -> str:
        return str(value or "").strip()


class WhatsAppFlowSettings(BaseModel):
    appointment_booked_patient: bool = True
    appointment_booked_doctor: bool = True
    invoice_paid_patient: bool = True
    payment_pending_patient: bool = False
    appointment_cancelled_patient: bool = False
    appointment_cancelled_doctor: bool = False
    invoice_refunded_patient: bool = False
    lab_report_ready_patient: bool = False
    prescription_ready_patient: bool = False
    follow_up_advice_patient: bool = False
    appointment_reminder_patient: bool = False


class WhatsAppCustomTemplateSettings(BaseModel):
    id: str = Field(pattern=r"^custom_[a-z0-9_]{1,80}$")
    name: str = Field(min_length=1, max_length=120)
    description: str = Field(default="", max_length=300)
    audience: Literal["patient", "doctor", "user"] = "patient"
    enabled: bool = False
    identifiers: dict[WhatsAppLanguage, str] = Field(default_factory=dict)

    @field_validator("id", "name", "description", mode="before")
    @classmethod
    def normalize_text(cls, value):
        return str(value or "").strip()

    @field_validator("identifiers", mode="before")
    @classmethod
    def normalize_identifiers(cls, value):
        return {
            str(language): str(identifier or "").strip()
            for language, identifier in (value or {}).items()
            if str(identifier or "").strip()
        }


class WhatsAppIntegrationUpdate(BaseModel):
    enabled: bool = False
    api_url: HttpUrl | None = None
    public_media_base_url: HttpUrl | None = None
    appointment_view_url: HttpUrl | None = None
    api_key: str | None = Field(default=None, min_length=8, max_length=2000)
    default_country_code: str = Field(default="+91", pattern=r"^\+[1-9]\d{0,3}$")
    timeout_seconds: int = Field(default=15, ge=5, le=60)
    max_attempts: int = Field(default=5, ge=1, le=10)
    patient_notifications_enabled: bool = True
    doctor_notifications_enabled: bool = True
    appointment_reminder_24h_enabled: bool = False
    appointment_reminder_2h_enabled: bool = False
    default_language: WhatsAppLanguage = "en"
    templates: WhatsAppTemplateSettings = Field(
        default_factory=WhatsAppTemplateSettings
    )
    localized_templates: dict[WhatsAppLanguage, WhatsAppTemplateSettings] = Field(
        default_factory=dict
    )
    flows: WhatsAppFlowSettings = Field(default_factory=WhatsAppFlowSettings)
    custom_templates: list[WhatsAppCustomTemplateSettings] = Field(
        default_factory=list, max_length=50
    )

    @field_validator("custom_templates")
    @classmethod
    def unique_custom_templates(cls, value: list[WhatsAppCustomTemplateSettings]):
        if len({template.id for template in value}) != len(value):
            raise ValueError("Custom template identifiers must be unique")
        return value

    @field_validator("api_key", mode="before")
    @classmethod
    def normalize_api_key(cls, value):
        normalized = str(value or "").strip()
        return normalized or None

    @field_validator("public_media_base_url")
    @classmethod
    def validate_public_media_origin(cls, value):
        if value and (
            value.path not in {None, "", "/"} or value.query or value.fragment
        ):
            raise ValueError("Public receipt base URL must be an origin without a path")
        return value

    @model_validator(mode="after")
    def validate_enabled_configuration(self):
        if not self.enabled:
            return self
        if not self.api_url:
            raise ValueError("API URL is required when the integration is enabled")
        if self.api_url.scheme != "https":
            raise ValueError("API URL must use HTTPS")
        reminder_schedule_enabled = (
            self.appointment_reminder_24h_enabled
            or self.appointment_reminder_2h_enabled
        )
        if reminder_schedule_enabled and not self.flows.appointment_reminder_patient:
            raise ValueError(
                "Enable the patient appointment reminder flow before its schedule"
            )
        enabled_templates = {}
        for key, enabled in self.flows.model_dump().items():
            if not enabled:
                continue
            is_doctor_flow = key in {
                "appointment_booked_doctor",
                "appointment_cancelled_doctor",
            }
            audience_enabled = (
                self.doctor_notifications_enabled
                if is_doctor_flow
                else self.patient_notifications_enabled
            )
            if audience_enabled:
                enabled_templates[key] = getattr(self.templates, key)
        missing = [key for key, value in enabled_templates.items() if not value]
        if missing:
            raise ValueError(
                "Template identifiers are required for enabled notification flows"
            )
        invoice_flow_enabled = (
            self.patient_notifications_enabled and self.flows.invoice_paid_patient
        )
        if invoice_flow_enabled:
            if not self.public_media_base_url:
                raise ValueError(
                    "Public receipt base URL is required for paid invoice delivery"
                )
            if self.public_media_base_url.scheme != "https":
                raise ValueError("Public receipt base URL must use HTTPS")
        if self.appointment_view_url and self.appointment_view_url.scheme != "https":
            raise ValueError("Doctor application URL must use HTTPS")
        return self


class WhatsAppUsageRead(BaseModel):
    plan_name: str
    monthly_limit: int
    used: int
    remaining: int
    usage_percentage: float
    limit_reached: bool
    period_start: str
    period_end: str


class WhatsAppHealthRead(BaseModel):
    status: Literal["healthy", "warning", "critical"]
    sent_24h: int
    failed_24h: int
    failure_rate_24h: float
    queued: int
    retry_pending: int
    stuck_processing: int
    oldest_queued_age_minutes: int | None
    last_sent_at: str | None
    alerts: list[str]


class WhatsAppReadinessCheck(BaseModel):
    key: str
    label: str
    status: Literal["pass", "warning", "block"]
    message: str


class WhatsAppReadinessRead(BaseModel):
    status: Literal["ready", "attention", "not_ready"]
    passed: int
    warnings: int
    blockers: int
    checks: list[WhatsAppReadinessCheck]


class WhatsAppIntegrationRead(BaseModel):
    enabled: bool
    api_url: str
    public_media_base_url: str
    appointment_view_url: str = ""
    api_key_masked: str | None
    has_api_key: bool
    default_country_code: str
    timeout_seconds: int
    max_attempts: int
    patient_notifications_enabled: bool
    doctor_notifications_enabled: bool
    appointment_reminder_24h_enabled: bool
    appointment_reminder_2h_enabled: bool
    default_language: WhatsAppLanguage
    templates: WhatsAppTemplateSettings
    localized_templates: dict[WhatsAppLanguage, WhatsAppTemplateSettings]
    flows: WhatsAppFlowSettings
    custom_templates: list[WhatsAppCustomTemplateSettings] = Field(default_factory=list)
    usage: WhatsAppUsageRead | None = None
    health: WhatsAppHealthRead | None = None
    readiness: WhatsAppReadinessRead | None = None
    updated_at: str | None = None


class WhatsAppTestRequest(BaseModel):
    mobile: str = Field(min_length=8, max_length=30)
    recipient_name: str = Field(min_length=1, max_length=160)
    flow_key: WhatsAppFlowKey
    language: WhatsAppLanguage | None = None
    template_parameters: list[str] = Field(min_length=1, max_length=10)
    media_url: HttpUrl | None = None
    media_filename: str | None = Field(default=None, max_length=200)

    @field_validator("mobile", "recipient_name", mode="before")
    @classmethod
    def normalize_required_text(cls, value) -> str:
        return str(value or "").strip()

    @field_validator("template_parameters", mode="before")
    @classmethod
    def normalize_parameters(cls, value) -> list[str]:
        return [str(item or "").strip() for item in (value or [])]

    @field_validator("media_filename", mode="before")
    @classmethod
    def normalize_optional_text(cls, value):
        normalized = str(value or "").strip()
        return normalized or None

    @model_validator(mode="after")
    def validate_parameter_count(self):
        expected_counts = {
            "appointment_booked_patient": 3,
            "appointment_booked_doctor": 6,
            "invoice_paid_patient": 4,
            "payment_pending_patient": 4,
            "appointment_cancelled_patient": 4,
            "appointment_cancelled_doctor": 4,
            "invoice_refunded_patient": 3,
            "lab_report_ready_patient": 3,
            "prescription_ready_patient": 3,
            "follow_up_advice_patient": 2,
            "appointment_reminder_patient": 3,
        }
        expected = expected_counts[self.flow_key]
        if len(self.template_parameters) != expected:
            raise ValueError(
                f"{self.flow_key} requires exactly {expected} template parameters"
            )
        if any(not value for value in self.template_parameters):
            raise ValueError("Template parameters cannot be blank")
        if self.flow_key == "invoice_paid_patient" and not self.media_url:
            raise ValueError(
                "A public invoice PDF URL is required for an invoice template test"
            )
        return self


class WhatsAppTestRead(BaseModel):
    success: bool
    status: str
    message: str
    external_message_id: str | None = None


class WhatsAppQueueCounts(BaseModel):
    queued: int = 0
    processing: int = 0
    sent: int = 0
    failed: int = 0
    cancelled: int = 0


class WhatsAppQueueItemRead(BaseModel):
    id: str
    flow_key: str
    recipient_name: str
    recipient_masked: str
    status: str
    resource_type: str | None
    resource_reference: str | None
    attempt_count: int
    max_attempts: int
    next_attempt_at: str | None
    failure_reason: str | None
    created_at: str
    sent_at: str | None


class WhatsAppQueueListRead(BaseModel):
    items: list[WhatsAppQueueItemRead]
    total: int
    limit: int
    offset: int
    counts: WhatsAppQueueCounts
