from datetime import date, datetime

from pydantic import BaseModel, Field


class IPAdmissionCreate(BaseModel):
    branch_id: str
    patient_id: str
    source_appointment_id: str | None = None
    department_id: str | None = None
    admitting_practitioner_id: str | None = None
    ward: str = Field(min_length=2, max_length=120)
    room: str | None = Field(default=None, max_length=80)
    bed: str = Field(min_length=1, max_length=80)
    admission_date: date | None = None
    reason: str | None = Field(default=None, max_length=1000)
    provisional_diagnosis: str | None = Field(default=None, max_length=1000)


class IPAdmissionUpdate(BaseModel):
    ward: str | None = Field(default=None, min_length=2, max_length=120)
    room: str | None = Field(default=None, max_length=80)
    bed: str | None = Field(default=None, min_length=1, max_length=80)
    department_id: str | None = None
    admitting_practitioner_id: str | None = None
    reason: str | None = Field(default=None, max_length=1000)
    provisional_diagnosis: str | None = Field(default=None, max_length=1000)
    status: str | None = Field(default=None, max_length=40)


class IPAdmissionRead(IPAdmissionCreate):
    id: str
    tenant_id: str
    admission_number: str
    admission_date: date
    status: str
    created_by_user_id: str | None
    updated_by_user_id: str | None
    created_at: datetime
    updated_at: datetime


class IPTreatmentCreate(BaseModel):
    treatment_date: date | None = None
    practitioner_id: str | None = None
    treatment_type: str = Field(default="ward_round", max_length=80)
    notes: str = Field(min_length=2, max_length=2000)
    medication_summary: str | None = Field(default=None, max_length=2000)
    orders: str | None = Field(default=None, max_length=2000)


class IPTreatmentRead(IPTreatmentCreate):
    id: str
    tenant_id: str
    branch_id: str
    admission_id: str
    treatment_date: date
    created_by_user_id: str | None
    created_at: datetime


class IPConsultationCreate(BaseModel):
    practitioner_id: str | None = None
    consultation_date: date | None = None
    vitals_json: str = Field(default="{}", max_length=2000)
    complaints: str | None = Field(default=None, max_length=2000)
    diagnosis: str | None = Field(default=None, max_length=2000)
    notes: str | None = Field(default=None, max_length=4000)
    prescription_text: str | None = Field(default=None, max_length=4000)


class IPConsultationRead(IPConsultationCreate):
    id: str
    tenant_id: str
    branch_id: str
    admission_id: str
    consultation_date: date
    status: str
    signed_at: datetime | None
    created_by_user_id: str | None
    updated_by_user_id: str | None
    created_at: datetime
    updated_at: datetime


class IPConsentFormCreate(BaseModel):
    consent_type: str = Field(default="general_admission", max_length=80)
    title: str = Field(min_length=2, max_length=180)
    content: str = Field(min_length=2, max_length=5000)
    patient_or_guardian_name: str | None = Field(default=None, max_length=180)
    relationship: str | None = Field(default=None, max_length=80)


class IPConsentFormRead(IPConsentFormCreate):
    id: str
    tenant_id: str
    branch_id: str
    admission_id: str
    status: str
    signed_at: datetime | None
    created_by_user_id: str | None
    updated_by_user_id: str | None
    created_at: datetime
    updated_at: datetime


class IPDischargeSummaryCreate(BaseModel):
    discharge_date: date | None = None
    final_diagnosis: str = Field(min_length=2, max_length=2000)
    course_in_hospital: str | None = Field(default=None, max_length=4000)
    procedures: str | None = Field(default=None, max_length=3000)
    medications: str | None = Field(default=None, max_length=3000)
    follow_up_advice: str | None = Field(default=None, max_length=3000)
    condition_at_discharge: str | None = Field(default=None, max_length=1000)


class IPDischargeSummaryRead(IPDischargeSummaryCreate):
    id: str
    tenant_id: str
    branch_id: str
    admission_id: str
    discharge_date: date
    status: str
    finalized_at: datetime | None
    created_by_user_id: str | None
    updated_by_user_id: str | None
    created_at: datetime
    updated_at: datetime


class IPChargeCreate(BaseModel):
    charge_type: str = Field(default="room", max_length=80)
    description: str = Field(min_length=2, max_length=260)
    quantity: int = Field(default=1, ge=1)
    unit_amount: int = Field(ge=0)


class IPChargeRead(IPChargeCreate):
    id: str
    tenant_id: str
    branch_id: str
    admission_id: str
    total_amount: int
    created_by_user_id: str | None
    created_at: datetime
