from datetime import date, datetime
from enum import Enum

from sqlalchemy import UniqueConstraint
from sqlmodel import Field, SQLModel

from app.modules.tenants.models import new_id, now_utc


class Gender(str, Enum):
    MALE = "male"
    FEMALE = "female"
    OTHER = "other"
    UNKNOWN = "unknown"


class PatientStatus(str, Enum):
    ACTIVE = "active"
    INACTIVE = "inactive"
    DECEASED = "deceased"


class WhatsAppConsentStatus(str, Enum):
    NOT_RECORDED = "not_recorded"
    OPTED_IN = "opted_in"
    OPTED_OUT = "opted_out"


class SmsConsentStatus(str, Enum):
    NOT_RECORDED = "not_recorded"
    OPTED_IN = "opted_in"
    OPTED_OUT = "opted_out"


class AlertType(str, Enum):
    ALLERGY = "allergy"
    CHRONIC_CONDITION = "chronic_condition"
    RISK = "risk"
    NOTE = "note"


class AlertSeverity(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class Patient(SQLModel, table=True):
    id: str = Field(default_factory=lambda: new_id("patient"), primary_key=True)
    tenant_id: str = Field(index=True, foreign_key="tenant.id")
    branch_id: str | None = Field(default=None, index=True, foreign_key="branch.id")
    patient_number: str = Field(index=True, min_length=3, max_length=40)
    full_name: str = Field(index=True, min_length=2, max_length=180)
    mobile: str | None = Field(default=None, index=True, max_length=20)
    alternate_mobile: str | None = Field(default=None, max_length=20)
    email: str | None = Field(default=None, max_length=220)
    gender: Gender = Field(default=Gender.UNKNOWN)
    date_of_birth: date | None = Field(default=None)
    age_years: int | None = Field(default=None, ge=0, le=130)
    guardian_name: str | None = Field(default=None, max_length=180)
    guardian_mobile: str | None = Field(default=None, max_length=20)
    area: str | None = Field(default=None, index=True, max_length=160)
    address: str | None = Field(default=None, max_length=500)
    blood_group: str | None = Field(default=None, max_length=8)
    photo_url: str | None = Field(default=None, max_length=500)
    photo_file_name: str | None = Field(default=None, max_length=220)
    status: PatientStatus = Field(default=PatientStatus.ACTIVE)
    whatsapp_consent_status: WhatsAppConsentStatus = Field(
        default=WhatsAppConsentStatus.NOT_RECORDED, index=True
    )
    whatsapp_consent_source: str | None = Field(default=None, max_length=80)
    whatsapp_consent_updated_at: datetime | None = Field(default=None, index=True)
    whatsapp_preferred_language: str = Field(default="en", max_length=20)
    sms_consent_status: SmsConsentStatus = Field(
        default=SmsConsentStatus.NOT_RECORDED, index=True
    )
    sms_consent_source: str | None = Field(default=None, max_length=80)
    sms_consent_updated_at: datetime | None = Field(default=None, index=True)
    sms_preferred_language: str = Field(default="en", max_length=20)
    monthly_tracking_enabled: bool = Field(default=False, index=True)
    monthly_refill_on: date | None = Field(default=None, index=True)
    monthly_refill_notes: str | None = Field(default=None, max_length=1000)
    monthly_lab_on: date | None = Field(default=None, index=True)
    monthly_lab_test_name: str | None = Field(default=None, max_length=180)
    monthly_lab_notes: str | None = Field(default=None, max_length=1000)
    created_by_user_id: str | None = Field(default=None, index=True)
    updated_by_user_id: str | None = Field(default=None, index=True)
    created_at: datetime = Field(default_factory=now_utc, index=True)
    updated_at: datetime = Field(default_factory=now_utc)


class PatientContact(SQLModel, table=True):
    id: str = Field(default_factory=lambda: new_id("contact"), primary_key=True)
    tenant_id: str = Field(index=True, foreign_key="tenant.id")
    patient_id: str = Field(index=True, foreign_key="patient.id")
    label: str = Field(default="primary", max_length=80)
    name: str | None = Field(default=None, max_length=180)
    mobile: str | None = Field(default=None, max_length=20)
    email: str | None = Field(default=None, max_length=220)
    relationship: str | None = Field(default=None, max_length=80)
    is_primary: bool = Field(default=False)
    created_at: datetime = Field(default_factory=now_utc)


class PatientFamilyRelationship(SQLModel, table=True):
    __table_args__ = (
        UniqueConstraint(
            "tenant_id",
            "patient_id",
            "related_patient_id",
            name="uq_patient_family_relationship_pair",
        ),
    )

    id: str = Field(default_factory=lambda: new_id("pfam"), primary_key=True)
    tenant_id: str = Field(index=True, foreign_key="tenant.id")
    patient_id: str = Field(index=True, foreign_key="patient.id")
    related_patient_id: str = Field(index=True, foreign_key="patient.id")
    relationship: str = Field(default="family", max_length=80)
    notes: str | None = Field(default=None, max_length=300)
    is_active: bool = Field(default=True, index=True)
    created_by_user_id: str | None = Field(default=None, index=True)
    created_at: datetime = Field(default_factory=now_utc, index=True)
    updated_at: datetime = Field(default_factory=now_utc)


class PatientAlert(SQLModel, table=True):
    id: str = Field(default_factory=lambda: new_id("alert"), primary_key=True)
    tenant_id: str = Field(index=True, foreign_key="tenant.id")
    patient_id: str = Field(index=True, foreign_key="patient.id")
    alert_type: AlertType = Field(index=True)
    title: str = Field(index=True, min_length=2, max_length=160)
    description: str | None = Field(default=None, max_length=500)
    severity: AlertSeverity = Field(default=AlertSeverity.MEDIUM, index=True)
    is_active: bool = Field(default=True, index=True)
    created_by_user_id: str | None = Field(default=None, index=True)
    created_at: datetime = Field(default_factory=now_utc, index=True)
