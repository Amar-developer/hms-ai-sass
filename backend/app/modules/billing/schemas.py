from datetime import datetime

from pydantic import BaseModel, Field

from app.modules.appointments.models import AppointmentType
from app.modules.billing.models import ApprovalStatus, CreditNoteStatus, DiscountType, FeeShareType, InvoiceStatus, PaymentMethod, PaymentStatus
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
    discount_offer_id: str | None = None
    tax_rule_id: str | None = None
    created_by_user_id: str | None = None


class InvoiceCreateFromLabOrder(BaseModel):
    lab_order_id: str
    discount_offer_id: str | None = None
    tax_rule_id: str | None = None
    created_by_user_id: str | None = None


class InvoiceCreateFromPharmacyIssue(BaseModel):
    pharmacy_issue_id: str
    discount_offer_id: str | None = None
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
    mrp_amount: int = 0
    selling_amount: int = 0
    buying_amount: int = 0
    supplier_id: str | None = None
    external_source: str | None = None
    external_slug: str | None = None
    external_item_code: str | None = None
    created_at: datetime


class InvoiceItemSupplierUpdate(BaseModel):
    supplier_id: str | None = None


class InvoiceItemSupplierOptionRead(BaseModel):
    supplier: str
    supplier_name: str
    buying_price: int = 0


class InvoiceRead(BaseModel):
    id: str
    tenant_id: str
    branch_id: str
    patient_id: str
    appointment_id: str | None
    consultation_id: str | None
    lab_order_id: str | None = None
    pharmacy_issue_id: str | None = None
    ip_admission_id: str | None = None
    physiotherapy_case_id: str | None = None
    patient_subscription_enrollment_id: str | None = None
    patient_subscription_plan_id: str | None = None
    invoice_number: str
    status: InvoiceStatus
    subtotal_amount: int
    discount_amount: int
    membership_discount_amount: int = 0
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
    discount_offer_id: str | None = None
    created_by_user_id: str | None
    created_at: datetime
    updated_at: datetime


class InvoiceMembershipBenefitRead(BaseModel):
    has_active_subscription: bool = False
    is_applied: bool = False
    can_apply: bool = False
    service_type: str | None = None
    plan_id: str | None = None
    plan_name: str | None = None
    discount_amount: int = 0
    payable_amount: int = 0
    reason: str | None = None


class InvoiceDetailRead(BaseModel):
    invoice: InvoiceRead
    items: list[InvoiceItemRead]
    payments: list["PaymentRead"] = []
    membership_benefit: InvoiceMembershipBenefitRead | None = None


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
    branch_id: str | None = None
    invoice_count: int
    total_invoice_amount: int
    total_paid_amount: int
    total_doctor_share: int
    doctor_share_paid_basis: int
    finalized_settlement_amount: int = 0
    payable_settlement_amount: int = 0
    pending_doctor_share: int
    can_finalize: bool = False
    latest_finalized_at: datetime | None = None


class TaxRuleCreate(BaseModel):
    branch_id: str | None = None
    name: str = Field(min_length=2, max_length=120)
    tax_percentage: int = Field(default=0, ge=0, le=100)
    tax_label: str = Field(default="GST", max_length=40)
    service_scope: str = Field(default="all", max_length=40)
    created_by_user_id: str | None = None


class TaxRuleRead(TaxRuleCreate):
    id: str
    tenant_id: str
    is_active: bool
    created_at: datetime


class TaxRuleUpdate(BaseModel):
    branch_id: str | None = None
    name: str | None = Field(default=None, min_length=2, max_length=120)
    tax_percentage: int | None = Field(default=None, ge=0, le=100)
    tax_label: str | None = Field(default=None, max_length=40)
    service_scope: str | None = Field(default=None, max_length=40)
    is_active: bool | None = None


class DiscountOfferCreate(BaseModel):
    branch_id: str | None = None
    name: str = Field(min_length=2, max_length=120)
    code: str | None = Field(default=None, max_length=40)
    service_scope: str = Field(default="all", max_length=40)
    discount_type: DiscountType = DiscountType.PERCENTAGE
    value: int = Field(ge=0)
    minimum_bill_amount: int = Field(default=0, ge=0)
    max_discount_amount: int | None = Field(default=None, ge=0)
    valid_from: datetime | None = None
    valid_until: datetime | None = None
    created_by_user_id: str | None = None


class DiscountOfferUpdate(BaseModel):
    branch_id: str | None = None
    name: str | None = Field(default=None, min_length=2, max_length=120)
    code: str | None = Field(default=None, max_length=40)
    service_scope: str | None = Field(default=None, max_length=40)
    discount_type: DiscountType | None = None
    value: int | None = Field(default=None, ge=0)
    minimum_bill_amount: int | None = Field(default=None, ge=0)
    max_discount_amount: int | None = Field(default=None, ge=0)
    valid_from: datetime | None = None
    valid_until: datetime | None = None
    is_active: bool | None = None


class DiscountOfferRead(DiscountOfferCreate):
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
