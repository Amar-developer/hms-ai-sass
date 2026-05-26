from datetime import datetime
from enum import Enum

from sqlmodel import Field, SQLModel

from app.modules.appointments.models import AppointmentType
from app.modules.tenants.models import new_id, now_utc


class FeeShareType(str, Enum):
    PERCENTAGE = "percentage"
    FIXED = "fixed"


class InvoiceStatus(str, Enum):
    DRAFT = "draft"
    ISSUED = "issued"
    PARTIALLY_PAID = "partially_paid"
    PAID = "paid"
    CANCELLED = "cancelled"
    REFUNDED = "refunded"


class PaymentMethod(str, Enum):
    CASH = "cash"
    CREDIT_CARD = "credit_card"
    DEBIT_CARD = "debit_card"
    UPI = "upi"
    GPAY = "gpay"
    PAYTM = "paytm"
    BANK_TRANSFER = "bank_transfer"


class PaymentStatus(str, Enum):
    RECORDED = "recorded"
    REFUNDED = "refunded"


class ApprovalStatus(str, Enum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"


class DiscountType(str, Enum):
    PERCENTAGE = "percentage"
    FIXED = "fixed"


class CreditNoteStatus(str, Enum):
    ISSUED = "issued"
    CANCELLED = "cancelled"


class SettlementStatus(str, Enum):
    FINALIZED = "finalized"
    CANCELLED = "cancelled"


class TaxRule(SQLModel, table=True):
    id: str = Field(default_factory=lambda: new_id("taxrule"), primary_key=True)
    tenant_id: str = Field(index=True, foreign_key="tenant.id")
    branch_id: str | None = Field(default=None, index=True, foreign_key="branch.id")
    name: str = Field(min_length=2, max_length=120)
    tax_percentage: int = Field(default=0, ge=0, le=100)
    tax_label: str = Field(default="GST", max_length=40)
    service_scope: str = Field(default="all", index=True, max_length=40)
    is_active: bool = Field(default=True, index=True)
    created_by_user_id: str | None = Field(default=None, index=True)
    created_at: datetime = Field(default_factory=now_utc, index=True)


class DoctorFeeRule(SQLModel, table=True):
    id: str = Field(default_factory=lambda: new_id("feerule"), primary_key=True)
    tenant_id: str = Field(index=True, foreign_key="tenant.id")
    branch_id: str | None = Field(default=None, index=True, foreign_key="branch.id")
    department_id: str | None = Field(default=None, index=True)
    practitioner_id: str | None = Field(default=None, index=True)
    appointment_type: AppointmentType = Field(index=True)
    treatment_type: str | None = Field(default=None, index=True, max_length=80)
    fee_amount: int = Field(ge=0)
    share_type: FeeShareType = Field(default=FeeShareType.PERCENTAGE, index=True)
    doctor_share_percentage: int | None = Field(default=None, ge=0, le=100)
    doctor_fixed_amount: int | None = Field(default=None, ge=0)
    share_tax_with_doctor: bool = Field(default=False, index=True)
    is_active: bool = Field(default=True, index=True)
    created_at: datetime = Field(default_factory=now_utc, index=True)


class Invoice(SQLModel, table=True):
    id: str = Field(default_factory=lambda: new_id("invoice"), primary_key=True)
    tenant_id: str = Field(index=True, foreign_key="tenant.id")
    branch_id: str = Field(index=True, foreign_key="branch.id")
    patient_id: str = Field(index=True, foreign_key="patient.id")
    appointment_id: str | None = Field(default=None, index=True, foreign_key="appointment.id")
    consultation_id: str | None = Field(default=None, index=True, foreign_key="consultation.id")
    lab_order_id: str | None = Field(default=None, index=True, foreign_key="laborder.id")
    pharmacy_issue_id: str | None = Field(default=None, index=True, foreign_key="pharmacyissue.id")
    ip_admission_id: str | None = Field(default=None, index=True, foreign_key="ipadmission.id")
    physiotherapy_case_id: str | None = Field(default=None, index=True, foreign_key="physiotherapycase.id")
    patient_subscription_enrollment_id: str | None = Field(default=None, index=True, foreign_key="patientsubscriptionenrollment.id")
    patient_subscription_plan_id: str | None = Field(default=None, index=True, foreign_key="patientsubscriptionplan.id")
    invoice_number: str = Field(index=True, min_length=3, max_length=60)
    status: InvoiceStatus = Field(default=InvoiceStatus.ISSUED, index=True)
    subtotal_amount: int = Field(default=0, ge=0)
    discount_amount: int = Field(default=0, ge=0)
    membership_discount_amount: int = Field(default=0, ge=0)
    taxable_amount: int = Field(default=0, ge=0)
    tax_amount: int = Field(default=0, ge=0)
    tax_rule_id: str | None = Field(default=None, index=True)
    total_amount: int = Field(default=0, ge=0)
    paid_amount: int = Field(default=0, ge=0)
    balance_amount: int = Field(default=0, ge=0)
    doctor_share_amount: int = Field(default=0, ge=0)
    clinic_share_amount: int = Field(default=0, ge=0)
    fee_rule_id: str | None = Field(default=None, index=True, foreign_key="doctorfeerule.id")
    discount_approval_id: str | None = Field(default=None, index=True)
    discount_offer_id: str | None = Field(default=None, index=True)
    created_by_user_id: str | None = Field(default=None, index=True)
    created_at: datetime = Field(default_factory=now_utc, index=True)
    updated_at: datetime = Field(default_factory=now_utc)


class InvoiceItem(SQLModel, table=True):
    id: str = Field(default_factory=lambda: new_id("invitem"), primary_key=True)
    tenant_id: str = Field(index=True, foreign_key="tenant.id")
    invoice_id: str = Field(index=True, foreign_key="invoice.id")
    item_type: str = Field(default="consultation", max_length=80)
    description: str = Field(max_length=260)
    quantity: int = Field(default=1, ge=1)
    unit_amount: int = Field(ge=0)
    total_amount: int = Field(ge=0)
    created_at: datetime = Field(default_factory=now_utc, index=True)


class Payment(SQLModel, table=True):
    id: str = Field(default_factory=lambda: new_id("payment"), primary_key=True)
    tenant_id: str = Field(index=True, foreign_key="tenant.id")
    branch_id: str = Field(index=True, foreign_key="branch.id")
    invoice_id: str = Field(index=True, foreign_key="invoice.id")
    method: PaymentMethod = Field(index=True)
    amount: int = Field(gt=0)
    reference_number: str | None = Field(default=None, max_length=120)
    status: PaymentStatus = Field(default=PaymentStatus.RECORDED, index=True)
    collected_by_user_id: str | None = Field(default=None, index=True)
    collected_at: datetime = Field(default_factory=now_utc, index=True)
    refunded_at: datetime | None = Field(default=None, index=True)
    refund_reason: str | None = Field(default=None, max_length=500)


class DiscountApproval(SQLModel, table=True):
    id: str = Field(default_factory=lambda: new_id("discount"), primary_key=True)
    tenant_id: str = Field(index=True, foreign_key="tenant.id")
    branch_id: str = Field(index=True, foreign_key="branch.id")
    appointment_id: str | None = Field(default=None, index=True)
    consultation_id: str | None = Field(default=None, index=True)
    requested_amount: int = Field(ge=1)
    reason: str = Field(min_length=2, max_length=500)
    status: ApprovalStatus = Field(default=ApprovalStatus.PENDING, index=True)
    requested_by_user_id: str | None = Field(default=None, index=True)
    approved_by_user_id: str | None = Field(default=None, index=True)
    created_at: datetime = Field(default_factory=now_utc, index=True)
    decided_at: datetime | None = Field(default=None, index=True)


class DiscountOffer(SQLModel, table=True):
    id: str = Field(default_factory=lambda: new_id("offer"), primary_key=True)
    tenant_id: str = Field(index=True, foreign_key="tenant.id")
    branch_id: str | None = Field(default=None, index=True, foreign_key="branch.id")
    name: str = Field(min_length=2, max_length=120)
    code: str | None = Field(default=None, index=True, max_length=40)
    service_scope: str = Field(default="all", index=True, max_length=40)
    discount_type: DiscountType = Field(default=DiscountType.PERCENTAGE, index=True)
    value: int = Field(ge=0)
    minimum_bill_amount: int = Field(default=0, ge=0)
    max_discount_amount: int | None = Field(default=None, ge=0)
    valid_from: datetime | None = Field(default=None, index=True)
    valid_until: datetime | None = Field(default=None, index=True)
    is_active: bool = Field(default=True, index=True)
    created_by_user_id: str | None = Field(default=None, index=True)
    created_at: datetime = Field(default_factory=now_utc, index=True)


class CreditNote(SQLModel, table=True):
    id: str = Field(default_factory=lambda: new_id("credit"), primary_key=True)
    tenant_id: str = Field(index=True, foreign_key="tenant.id")
    branch_id: str = Field(index=True, foreign_key="branch.id")
    invoice_id: str = Field(index=True, foreign_key="invoice.id")
    credit_note_number: str = Field(index=True, min_length=3, max_length=60)
    amount: int = Field(gt=0)
    reason: str = Field(min_length=2, max_length=500)
    status: CreditNoteStatus = Field(default=CreditNoteStatus.ISSUED, index=True)
    created_by_user_id: str | None = Field(default=None, index=True)
    created_at: datetime = Field(default_factory=now_utc, index=True)


class DoctorSettlement(SQLModel, table=True):
    id: str = Field(default_factory=lambda: new_id("settlement"), primary_key=True)
    tenant_id: str = Field(index=True, foreign_key="tenant.id")
    branch_id: str | None = Field(default=None, index=True)
    practitioner_id: str | None = Field(default=None, index=True)
    invoice_count: int = Field(default=0, ge=0)
    total_invoice_amount: int = Field(default=0, ge=0)
    total_paid_amount: int = Field(default=0, ge=0)
    total_doctor_share: int = Field(default=0, ge=0)
    settlement_amount: int = Field(default=0, ge=0)
    status: SettlementStatus = Field(default=SettlementStatus.FINALIZED, index=True)
    finalized_by_user_id: str | None = Field(default=None, index=True)
    finalized_at: datetime = Field(default_factory=now_utc, index=True)
