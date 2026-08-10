from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field, computed_field, field_validator

from app.modules.patients.contact import patient_contact_mobile
from app.modules.patients.models import (
    AlertSeverity,
    AlertType,
    Gender,
    PatientStatus,
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
    created_at: datetime
    updated_at: datetime

    @computed_field  # type: ignore[prop-decorator]
    @property
    def contact_mobile(self) -> str | None:
        """Primary, else alternate, else guardian - the number the UI should
        display and messaging will actually use."""
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
    created_at: datetime
    updated_at: datetime
    active_alert_count: int
    critical_alert_count: int

    @computed_field  # type: ignore[prop-decorator]
    @property
    def contact_mobile(self) -> str | None:
        """Primary, else alternate, else guardian."""
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
