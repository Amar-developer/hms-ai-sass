from __future__ import annotations

from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field, computed_field, field_validator, model_validator

from app.modules.patients.contact import patient_contact_mobile
from app.modules.patients.models import (
    AlertSeverity,
    AlertType,
    Gender,
    PatientStatus,
    SmsConsentStatus,
    WhatsAppConsentStatus,
)


WhatsAppPatientLanguage = Literal[
    "tenant_default",
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


class PatientCreate(BaseModel):
    branch_id: str | None = Field(default=None)
    patient_number: str | None = Field(default=None, min_length=3, max_length=40)
    full_name: str = Field(min_length=2, max_length=180)
    mobile: str | None = Field(default=None, max_length=20)
    alternate_mobile: str | None = Field(default=None, max_length=20)
    email: str | None = Field(default=None, max_length=220)
    gender: Gender = Gender.UNKNOWN
    date_of_birth: date | None = None
    age_years: int | None = Field(default=None, ge=0, le=130)
    guardian_name: str | None = Field(default=None, max_length=180)
    guardian_mobile: str | None = Field(default=None, max_length=20)
    area: str | None = Field(default=None, max_length=160)
    address: str | None = Field(default=None, max_length=500)
    blood_group: str | None = Field(default=None, max_length=8)
    whatsapp_consent_status: WhatsAppConsentStatus = WhatsAppConsentStatus.NOT_RECORDED
    whatsapp_consent_source: str | None = Field(default=None, max_length=80)
    whatsapp_preferred_language: WhatsAppPatientLanguage = "en"
    sms_consent_status: SmsConsentStatus = SmsConsentStatus.NOT_RECORDED
    sms_consent_source: str | None = Field(default=None, max_length=80)
    sms_preferred_language: WhatsAppPatientLanguage = "en"
    monthly_tracking_enabled: bool = False
    monthly_refill_on: date | None = None
    monthly_refill_notes: str | None = Field(default=None, max_length=1000)
    monthly_lab_on: date | None = None
    monthly_lab_test_name: str | None = Field(default=None, max_length=180)
    monthly_lab_notes: str | None = Field(default=None, max_length=1000)

    @field_validator("date_of_birth")
    @classmethod
    def date_of_birth_cannot_be_future(cls, value: date | None) -> date | None:
        if value and value > date.today():
            raise ValueError("Date of birth cannot be in the future")
        return value


class PatientUpdate(BaseModel):
    branch_id: str | None = None
    full_name: str | None = Field(default=None, min_length=2, max_length=180)
    mobile: str | None = Field(default=None, max_length=20)
    alternate_mobile: str | None = Field(default=None, max_length=20)
    email: str | None = Field(default=None, max_length=220)
    gender: Gender | None = None
    date_of_birth: date | None = None
    age_years: int | None = Field(default=None, ge=0, le=130)
    guardian_name: str | None = Field(default=None, max_length=180)
    guardian_mobile: str | None = Field(default=None, max_length=20)
    area: str | None = Field(default=None, max_length=160)
    address: str | None = Field(default=None, max_length=500)
    blood_group: str | None = Field(default=None, max_length=8)
    status: PatientStatus | None = None
    whatsapp_consent_status: WhatsAppConsentStatus | None = None
    whatsapp_consent_source: str | None = Field(default=None, max_length=80)
    whatsapp_preferred_language: WhatsAppPatientLanguage | None = None
    sms_consent_status: SmsConsentStatus | None = None
    sms_consent_source: str | None = Field(default=None, max_length=80)
    sms_preferred_language: WhatsAppPatientLanguage | None = None
    monthly_tracking_enabled: bool | None = None
    monthly_refill_on: date | None = None
    monthly_refill_notes: str | None = Field(default=None, max_length=1000)
    monthly_lab_on: date | None = None
    monthly_lab_test_name: str | None = Field(default=None, max_length=180)
    monthly_lab_notes: str | None = Field(default=None, max_length=1000)

    @field_validator("date_of_birth")
    @classmethod
    def date_of_birth_cannot_be_future(cls, value: date | None) -> date | None:
        if value and value > date.today():
            raise ValueError("Date of birth cannot be in the future")
        return value


class PatientRead(BaseModel):
    id: str
    tenant_id: str
    branch_id: str | None
    patient_number: str
    full_name: str
    mobile: str | None
    alternate_mobile: str | None
    email: str | None
    gender: Gender
    date_of_birth: date | None
    age_years: int | None
    guardian_name: str | None
    guardian_mobile: str | None
    area: str | None
    address: str | None
    blood_group: str | None
    photo_url: str | None = None
    photo_file_name: str | None = None
    status: PatientStatus
    whatsapp_consent_status: WhatsAppConsentStatus
    whatsapp_consent_source: str | None
    whatsapp_consent_updated_at: datetime | None
    whatsapp_preferred_language: WhatsAppPatientLanguage
    sms_consent_status: SmsConsentStatus
    sms_consent_source: str | None
    sms_consent_updated_at: datetime | None
    sms_preferred_language: WhatsAppPatientLanguage
    monthly_tracking_enabled: bool = False
    monthly_refill_on: date | None = None
    monthly_refill_notes: str | None = None
    monthly_lab_on: date | None = None
    monthly_lab_test_name: str | None = None
    monthly_lab_notes: str | None = None
    created_by_user_id: str | None = None
    updated_by_user_id: str | None = None
    created_at: datetime
    updated_at: datetime
    subscription_plan_name: str | None = None
    subscription_status: str | None = None
    intelligence_flags: list[PatientIntelligenceFlagCompact] = Field(
        default_factory=list
    )

    @computed_field  # type: ignore[prop-decorator]
    @property
    def contact_mobile(self) -> str | None:
        """Primary, else secondary/alternate patient-owned mobile."""
        return patient_contact_mobile(self)


class PatientAlertCreate(BaseModel):
    alert_type: AlertType
    title: str = Field(min_length=2, max_length=160)
    description: str | None = Field(default=None, max_length=500)
    severity: AlertSeverity = AlertSeverity.MEDIUM
    created_by_user_id: str | None = None


class PatientAlertRead(PatientAlertCreate):
    id: str
    tenant_id: str
    patient_id: str
    is_active: bool
    created_at: datetime


class PatientCommunicationRead(BaseModel):
    id: str
    channel: str
    template_key: str | None
    status: str
    recipient_masked: str
    resource_type: str | None
    resource_id: str | None
    created_at: datetime
    sent_at: datetime | None
    failure_reason: str | None = None


class PatientFamilyRelationshipCreate(BaseModel):
    related_patient_id: str
    relationship: str = Field(default="family", min_length=1, max_length=80)
    notes: str | None = Field(default=None, max_length=300)


class PatientFamilyRelationshipRead(BaseModel):
    id: str
    tenant_id: str
    patient_id: str
    related_patient_id: str
    related_patient_name: str | None = None
    related_patient_number: str | None = None
    relationship: str
    notes: str | None = None
    is_active: bool
    created_by_user_id: str | None = None
    created_at: datetime
    updated_at: datetime


class PatientVitalCreate(BaseModel):
    recorded_at: datetime | None = None
    height_cm: float | None = Field(default=None, gt=0, le=300)
    weight_kg: float | None = Field(default=None, gt=0, le=500)
    bp: str | None = Field(default=None, max_length=20)
    pulse_bpm: int | None = Field(default=None, gt=0, le=300)
    spo2_percent: float | None = Field(default=None, gt=0, le=100)
    temperature_f: float | None = Field(default=None, gt=70, le=115)
    notes: str | None = Field(default=None, max_length=300)

    @field_validator("recorded_at")
    @classmethod
    def recorded_at_cannot_be_future(cls, value: datetime | None) -> datetime | None:
        if value and value > datetime.now(value.tzinfo):
            raise ValueError("Recorded date cannot be in the future")
        return value

    @model_validator(mode="after")
    def at_least_one_reading(self) -> "PatientVitalCreate":
        if not any(
            [
                self.height_cm,
                self.weight_kg,
                self.bp,
                self.pulse_bpm,
                self.spo2_percent,
                self.temperature_f,
            ]
        ):
            raise ValueError("Record at least one vital reading")
        return self


class PatientVitalRead(BaseModel):
    id: str
    tenant_id: str
    patient_id: str
    recorded_at: datetime
    height_cm: float | None = None
    weight_kg: float | None = None
    bp: str | None = None
    pulse_bpm: int | None = None
    spo2_percent: float | None = None
    temperature_f: float | None = None
    notes: str | None = None
    created_by_user_id: str | None = None
    created_at: datetime

    @computed_field  # type: ignore[prop-decorator]
    @property
    def bmi(self) -> float | None:
        if not self.height_cm or not self.weight_kg:
            return None
        height_m = self.height_cm / 100
        if not height_m:
            return None
        return round(self.weight_kg / (height_m * height_m), 1)


class PatientIntelligenceFlagCompact(BaseModel):
    flag_key: str
    category: str
    severity: str
    explanation: str | None = None
    label: str
    background_color: str
    text_color: str
    border_color: str
    priority: int


class PatientSearchResult(BaseModel):
    id: str
    tenant_id: str
    branch_id: str | None
    patient_number: str
    full_name: str
    mobile: str | None
    alternate_mobile: str | None = None
    guardian_name: str | None
    guardian_mobile: str | None
    area: str | None
    gender: Gender
    age_years: int | None
    status: PatientStatus
    created_by_user_id: str | None = None
    updated_by_user_id: str | None = None
    created_at: datetime
    updated_at: datetime
    active_alert_count: int
    critical_alert_count: int

    @computed_field  # type: ignore[prop-decorator]
    @property
    def contact_mobile(self) -> str | None:
        """Primary, else secondary/alternate patient-owned mobile."""
        return patient_contact_mobile(self)

    subscription_plan_name: str | None = None
    subscription_status: str | None = None
    intelligence_flags: list[PatientIntelligenceFlagCompact] = Field(
        default_factory=list
    )


class PatientDuplicateCandidate(PatientSearchResult):
    match_reason: str
    confidence: str


class PatientSummary(BaseModel):
    patient: PatientRead
    critical_alerts: list[PatientAlertRead]
    allergies: list[PatientAlertRead]
    chronic_conditions: list[PatientAlertRead]
    risk_alerts: list[PatientAlertRead]
    notes: list[PatientAlertRead]
    timeline: list[dict[str, str]]
