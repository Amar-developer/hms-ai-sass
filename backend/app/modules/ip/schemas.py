from datetime import date, datetime

from pydantic import BaseModel, Field


class IPRoomCreate(BaseModel):
    branch_id: str
    ward_type: str = Field(default="general", max_length=80)
    ward_name: str = Field(min_length=2, max_length=120)
    room_type: str = Field(default="shared", max_length=80)
    room_number: str = Field(min_length=1, max_length=80)
    bed_number: str = Field(min_length=1, max_length=80)
    daily_rate: int = Field(default=0, ge=0)


class IPRoomUpdate(BaseModel):
    ward_type: str | None = Field(default=None, max_length=80)
    ward_name: str | None = Field(default=None, min_length=2, max_length=120)
    room_type: str | None = Field(default=None, max_length=80)
    room_number: str | None = Field(default=None, min_length=1, max_length=80)
    bed_number: str | None = Field(default=None, min_length=1, max_length=80)
    daily_rate: int | None = Field(default=None, ge=0)
    is_active: bool | None = None


class IPRoomRead(IPRoomCreate):
    id: str
    tenant_id: str
    is_active: bool
    available: bool = True
    occupied_admission_id: str | None = None
    created_by_user_id: str | None
    updated_by_user_id: str | None
    created_at: datetime
    updated_at: datetime


class IPAdmissionCreate(BaseModel):
    branch_id: str
    patient_id: str
    source_appointment_id: str | None = None
    department_id: str | None = None
    admitting_practitioner_id: str | None = None
    room_id: str | None = None
    ward: str = Field(min_length=2, max_length=120)
    room: str | None = Field(default=None, max_length=80)
    bed: str = Field(min_length=1, max_length=80)
    admission_date: date | None = None
    expected_discharge_date: date | None = None
    aadhaar_number: str | None = Field(default=None, max_length=20)
    reason: str | None = Field(default=None, max_length=1000)
    provisional_diagnosis: str | None = Field(default=None, max_length=1000)


class IPAdmissionUpdate(BaseModel):
    ward: str | None = Field(default=None, min_length=2, max_length=120)
    room: str | None = Field(default=None, max_length=80)
    bed: str | None = Field(default=None, min_length=1, max_length=80)
    room_id: str | None = None
    expected_discharge_date: date | None = None
    aadhaar_number: str | None = Field(default=None, max_length=20)
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
    admission_document_url: str | None = None
    admission_document_name: str | None = None
    admission_document_uploaded_at: datetime | None = None
    created_by_user_id: str | None
    updated_by_user_id: str | None
    created_at: datetime
    updated_at: datetime


class IPDocumentRead(BaseModel):
    id: str
    tenant_id: str
    branch_id: str
    admission_id: str
    document_type: str
    file_name: str
    file_url: str
    content_type: str | None = None
    uploaded_by_user_id: str | None = None
    created_at: datetime


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
    consultation_type: str = Field(default="ward_round", max_length=80)
    fee_amount: int = Field(default=0, ge=0)
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
    billing_item_id: str | None
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


class IPBillingItemCreate(BaseModel):
    source_type: str = Field(default="manual", max_length=80)
    source_id: str | None = None
    description: str = Field(min_length=2, max_length=260)
    quantity: int = Field(default=1, ge=1)
    unit_amount: int = Field(ge=0)
    status: str = Field(default="billable", max_length=40)


class IPBillingItemRead(IPBillingItemCreate):
    id: str
    tenant_id: str
    branch_id: str
    admission_id: str
    total_amount: int
    created_by_user_id: str | None
    created_at: datetime


class IPMedicationOrderCreate(BaseModel):
    practitioner_id: str | None = None
    medicine_name: str = Field(min_length=2, max_length=180)
    dosage: str | None = Field(default=None, max_length=120)
    frequency: str | None = Field(default=None, max_length=120)
    route: str | None = Field(default=None, max_length=80)
    start_date: date | None = None
    end_date: date | None = None
    unit_amount: int = Field(default=0, ge=0)


class IPMedicationOrderRead(IPMedicationOrderCreate):
    id: str
    tenant_id: str
    branch_id: str
    admission_id: str
    start_date: date
    status: str
    created_by_user_id: str | None
    created_at: datetime


class IPMedicationAdministrationCreate(BaseModel):
    administered_at: datetime | None = None
    quantity: int = Field(default=1, ge=1)
    status: str = Field(default="given", max_length=40)
    notes: str | None = Field(default=None, max_length=1000)


class IPMedicationAdministrationRead(IPMedicationAdministrationCreate):
    id: str
    tenant_id: str
    branch_id: str
    admission_id: str
    medication_order_id: str
    administered_at: datetime
    administered_by_user_id: str | None
    billing_item_id: str | None
    created_at: datetime
