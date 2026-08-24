from typing import Literal

from pydantic import BaseModel, Field, HttpUrl, field_validator, model_validator

from app.modules.integrations.whatsapp_field_catalog import flow_field_keys


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
    "health_tip_patient",
    "medicine_refill_patient",
    "lab_test_reminder_patient",
    "membership_renewal_patient",
    "unused_benefit_patient",
    "patient_reengagement",
    "home_care_booking_patient",
    "home_care_visit_patient",
    "home_visit_booking_patient",
    "home_visit_reminder_patient",
    "ip_admission_patient",
    "ip_discharge_patient",
    "physiotherapy_case_patient",
    "physiotherapy_session_patient",
    "pharmacy_dispense_patient",
    "service_invoice_patient",
    "service_follow_up_patient",
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
    health_tip_patient: str = Field(default="", max_length=160)
    medicine_refill_patient: str = Field(default="", max_length=160)
    lab_test_reminder_patient: str = Field(default="", max_length=160)
    membership_renewal_patient: str = Field(default="", max_length=160)
    unused_benefit_patient: str = Field(default="", max_length=160)
    patient_reengagement: str = Field(default="", max_length=160)
    home_care_booking_patient: str = Field(default="", max_length=160)
    home_care_visit_patient: str = Field(default="", max_length=160)
    home_visit_booking_patient: str = Field(default="", max_length=160)
    home_visit_reminder_patient: str = Field(default="", max_length=160)
    ip_admission_patient: str = Field(default="", max_length=160)
    ip_discharge_patient: str = Field(default="", max_length=160)
    physiotherapy_case_patient: str = Field(default="", max_length=160)
    physiotherapy_session_patient: str = Field(default="", max_length=160)
    pharmacy_dispense_patient: str = Field(default="", max_length=160)
    service_invoice_patient: str = Field(default="", max_length=160)
    service_follow_up_patient: str = Field(default="", max_length=160)

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
    health_tip_patient: bool = False
    medicine_refill_patient: bool = False
    lab_test_reminder_patient: bool = False
    membership_renewal_patient: bool = False
    unused_benefit_patient: bool = False
    patient_reengagement: bool = False
    home_care_booking_patient: bool = False
    home_care_visit_patient: bool = False
    home_visit_booking_patient: bool = False
    home_visit_reminder_patient: bool = False
    ip_admission_patient: bool = False
    ip_discharge_patient: bool = False
    physiotherapy_case_patient: bool = False
    physiotherapy_session_patient: bool = False
    pharmacy_dispense_patient: bool = False
    service_invoice_patient: bool = False
    service_follow_up_patient: bool = False


class WhatsAppCustomTemplateSettings(BaseModel):
    id: str = Field(pattern=r"^custom_[a-z0-9_]{1,80}$")
    name: str = Field(min_length=1, max_length=120)
    description: str = Field(default="", max_length=300)
    audience: Literal["patient", "doctor", "user"] = "patient"
    enabled: bool = False
    # Which real application event this template is sent on. Reuses the same
    # trigger points the built-in flows already fire from — a custom
    # template does not invent a new event, it replaces how an existing one
    # is composed (its identifier and, uniquely to custom templates, which
    # fields fill each {{n}} placeholder and in what order).
    trigger_key: WhatsAppFlowKey
    identifiers: dict[WhatsAppLanguage, str] = Field(default_factory=dict)
    # Ordered list of field keys (from FLOW_FIELD_CATALOG[trigger_key]) that
    # fill {{1}}, {{2}}, ... in order. The length of this list IS the
    # template's parameter count — there is no separate count to keep in
    # sync, which is what caused the "Template params does not match the
    # campaign" mismatches for the built-in flows before this existed.
    parameters: list[str] = Field(default_factory=list, max_length=10)

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

    @field_validator("parameters", mode="before")
    @classmethod
    def normalize_parameters(cls, value):
        return [
            str(item or "").strip() for item in (value or []) if str(item or "").strip()
        ]

    @model_validator(mode="after")
    def validate_parameters_match_trigger(self):
        valid_keys = flow_field_keys(self.trigger_key)
        invalid = [field for field in self.parameters if field not in valid_keys]
        if invalid:
            raise ValueError(
                f"Unknown template field(s) for {self.trigger_key}: {', '.join(invalid)}"
            )
        if self.enabled and not self.parameters:
            raise ValueError(
                f"Select at least one template field for {self.name or self.id}"
            )
        if self.enabled and not self.identifiers:
            raise ValueError(
                f"Add at least one approved identifier for {self.name or self.id}"
            )
        return self


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
    # Ordered field keys (from FLOW_FIELD_CATALOG[flow_key]) that fill
    # {{1}}, {{2}}, ... for each BUILT-IN flow's own identifier — the same
    # "pick which field goes where" mechanism custom templates use, applied
    # in place to the built-in flows instead of requiring a separate
    # override entry. A flow absent from this dict falls back to the
    # catalog's default order (handled at read time in `_read`, and at
    # send time by `default_field_order`), so existing tenants that never
    # touch this keep sending exactly what they send today.
    template_field_mappings: dict[WhatsAppFlowKey, list[str]] = Field(
        default_factory=dict
    )

    @field_validator("template_field_mappings", mode="before")
    @classmethod
    def normalize_template_field_mappings(cls, value):
        return {
            str(flow_key): [
                str(item or "").strip()
                for item in (fields or [])
                if str(item or "").strip()
            ]
            for flow_key, fields in (value or {}).items()
        }

    @model_validator(mode="after")
    def validate_template_field_mappings(self):
        for flow_key, fields in self.template_field_mappings.items():
            valid_keys = flow_field_keys(flow_key)
            invalid = [field for field in fields if field not in valid_keys]
            if invalid:
                raise ValueError(
                    f"Unknown template field(s) for {flow_key}: {', '.join(invalid)}"
                )
            if getattr(self.flows, flow_key, False) and not fields:
                raise ValueError(f"Select at least one template field for {flow_key}")
        return self

    @field_validator("custom_templates")
    @classmethod
    def unique_custom_templates(cls, value: list[WhatsAppCustomTemplateSettings]):
        if len({template.id for template in value}) != len(value):
            raise ValueError("Custom template identifiers must be unique")
        enabled_triggers = [
            template.trigger_key for template in value if template.enabled
        ]
        if len(set(enabled_triggers)) != len(enabled_triggers):
            raise ValueError(
                "Only one enabled custom template is allowed per trigger event"
                " — disable the other one first"
            )
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


class WhatsAppFieldOption(BaseModel):
    key: str
    label: str


class WhatsAppFieldCatalogRead(BaseModel):
    trigger_key: str
    fields: list[WhatsAppFieldOption]


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
    # Always fully populated (falls back to the catalog default order for any
    # flow the tenant hasn't customized), so the frontend never needs its own
    # copy of what a flow's default field order is.
    template_field_mappings: dict[str, list[str]] = Field(default_factory=dict)
    field_catalog: list[WhatsAppFieldCatalogRead] = Field(default_factory=list)
    usage: WhatsAppUsageRead | None = None
    health: WhatsAppHealthRead | None = None
    readiness: WhatsAppReadinessRead | None = None
    updated_at: str | None = None


class WhatsAppTestRequest(BaseModel):
    mobile: str = Field(min_length=8, max_length=30)
    recipient_name: str = Field(min_length=1, max_length=160)
    # Exactly one of these identifies what's being tested: a built-in flow
    # (fixed parameter shape, validated below) or an admin-defined custom
    # template (parameter count comes from the template's own `parameters`
    # list, validated against the loaded config in the service layer since
    # this schema has no DB/tenant-config access).
    flow_key: WhatsAppFlowKey | None = None
    custom_template_id: str | None = Field(default=None, max_length=120)
    language: WhatsAppLanguage | None = None
    template_parameters: list[str] = Field(min_length=1, max_length=10)
    media_url: HttpUrl | None = None
    media_filename: str | None = Field(default=None, max_length=200)

    @field_validator("mobile", "recipient_name", mode="before")
    @classmethod
    def normalize_required_text(cls, value) -> str:
        return str(value or "").strip()

    @field_validator("custom_template_id", mode="before")
    @classmethod
    def normalize_custom_template_id(cls, value):
        normalized = str(value or "").strip()
        return normalized or None

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
    def validate_flow_selection(self):
        if bool(self.flow_key) == bool(self.custom_template_id):
            raise ValueError("Provide exactly one of flow_key or custom_template_id")
        if any(not value for value in self.template_parameters):
            raise ValueError("Template parameters cannot be blank")
        # Parameter count for BOTH paths now depends on tenant-configured,
        # admin-editable field mappings (built-in flows via
        # `template_field_mappings`, custom templates via their own
        # `parameters` list) rather than a fixed shape — validated against
        # the loaded config in the service layer, which has DB access and
        # this schema does not.
        if (
            self.flow_key == "invoice_paid_patient"
            and self.custom_template_id is None
            and not self.media_url
        ):
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


class WhatsAppQueueTodaySummary(BaseModel):
    sent: int = 0
    failed: int = 0
    patient_recipients: int = 0


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
    today: WhatsAppQueueTodaySummary = Field(default_factory=WhatsAppQueueTodaySummary)
