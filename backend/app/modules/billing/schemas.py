from datetime import datetime

from pydantic import BaseModel, Field

from app.modules.appointments.models import AppointmentType
from app.modules.billing.models import ApprovalStatus, CreditNoteStatus, FeeShareType, InvoiceStatus, PaymentMethod, PaymentStatus
from app.modules.billing.models import SettlementStatus


class DoctorFeeRuleCreate(BaseModel):
    branch_id: str | None = None
    department_id: str | None = Field(default=None, max_length=80)
    practitioner_id: str | None = None
    appointment_type: AppointmentType
    treatment_type: str | None = Field(default=None, max_length=80)
    fee_amount: int = Field(ge=0)
    share_type: FeeShareType = FeeShareType.PERCENTAGE
    doctor_share_percentage: int | None = Field(default=None, ge=0, le=100)
    doctor_fixed_amount: int | None = Field(default=None, ge=0)
    share_tax_with_doctor: bool = False


class DoctorFeeRuleRead(DoctorFeeRuleCreate):
    id: str
    tenant_id: str
    is_active: bool
    created_at: datetime


class InvoiceCreateFromConsultation(BaseModel):
    consultation_id: str
    discount_amount: int = Field(default=0, ge=0)
    discount_approval_id: str | None = None
    tax_rule_id: str | None = None
    created_by_user_id: str | None = None


class InvoiceItemRead(BaseModel):
    id: str
    tenant_id: str
    invoice_id: str
    item_type: str
    description: str
    quantity: int
    unit_amount: int
    total_amount: int
    created_at: datetime


class InvoiceRead(BaseModel):
    id: str
    tenant_id: str
    branch_id: str
    patient_id: str
    appointment_id: str | None
    consultation_id: str | None
    ip_admission_id: str | None = None
    physiotherapy_case_id: str | None = None
    invoice_number: str
    status: InvoiceStatus
    subtotal_amount: int
    discount_amount: int
    taxable_amount: int
    tax_amount: int
    tax_rule_id: str | None
    total_amount: int
    paid_amount: int
    balance_amount: int
    doctor_share_amount: int
    clinic_share_amount: int
    fee_rule_id: str | None
    discount_approval_id: str | None
    created_by_user_id: str | None
    created_at: datetime
    updated_at: datetime


class InvoiceDetailRead(BaseModel):
    invoice: InvoiceRead
    items: list[InvoiceItemRead]
    payments: list["PaymentRead"] = []


class PaymentCreate(BaseModel):
    method: PaymentMethod
    amount: int = Field(gt=0)
    reference_number: str | None = Field(default=None, max_length=120)
    collected_by_user_id: str | None = None


class PaymentRead(BaseModel):
    id: str
    tenant_id: str
    branch_id: str
    invoice_id: str
    method: PaymentMethod
    amount: int
    reference_number: str | None
    status: PaymentStatus
    collected_by_user_id: str | None
    collected_at: datetime
    refunded_at: datetime | None
    refund_reason: str | None


class RefundRequest(BaseModel):
    reason: str = Field(min_length=2, max_length=500)
    actor_user_id: str | None = None


class CancelInvoiceRequest(BaseModel):
    reason: str = Field(min_length=2, max_length=500)
    actor_user_id: str | None = None


class DoctorSettlementSummary(BaseModel):
    tenant_id: str
    practitioner_id: str | None
    invoice_count: int
    total_invoice_amount: int
    total_paid_amount: int
    total_doctor_share: int
    doctor_share_paid_basis: int
    pending_doctor_share: int


class TaxRuleCreate(BaseModel):
    branch_id: str | None = None
    name: str = Field(min_length=2, max_length=120)
    tax_percentage: int = Field(default=0, ge=0, le=100)
    tax_label: str = Field(default="GST", max_length=40)
    created_by_user_id: str | None = None


class TaxRuleRead(TaxRuleCreate):
    id: str
    tenant_id: str
    is_active: bool
    created_at: datetime


class DiscountApprovalCreate(BaseModel):
    branch_id: str
    appointment_id: str | None = None
    consultation_id: str | None = None
    requested_amount: int = Field(ge=1)
    reason: str = Field(min_length=2, max_length=500)
    requested_by_user_id: str | None = None


class DiscountApprovalDecision(BaseModel):
    status: ApprovalStatus
    approved_by_user_id: str | None = None


class DiscountApprovalRead(DiscountApprovalCreate):
    id: str
    tenant_id: str
    status: ApprovalStatus
    approved_by_user_id: str | None
    created_at: datetime
    decided_at: datetime | None


class CreditNoteCreate(BaseModel):
    amount: int = Field(gt=0)
    reason: str = Field(min_length=2, max_length=500)
    created_by_user_id: str | None = None


class CreditNoteRead(BaseModel):
    id: str
    tenant_id: str
    branch_id: str
    invoice_id: str
    credit_note_number: str
    amount: int
    reason: str
    status: CreditNoteStatus
    created_by_user_id: str | None
    created_at: datetime


class DueCollectionReport(BaseModel):
    tenant_id: str
    branch_id: str | None
    invoice_count: int
    total_due_amount: int
    rows: list[dict]


class RevenueReport(BaseModel):
    tenant_id: str
    group_by: str
    rows: list[dict]
    total_invoice_amount: int
    total_paid_amount: int
    total_tax_amount: int
    total_doctor_share: int


class DoctorSettlementFinalize(BaseModel):
    practitioner_id: str | None = None
    branch_id: str | None = None
    finalized_by_user_id: str | None = None


class DoctorSettlementRead(DoctorSettlementSummary):
    id: str
    branch_id: str | None
    settlement_amount: int
    status: SettlementStatus
    finalized_by_user_id: str | None
    finalized_at: datetime


InvoiceDetailRead.model_rebuild()
