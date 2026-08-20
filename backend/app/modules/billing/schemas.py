from datetime import date, datetime, time
from decimal import Decimal

from pydantic import BaseModel as PydanticBaseModel
from pydantic import Field, field_serializer, model_validator

from app.core.validation import (
    AppointmentId,
    BranchId,
    ConsultationId,
    LabOrderId,
    PharmacyIssueId,
    PractitionerId,
    UserId,
)
from app.modules.appointments.models import AppointmentType
from app.modules.billing.models import (
    ApprovalStatus,
    BillingAdjustmentStatus,
    BillingAdjustmentType,
    CreditNoteStatus,
    DiscountType,
    FeeShareType,
    InvoiceStatus,
    PaymentMethod,
    PaymentStatus,
)
from app.modules.billing.models import SettlementStatus
from app.modules.billing.services.money import decimal_values_to_json


class BaseModel(PydanticBaseModel):
    """Billing schema base that keeps decimal API fields JSON-numeric."""

    @field_serializer("*", when_used="json", check_fields=False)
    def serialize_decimal_fields(self, value):
        return decimal_values_to_json(value)


class DoctorFeeRuleCreate(BaseModel):
    branch_id: BranchId | None = None
    department_id: str | None = Field(default=None, max_length=80)
    practitioner_id: PractitionerId | None = None
    appointment_type: AppointmentType
    treatment_type: str | None = Field(default=None, max_length=80)
    fee_amount: Decimal = Field(ge=0, decimal_places=2)
    share_type: FeeShareType = FeeShareType.PERCENTAGE
    doctor_share_percentage: Decimal | None = Field(
        default=None, ge=0, le=100, decimal_places=4
    )
    doctor_fixed_amount: Decimal | None = Field(default=None, ge=0, decimal_places=2)
    share_tax_with_doctor: bool = False


class DoctorFeeRuleRead(DoctorFeeRuleCreate):
    id: str
    tenant_id: str
    is_active: bool
    created_at: datetime


class InvoiceCreateFromConsultation(BaseModel):
    consultation_id: ConsultationId
    discount_amount: Decimal = Field(default=Decimal("0"), ge=0, decimal_places=2)
    discount_approval_id: str | None = None
    discount_offer_id: str | None = None
    tax_rule_id: str | None = None
    created_by_user_id: UserId | None = None


class PendingConsultationInvoiceRead(BaseModel):
    """Signed consultation that does not yet have its consultation-fee invoice."""

    consultation_id: ConsultationId
    appointment_id: AppointmentId
    branch_id: BranchId
    patient_id: str
    patient_name: str
    practitioner_id: PractitionerId | None = None
    practitioner_name: str | None = None
    token_number: str | None = None
    appointment_date: date
    appointment_time: time | None = None
    consultation_signed_at: datetime | None = None
    consultation_created_at: datetime


class InvoiceCreateFromLabOrder(BaseModel):
    lab_order_id: LabOrderId
    discount_offer_id: str | None = None
    tax_rule_id: str | None = None
    created_by_user_id: UserId | None = None


class InvoiceCreateFromPharmacyIssue(BaseModel):
    pharmacy_issue_id: PharmacyIssueId
    discount_offer_id: str | None = None
    tax_rule_id: str | None = None
    created_by_user_id: UserId | None = None


class InvoiceItemRead(BaseModel):
    id: str
    tenant_id: str
    invoice_id: str
    item_type: str
    description: str
    quantity: int
    unit_amount: Decimal
    total_amount: Decimal
    discount_amount: Decimal | None = None
    membership_discount_amount: Decimal | None = None
    mrp_amount: Decimal = Decimal("0")
    selling_amount: Decimal = Decimal("0")
    buying_amount: Decimal = Decimal("0")
    supplier_id: str | None = None
    vendor_name: str | None = None
    vendor_amount: Decimal = Decimal("0")
    external_source: str | None = None
    external_slug: str | None = None
    external_item_code: str | None = None
    created_at: datetime


class InvoiceItemSupplierUpdate(BaseModel):
    supplier_id: str | None = None


class InvoiceItemSupplierOptionRead(BaseModel):
    supplier: str
    supplier_name: str
    buying_price: Decimal = Decimal("0")


class InvoiceRead(BaseModel):
    id: str
    tenant_id: str
    branch_id: str
    patient_id: str
    patient_name: str | None = None
    patient_number: str | None = None
    appointment_id: str | None
    appointment_type: AppointmentType | None = None
    consultation_id: str | None
    lab_order_id: str | None = None
    pharmacy_issue_id: str | None = None
    ip_admission_id: str | None = None
    physiotherapy_case_id: str | None = None
    home_care_booking_id: str | None = None
    patient_subscription_enrollment_id: str | None = None
    patient_subscription_plan_id: str | None = None
    invoice_number: str
    status: InvoiceStatus
    subtotal_amount: Decimal
    discount_amount: Decimal
    membership_discount_amount: Decimal = Decimal("0")
    membership_free_items_amount: Decimal = Decimal("0")
    membership_item_discount_amount: Decimal = Decimal("0")
    membership_regular_items_amount: Decimal = Decimal("0")
    taxable_amount: Decimal
    tax_amount: Decimal
    tax_rule_id: str | None
    tax_percentage: Decimal = Decimal("0")
    tax_label: str | None = None
    total_amount: Decimal
    paid_amount: Decimal
    balance_amount: Decimal
    doctor_share_amount: Decimal
    clinic_share_amount: Decimal
    fee_rule_id: str | None
    discount_approval_id: str | None
    discount_offer_id: str | None = None
    offer_discount_amount: Decimal = Decimal("0")
    offer_discount_name: str | None = None
    offer_discount_type: DiscountType | None = None
    offer_discount_value: Decimal = Decimal("0")
    approved_discount_amount: Decimal = Decimal("0")
    payment_methods: list[PaymentMethod] = Field(default_factory=list)
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
    discount_amount: Decimal = Decimal("0")
    free_items_amount: Decimal = Decimal("0")
    item_discount_amount: Decimal = Decimal("0")
    regular_items_amount: Decimal = Decimal("0")
    payable_amount: Decimal = Decimal("0")
    reason: str | None = None


class InvoiceOfferBenefitRead(BaseModel):
    is_applied: bool = False
    can_apply: bool = False
    can_remove: bool = False
    eligible_count: int = 0
    offer_id: str | None = None
    offer_name: str | None = None
    offer_code: str | None = None
    discount_type: DiscountType | None = None
    discount_value: Decimal = Decimal("0")
    discount_amount: Decimal = Decimal("0")
    payable_amount: Decimal = Decimal("0")
    reason: str | None = None


class InvoiceOfferApply(BaseModel):
    discount_offer_id: str | None = None
    code: str | None = Field(default=None, max_length=60)


class InvoiceDetailRead(BaseModel):
    status: InvoiceStatus
    invoice: InvoiceRead
    items: list[InvoiceItemRead]
    payments: list["PaymentRead"] = []
    credit_notes: list["CreditNoteRead"] = []
    ledger_entries: list["BillingLedgerEntryRead"] = []
    adjustment_requests: list["BillingAdjustmentRequestRead"] = []
    membership_benefit: InvoiceMembershipBenefitRead | None = None
    offer_benefit: InvoiceOfferBenefitRead | None = None


class PaymentCreate(BaseModel):
    method: PaymentMethod
    amount: Decimal = Field(gt=0, decimal_places=2)
    reference_number: str | None = Field(default=None, max_length=120)
    collected_by_user_id: UserId | None = None


class PaymentRead(BaseModel):
    id: str
    tenant_id: str
    branch_id: str
    invoice_id: str
    method: PaymentMethod
    amount: Decimal
    reference_number: str | None
    status: PaymentStatus
    collected_by_user_id: str | None
    collected_at: datetime
    refunded_at: datetime | None
    refund_reason: str | None


class BillingLedgerEntryRead(BaseModel):
    id: str
    tenant_id: str
    branch_id: str
    invoice_id: str
    invoice_number: str
    entry_type: str
    description: str
    debit_amount: Decimal
    credit_amount: Decimal
    invoice_total_delta: Decimal
    paid_amount_delta: Decimal
    balance_amount_delta: Decimal
    status_after: InvoiceStatus
    reason: str | None
    related_payment_id: str | None
    related_credit_note_id: str | None
    actor_user_id: str | None
    actor_user_name: str | None = None
    created_at: datetime


class RefundRequest(BaseModel):
    reason: str = Field(min_length=2, max_length=500)
    amount: Decimal | None = Field(default=None, gt=0, decimal_places=2)
    payment_method: PaymentMethod | None = None
    payment_reference: str | None = Field(default=None, max_length=120)
    actor_user_id: UserId | None = None


class CancelInvoiceRequest(BaseModel):
    reason: str = Field(min_length=2, max_length=500)
    actor_user_id: UserId | None = None


class BillingAdjustmentRequestCreate(BaseModel):
    request_type: BillingAdjustmentType
    amount: Decimal | None = Field(default=None, ge=0, decimal_places=2)
    reason: str = Field(min_length=2, max_length=500)
    requested_by_user_id: UserId | None = None
    payment_method: PaymentMethod | None = None
    payment_reference: str | None = Field(default=None, max_length=120)


class BillingAdjustmentDecision(BaseModel):
    reason: str | None = Field(default=None, max_length=500)
    actor_user_id: UserId | None = None


class BillingAdjustmentRequestRead(BaseModel):
    id: str
    tenant_id: str
    branch_id: str
    invoice_id: str
    request_type: BillingAdjustmentType
    amount: Decimal
    reason: str
    status: BillingAdjustmentStatus
    requested_by_user_id: str | None
    requested_by_user_name: str | None = None
    approved_by_user_id: str | None
    approved_by_user_name: str | None = None
    rejected_by_user_id: str | None
    executed_by_user_id: str | None
    executed_by_user_name: str | None = None
    decision_reason: str | None
    payment_method: PaymentMethod | None
    payment_reference: str | None
    created_at: datetime
    decided_at: datetime | None
    executed_at: datetime | None


class AmendInvoiceRequest(BaseModel):
    reason: str = Field(min_length=2, max_length=500)
    actor_user_id: UserId | None = None


class DoctorSettlementSummary(BaseModel):
    tenant_id: str
    practitioner_id: str | None
    branch_id: str | None = None
    invoice_count: int
    total_invoice_amount: Decimal
    total_paid_amount: Decimal
    total_doctor_share: Decimal
    doctor_share_paid_basis: Decimal
    finalized_settlement_amount: Decimal = Decimal("0")
    payable_settlement_amount: Decimal = Decimal("0")
    settlement_recovery_amount: Decimal = Decimal("0")
    pending_doctor_share: Decimal
    can_finalize: bool = False
    latest_finalized_at: datetime | None = None


class TaxRuleCreate(BaseModel):
    branch_id: BranchId | None = None
    name: str = Field(min_length=2, max_length=120)
    tax_percentage: Decimal = Field(
        default=Decimal("0"), ge=0, le=100, decimal_places=4
    )
    tax_label: str = Field(default="GST", max_length=40)
    service_scope: str = Field(default="all", max_length=40)
    created_by_user_id: UserId | None = None


class TaxRuleRead(TaxRuleCreate):
    id: str
    tenant_id: str
    is_active: bool
    updated_by_user_id: UserId | None = None
    created_at: datetime


class TaxRuleUpdate(BaseModel):
    branch_id: BranchId | None = None
    name: str | None = Field(default=None, min_length=2, max_length=120)
    tax_percentage: Decimal | None = Field(default=None, ge=0, le=100, decimal_places=4)
    tax_label: str | None = Field(default=None, max_length=40)
    service_scope: str | None = Field(default=None, max_length=40)
    is_active: bool | None = None


class DiscountOfferCreate(BaseModel):
    branch_id: BranchId | None = None
    name: str = Field(min_length=2, max_length=120)
    code: str | None = Field(default=None, max_length=40)
    service_scope: str = Field(default="all", max_length=40)
    discount_type: DiscountType = DiscountType.PERCENTAGE
    value: Decimal = Field(ge=0, decimal_places=4)
    minimum_bill_amount: Decimal = Field(default=Decimal("0"), ge=0, decimal_places=2)
    max_discount_amount: Decimal | None = Field(default=None, ge=0, decimal_places=2)
    valid_from: datetime | None = None
    valid_until: datetime | None = None
    created_by_user_id: UserId | None = None

    @model_validator(mode="after")
    def validate_percentage_value(self) -> "DiscountOfferCreate":
        if self.discount_type == DiscountType.PERCENTAGE and self.value > 100:
            raise ValueError("Percentage discount cannot exceed 100")
        return self


class DiscountOfferUpdate(BaseModel):
    branch_id: BranchId | None = None
    name: str | None = Field(default=None, min_length=2, max_length=120)
    code: str | None = Field(default=None, max_length=40)
    service_scope: str | None = Field(default=None, max_length=40)
    discount_type: DiscountType | None = None
    value: Decimal | None = Field(default=None, ge=0, decimal_places=4)
    minimum_bill_amount: Decimal | None = Field(default=None, ge=0, decimal_places=2)
    max_discount_amount: Decimal | None = Field(default=None, ge=0, decimal_places=2)
    valid_from: datetime | None = None
    valid_until: datetime | None = None
    is_active: bool | None = None


class DiscountOfferRead(DiscountOfferCreate):
    id: str
    tenant_id: str
    is_active: bool
    updated_by_user_id: UserId | None = None
    created_at: datetime


class DiscountApprovalCreate(BaseModel):
    branch_id: BranchId
    appointment_id: AppointmentId | None = None
    consultation_id: ConsultationId | None = None
    requested_amount: Decimal = Field(gt=0, decimal_places=2)
    reason: str = Field(min_length=2, max_length=500)
    requested_by_user_id: UserId | None = None

    @model_validator(mode="after")
    def validate_target_reference(self) -> "DiscountApprovalCreate":
        if not self.appointment_id and not self.consultation_id:
            raise ValueError("Appointment or consultation is required")
        return self


class DiscountApprovalDecision(BaseModel):
    status: ApprovalStatus
    approved_by_user_id: UserId | None = None


class DiscountApprovalRead(DiscountApprovalCreate):
    id: str
    tenant_id: str
    status: ApprovalStatus
    approved_by_user_id: str | None
    created_at: datetime
    decided_at: datetime | None


class CreditNoteCreate(BaseModel):
    amount: Decimal = Field(gt=0, decimal_places=2)
    reason: str = Field(min_length=2, max_length=500)
    created_by_user_id: UserId | None = None


class CreditNoteRead(BaseModel):
    id: str
    tenant_id: str
    branch_id: str
    invoice_id: str
    credit_note_number: str
    amount: Decimal
    reason: str
    status: CreditNoteStatus
    created_by_user_id: str | None
    created_at: datetime


class DueCollectionReport(BaseModel):
    tenant_id: str
    branch_id: str | None
    invoice_count: int
    total_due_amount: Decimal
    rows: list[dict]


class RevenueReport(BaseModel):
    tenant_id: str
    group_by: str
    rows: list[dict]
    total_billed_amount: Decimal = Decimal("0")
    total_invoice_amount: Decimal
    total_paid_amount: Decimal
    total_tax_amount: Decimal
    total_doctor_share: Decimal
    total_discount_amount: Decimal = Decimal("0")
    total_approved_discount_amount: Decimal = Decimal("0")
    total_offer_discount_amount: Decimal = Decimal("0")
    total_membership_discount_amount: Decimal = Decimal("0")


class CollectionReport(BaseModel):
    tenant_id: str
    branch_id: str | None
    payment_count: int
    collected_amount: Decimal
    refunded_amount: Decimal
    net_collected_amount: Decimal


class DoctorSettlementFinalize(BaseModel):
    practitioner_id: PractitionerId | None = None
    branch_id: BranchId | None = None
    finalized_by_user_id: UserId | None = None


class DoctorSettlementRead(DoctorSettlementSummary):
    id: str
    branch_id: str | None
    settlement_amount: Decimal
    status: SettlementStatus
    finalized_by_user_id: str | None
    finalized_at: datetime


InvoiceDetailRead.model_rebuild()
