from datetime import date, datetime

from sqlmodel import Field, SQLModel

from app.modules.tenants.models import new_id, now_utc


class IPAdmission(SQLModel, table=True):
    id: str = Field(default_factory=lambda: new_id("ipadm"), primary_key=True)
    tenant_id: str = Field(index=True, foreign_key="tenant.id")
    branch_id: str = Field(index=True, foreign_key="branch.id")
    patient_id: str = Field(index=True, foreign_key="patient.id")
    source_appointment_id: str | None = Field(default=None, index=True, foreign_key="appointment.id")
    department_id: str | None = Field(default=None, index=True, foreign_key="department.id")
    admitting_practitioner_id: str | None = Field(default=None, index=True)
    admission_number: str = Field(index=True, min_length=3, max_length=60)
    ward: str = Field(index=True, min_length=2, max_length=120)
    room: str | None = Field(default=None, max_length=80)
    bed: str = Field(index=True, min_length=1, max_length=80)
    admission_date: date = Field(default_factory=date.today, index=True)
    reason: str | None = Field(default=None, max_length=1000)
    provisional_diagnosis: str | None = Field(default=None, max_length=1000)
    status: str = Field(default="admitted", index=True, max_length=40)
    created_by_user_id: str | None = Field(default=None, index=True)
    updated_by_user_id: str | None = Field(default=None, index=True)
    created_at: datetime = Field(default_factory=now_utc, index=True)
    updated_at: datetime = Field(default_factory=now_utc)


class IPTreatment(SQLModel, table=True):
    id: str = Field(default_factory=lambda: new_id("iptreat"), primary_key=True)
    tenant_id: str = Field(index=True, foreign_key="tenant.id")
    branch_id: str = Field(index=True, foreign_key="branch.id")
    admission_id: str = Field(index=True, foreign_key="ipadmission.id")
    treatment_date: date = Field(default_factory=date.today, index=True)
    practitioner_id: str | None = Field(default=None, index=True)
    treatment_type: str = Field(default="ward_round", index=True, max_length=80)
    notes: str = Field(min_length=2, max_length=2000)
    medication_summary: str | None = Field(default=None, max_length=2000)
    orders: str | None = Field(default=None, max_length=2000)
    created_by_user_id: str | None = Field(default=None, index=True)
    created_at: datetime = Field(default_factory=now_utc, index=True)


class IPConsultation(SQLModel, table=True):
    id: str = Field(default_factory=lambda: new_id("ipconsult"), primary_key=True)
    tenant_id: str = Field(index=True, foreign_key="tenant.id")
    branch_id: str = Field(index=True, foreign_key="branch.id")
    admission_id: str = Field(index=True, foreign_key="ipadmission.id")
    practitioner_id: str | None = Field(default=None, index=True)
    consultation_date: date = Field(default_factory=date.today, index=True)
    vitals_json: str = Field(default="{}", max_length=2000)
    complaints: str | None = Field(default=None, max_length=2000)
    diagnosis: str | None = Field(default=None, max_length=2000)
    notes: str | None = Field(default=None, max_length=4000)
    prescription_text: str | None = Field(default=None, max_length=4000)
    status: str = Field(default="draft", index=True, max_length=40)
    signed_at: datetime | None = Field(default=None, index=True)
    created_by_user_id: str | None = Field(default=None, index=True)
    updated_by_user_id: str | None = Field(default=None, index=True)
    created_at: datetime = Field(default_factory=now_utc, index=True)
    updated_at: datetime = Field(default_factory=now_utc)


class IPConsentForm(SQLModel, table=True):
    id: str = Field(default_factory=lambda: new_id("ipconsent"), primary_key=True)
    tenant_id: str = Field(index=True, foreign_key="tenant.id")
    branch_id: str = Field(index=True, foreign_key="branch.id")
    admission_id: str = Field(index=True, foreign_key="ipadmission.id")
    consent_type: str = Field(default="general_admission", index=True, max_length=80)
    title: str = Field(min_length=2, max_length=180)
    content: str = Field(min_length=2, max_length=5000)
    patient_or_guardian_name: str | None = Field(default=None, max_length=180)
    relationship: str | None = Field(default=None, max_length=80)
    status: str = Field(default="draft", index=True, max_length=40)
    signed_at: datetime | None = Field(default=None, index=True)
    created_by_user_id: str | None = Field(default=None, index=True)
    updated_by_user_id: str | None = Field(default=None, index=True)
    created_at: datetime = Field(default_factory=now_utc, index=True)
    updated_at: datetime = Field(default_factory=now_utc)


class IPDischargeSummary(SQLModel, table=True):
    id: str = Field(default_factory=lambda: new_id("ipdischarge"), primary_key=True)
    tenant_id: str = Field(index=True, foreign_key="tenant.id")
    branch_id: str = Field(index=True, foreign_key="branch.id")
    admission_id: str = Field(index=True, foreign_key="ipadmission.id")
    discharge_date: date = Field(default_factory=date.today, index=True)
    final_diagnosis: str = Field(min_length=2, max_length=2000)
    course_in_hospital: str | None = Field(default=None, max_length=4000)
    procedures: str | None = Field(default=None, max_length=3000)
    medications: str | None = Field(default=None, max_length=3000)
    follow_up_advice: str | None = Field(default=None, max_length=3000)
    condition_at_discharge: str | None = Field(default=None, max_length=1000)
    status: str = Field(default="draft", index=True, max_length=40)
    finalized_at: datetime | None = Field(default=None, index=True)
    created_by_user_id: str | None = Field(default=None, index=True)
    updated_by_user_id: str | None = Field(default=None, index=True)
    created_at: datetime = Field(default_factory=now_utc, index=True)
    updated_at: datetime = Field(default_factory=now_utc)


class IPCharge(SQLModel, table=True):
    id: str = Field(default_factory=lambda: new_id("ipcharge"), primary_key=True)
    tenant_id: str = Field(index=True, foreign_key="tenant.id")
    branch_id: str = Field(index=True, foreign_key="branch.id")
    admission_id: str = Field(index=True, foreign_key="ipadmission.id")
    charge_type: str = Field(default="room", index=True, max_length=80)
    description: str = Field(min_length=2, max_length=260)
    quantity: int = Field(default=1, ge=1)
    unit_amount: int = Field(ge=0)
    total_amount: int = Field(ge=0)
    created_by_user_id: str | None = Field(default=None, index=True)
    created_at: datetime = Field(default_factory=now_utc, index=True)
