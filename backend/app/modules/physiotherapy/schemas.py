from datetime import date, datetime

from pydantic import BaseModel, Field


class PhysiotherapyEquipmentCreate(BaseModel):
    branch_id: str | None = None
    name: str = Field(min_length=2, max_length=160)
    modality_type: str = Field(max_length=80)
    manufacturer: str | None = Field(default=None, max_length=120)
    model_number: str | None = Field(default=None, max_length=120)
    serial_number: str | None = Field(default=None, max_length=120)
    is_portable: bool = False


class PhysiotherapyEquipmentRead(PhysiotherapyEquipmentCreate):
    id: str
    tenant_id: str
    is_active: bool
    created_by_user_id: str | None
    updated_by_user_id: str | None
    created_at: datetime
    updated_at: datetime


class PhysiotherapyCaseCreate(BaseModel):
    branch_id: str
    patient_id: str
    source_appointment_id: str | None = None
    ip_admission_id: str | None = None
    physiotherapist_id: str | None = None
    department_id: str | None = None
    care_context: str = Field(default="op", max_length=20)
    assessment_date: date | None = None
    body_region: str | None = Field(default=None, max_length=120)
    condition: str | None = Field(default=None, max_length=500)
    pain_score: int | None = Field(default=None, ge=0, le=10)
    range_of_motion: str | None = Field(default=None, max_length=500)
    muscle_strength: str | None = Field(default=None, max_length=500)
    treatment_goal: str | None = Field(default=None, max_length=1000)
    planned_sessions: int = Field(default=1, ge=1)
    frequency: str | None = Field(default=None, max_length=120)


class PhysiotherapyCaseUpdate(BaseModel):
    physiotherapist_id: str | None = None
    body_region: str | None = Field(default=None, max_length=120)
    condition: str | None = Field(default=None, max_length=500)
    pain_score: int | None = Field(default=None, ge=0, le=10)
    range_of_motion: str | None = Field(default=None, max_length=500)
    muscle_strength: str | None = Field(default=None, max_length=500)
    treatment_goal: str | None = Field(default=None, max_length=1000)
    planned_sessions: int | None = Field(default=None, ge=1)
    frequency: str | None = Field(default=None, max_length=120)
    status: str | None = Field(default=None, max_length=40)


class PhysiotherapyCaseRead(PhysiotherapyCaseCreate):
    id: str
    tenant_id: str
    case_number: str
    assessment_date: date
    status: str
    created_by_user_id: str | None
    updated_by_user_id: str | None
    created_at: datetime
    updated_at: datetime


class PhysiotherapySessionCreate(BaseModel):
    session_date: date | None = None
    equipment_id: str | None = None
    modality_type: str = Field(max_length=80)
    treatment_area: str | None = Field(default=None, max_length=160)
    intensity: str | None = Field(default=None, max_length=120)
    duration_minutes: int = Field(default=15, ge=1)
    pre_pain_score: int | None = Field(default=None, ge=0, le=10)
    post_pain_score: int | None = Field(default=None, ge=0, le=10)
    exercises: str | None = Field(default=None, max_length=2000)
    home_program: str | None = Field(default=None, max_length=2000)
    notes: str | None = Field(default=None, max_length=2000)
    charge_amount: int = Field(default=0, ge=0)


class PhysiotherapySessionRead(PhysiotherapySessionCreate):
    id: str
    tenant_id: str
    branch_id: str
    case_id: str
    session_date: date
    session_number: int
    status: str
    created_by_user_id: str | None
    created_at: datetime
