from datetime import datetime

from pydantic import BaseModel, Field, field_validator

from app.core.validation import AppointmentId, DepartmentId, UserId
from app.modules.consultations.models import ConsultationStatus


class VitalRow(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    value: str = Field(min_length=1, max_length=80)
    unit: str | None = Field(default=None, max_length=40)


class ComplaintRow(BaseModel):
    complaint: str = Field(min_length=1, max_length=300)
    duration: str | None = Field(default=None, max_length=120)
    severity: str | None = Field(default=None, max_length=80)


class DiagnosisRow(BaseModel):
    diagnosis: str = Field(min_length=1, max_length=300)
    diagnosis_type: str | None = Field(default="primary", max_length=80)
    notes: str | None = Field(default=None, max_length=500)


class MedicineRow(BaseModel):
    medicine_name: str = Field(min_length=1, max_length=220)
    dosage: str | None = Field(default=None, max_length=120)
    frequency: str | None = Field(default=None, max_length=120)
    duration: str | None = Field(default=None, max_length=120)
    instructions: str | None = Field(default=None, max_length=500)

    @field_validator("dosage", "frequency")
    @classmethod
    def _no_blank_clinical_field(cls, value: str | None) -> str | None:
        # A prescribed medicine must carry a real dosage and frequency — a blank
        # string is a data-entry error that becomes immutable once signed.
        if value is not None and not value.strip():
            raise ValueError("must not be blank")
        return value.strip() if value else value


class ReferralRow(BaseModel):
    referral_type: str = Field(min_length=2, max_length=40)
    item_name: str = Field(min_length=1, max_length=220)
    priority: str | None = Field(default="routine", max_length=80)
    instructions: str | None = Field(default=None, max_length=500)


class ConsultationCreate(BaseModel):
    appointment_id: AppointmentId
    treatment_type: str | None = Field(default="general_consultation", max_length=80)
    chief_complaint: str | None = Field(default=None, max_length=1000)
    diagnosis: str | None = Field(default=None, max_length=1000)
    clinical_notes: str | None = Field(default=None, max_length=5000)
    prescription_text: str | None = Field(default=None, max_length=5000)
    lab_referral_text: str | None = Field(default=None, max_length=2000)
    scan_referral_text: str | None = Field(default=None, max_length=2000)
    follow_up_advice: str | None = Field(default=None, max_length=2000)
    patient_remarks: str | None = Field(default=None, max_length=2000)
    vitals: list[VitalRow] = Field(default_factory=list)
    complaints: list[ComplaintRow] = Field(default_factory=list)
    diagnoses: list[DiagnosisRow] = Field(default_factory=list)
    medicines: list[MedicineRow] = Field(default_factory=list)
    referrals: list[ReferralRow] = Field(default_factory=list)
    created_by_user_id: UserId | None = None


class ConsultationUpdate(BaseModel):
    treatment_type: str | None = Field(default=None, max_length=80)
    chief_complaint: str | None = Field(default=None, max_length=1000)
    diagnosis: str | None = Field(default=None, max_length=1000)
    clinical_notes: str | None = Field(default=None, max_length=5000)
    prescription_text: str | None = Field(default=None, max_length=5000)
    lab_referral_text: str | None = Field(default=None, max_length=2000)
    scan_referral_text: str | None = Field(default=None, max_length=2000)
    follow_up_advice: str | None = Field(default=None, max_length=2000)
    patient_remarks: str | None = Field(default=None, max_length=2000)
    vitals: list[VitalRow] | None = None
    complaints: list[ComplaintRow] | None = None
    diagnoses: list[DiagnosisRow] | None = None
    medicines: list[MedicineRow] | None = None
    referrals: list[ReferralRow] | None = None


class ConsultationSignRequest(BaseModel):
    signed_by_user_id: UserId | None = None


class ConsultationRead(BaseModel):
    id: str
    tenant_id: str
    branch_id: str
    appointment_id: str
    patient_id: str
    practitioner_id: str | None
    status: ConsultationStatus
    treatment_type: str | None
    chief_complaint: str | None
    diagnosis: str | None
    clinical_notes: str | None
    prescription_text: str | None
    lab_referral_text: str | None
    scan_referral_text: str | None
    follow_up_advice: str | None
    patient_remarks: str | None
    created_by_user_id: str | None
    updated_by_user_id: str | None
    signed_by_user_id: str | None
    signed_at: datetime | None
    created_at: datetime
    updated_at: datetime


class ConsultationAddendumCreate(BaseModel):
    note: str = Field(min_length=2, max_length=5000)
    created_by_user_id: UserId | None = None


class ConsultationAddendumRead(BaseModel):
    id: str
    tenant_id: str
    consultation_id: str
    note: str
    created_by_user_id: str | None
    created_at: datetime


class ConsultationTemplateCreate(BaseModel):
    department_id: DepartmentId | None = None
    name: str = Field(min_length=2, max_length=180)
    template_type: str = Field(default="consultation", max_length=80)
    content: dict = Field(default_factory=dict)
    created_by_user_id: UserId | None = None


class ConsultationTemplateUpdate(BaseModel):
    department_id: DepartmentId | None = None
    name: str | None = Field(default=None, min_length=2, max_length=180)
    template_type: str | None = Field(default=None, max_length=80)
    content: dict | None = None


class ConsultationTemplateRead(BaseModel):
    id: str
    tenant_id: str
    department_id: str | None
    name: str
    template_type: str
    content: dict
    is_active: bool
    created_by_user_id: str | None
    created_at: datetime
    updated_at: datetime


class ConsultationLabOrderRead(BaseModel):
    id: str
    status: str
    priority: str
    tests: str
    source: str
    result_ready_at: datetime | None
    created_at: datetime


class ConsultationDetailRead(BaseModel):
    consultation: ConsultationRead
    addendums: list[ConsultationAddendumRead]
    vitals: list[VitalRow]
    complaints: list[ComplaintRow]
    diagnoses: list[DiagnosisRow]
    medicines: list[MedicineRow]
    referrals: list[ReferralRow]
    lab_orders: list[ConsultationLabOrderRead] = []


class PatientDiagnosisRead(BaseModel):
    """One diagnosis row, flattened across all of a patient's consultations —
    backs the Diagnosis history section of the Patient History module."""

    id: str
    consultation_id: str
    diagnosis: str
    diagnosis_type: str | None = None
    notes: str | None = None
    consultation_date: datetime
    treatment_type: str | None = None
