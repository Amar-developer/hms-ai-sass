from datetime import datetime
from enum import Enum

from sqlmodel import Field, SQLModel

from app.modules.tenants.models import new_id, now_utc


class ConsultationStatus(str, Enum):
    DRAFT = "draft"
    IN_PROGRESS = "in_progress"
    SIGNED = "signed"


class Consultation(SQLModel, table=True):
    id: str = Field(default_factory=lambda: new_id("consult"), primary_key=True)
    tenant_id: str = Field(index=True, foreign_key="tenant.id")
    branch_id: str = Field(index=True, foreign_key="branch.id")
    appointment_id: str = Field(index=True, unique=True, foreign_key="appointment.id")
    patient_id: str = Field(index=True, foreign_key="patient.id")
    practitioner_id: str | None = Field(default=None, index=True)
    status: ConsultationStatus = Field(default=ConsultationStatus.DRAFT, index=True)
    treatment_type: str | None = Field(
        default="general_consultation", index=True, max_length=80
    )
    chief_complaint: str | None = Field(default=None, max_length=1000)
    diagnosis: str | None = Field(default=None, max_length=1000)
    clinical_notes: str | None = Field(default=None, max_length=5000)
    prescription_text: str | None = Field(default=None, max_length=5000)
    lab_referral_text: str | None = Field(default=None, max_length=2000)
    scan_referral_text: str | None = Field(default=None, max_length=2000)
    follow_up_advice: str | None = Field(default=None, max_length=2000)
    patient_remarks: str | None = Field(default=None, max_length=2000)
    created_by_user_id: str | None = Field(default=None, index=True)
    signed_by_user_id: str | None = Field(default=None, index=True)
    signed_at: datetime | None = Field(default=None, index=True)
    created_at: datetime = Field(default_factory=now_utc, index=True)
    updated_at: datetime = Field(default_factory=now_utc)


class ConsultationAddendum(SQLModel, table=True):
    id: str = Field(default_factory=lambda: new_id("addendum"), primary_key=True)
    tenant_id: str = Field(index=True, foreign_key="tenant.id")
    consultation_id: str = Field(index=True, foreign_key="consultation.id")
    note: str = Field(min_length=2, max_length=5000)
    created_by_user_id: str | None = Field(default=None, index=True)
    created_at: datetime = Field(default_factory=now_utc, index=True)


class ConsultationVital(SQLModel, table=True):
    id: str = Field(default_factory=lambda: new_id("vital"), primary_key=True)
    tenant_id: str = Field(index=True, foreign_key="tenant.id")
    consultation_id: str = Field(index=True, foreign_key="consultation.id")
    name: str = Field(min_length=1, max_length=80)
    value: str = Field(min_length=1, max_length=80)
    unit: str | None = Field(default=None, max_length=40)
    created_at: datetime = Field(default_factory=now_utc, index=True)


class ConsultationComplaint(SQLModel, table=True):
    id: str = Field(default_factory=lambda: new_id("complaint"), primary_key=True)
    tenant_id: str = Field(index=True, foreign_key="tenant.id")
    consultation_id: str = Field(index=True, foreign_key="consultation.id")
    complaint: str = Field(min_length=1, max_length=300)
    duration: str | None = Field(default=None, max_length=120)
    severity: str | None = Field(default=None, max_length=80)
    created_at: datetime = Field(default_factory=now_utc, index=True)


class ConsultationDiagnosis(SQLModel, table=True):
    id: str = Field(default_factory=lambda: new_id("dx"), primary_key=True)
    tenant_id: str = Field(index=True, foreign_key="tenant.id")
    consultation_id: str = Field(index=True, foreign_key="consultation.id")
    diagnosis: str = Field(min_length=1, max_length=300)
    diagnosis_type: str | None = Field(default="primary", max_length=80)
    notes: str | None = Field(default=None, max_length=500)
    created_at: datetime = Field(default_factory=now_utc, index=True)


class ConsultationMedicine(SQLModel, table=True):
    id: str = Field(default_factory=lambda: new_id("med"), primary_key=True)
    tenant_id: str = Field(index=True, foreign_key="tenant.id")
    consultation_id: str = Field(index=True, foreign_key="consultation.id")
    medicine_name: str = Field(min_length=1, max_length=220)
    dosage: str | None = Field(default=None, max_length=120)
    frequency: str | None = Field(default=None, max_length=120)
    duration: str | None = Field(default=None, max_length=120)
    instructions: str | None = Field(default=None, max_length=500)
    created_at: datetime = Field(default_factory=now_utc, index=True)


class ConsultationReferral(SQLModel, table=True):
    id: str = Field(default_factory=lambda: new_id("ref"), primary_key=True)
    tenant_id: str = Field(index=True, foreign_key="tenant.id")
    consultation_id: str = Field(index=True, foreign_key="consultation.id")
    referral_type: str = Field(index=True, min_length=2, max_length=40)
    item_name: str = Field(min_length=1, max_length=220)
    priority: str | None = Field(default="routine", max_length=80)
    instructions: str | None = Field(default=None, max_length=500)
    created_at: datetime = Field(default_factory=now_utc, index=True)


class ClinicalTemplate(SQLModel, table=True):
    id: str = Field(default_factory=lambda: new_id("template"), primary_key=True)
    tenant_id: str = Field(index=True, foreign_key="tenant.id")
    department_id: str | None = Field(default=None, index=True)
    name: str = Field(min_length=2, max_length=180)
    template_type: str = Field(default="consultation", index=True, max_length=80)
    content_json: str = Field(default="{}")
    is_active: bool = Field(default=True, index=True)
    created_by_user_id: str | None = Field(default=None, index=True)
    created_at: datetime = Field(default_factory=now_utc, index=True)
    updated_at: datetime = Field(default_factory=now_utc)
