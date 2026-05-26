from datetime import datetime
from enum import Enum

from sqlmodel import Field, SQLModel

from app.modules.tenants.models import new_id, now_utc


class PharmacyIssueSource(str, Enum):
    CONSULTATION = "consultation"
    OP_DIRECT = "op_direct"
    EXTERNAL_PRESCRIPTION = "external_prescription"


class PharmacyIssueStatus(str, Enum):
    REQUESTED = "requested"
    PARTIALLY_DISPENSED = "partially_dispensed"
    DISPENSED = "dispensed"
    CANCELLED = "cancelled"


class StockLedgerMovement(str, Enum):
    PURCHASE = "purchase"
    DISPENSE = "dispense"
    ADJUSTMENT = "adjustment"
    RETURN = "return"


class MedicineCatalog(SQLModel, table=True):
    id: str = Field(default_factory=lambda: new_id("medcat"), primary_key=True)
    tenant_id: str = Field(index=True, foreign_key="tenant.id")
    branch_id: str | None = Field(default=None, index=True, foreign_key="branch.id")
    code: str = Field(min_length=2, max_length=60, index=True)
    name: str = Field(min_length=2, max_length=220, index=True)
    generic_name: str | None = Field(default=None, max_length=220, index=True)
    form: str | None = Field(default=None, max_length=80)
    strength: str | None = Field(default=None, max_length=80)
    manufacturer: str | None = Field(default=None, max_length=220)
    supplier_id: str | None = Field(default=None, index=True, foreign_key="pharmacysupplier.id")
    purchase_price: int = Field(default=0, ge=0)
    default_sale_price: int = Field(default=0, ge=0)
    reorder_level: int = Field(default=0, ge=0)
    is_active: bool = Field(default=True, index=True)
    created_by_user_id: str | None = Field(default=None, index=True)
    updated_by_user_id: str | None = Field(default=None, index=True)
    created_at: datetime = Field(default_factory=now_utc, index=True)
    updated_at: datetime = Field(default_factory=now_utc)


class PharmacySupplier(SQLModel, table=True):
    id: str = Field(default_factory=lambda: new_id("supplier"), primary_key=True)
    tenant_id: str = Field(index=True, foreign_key="tenant.id")
    supplier_number: str | None = Field(default=None, index=True, max_length=60)
    name: str = Field(min_length=2, max_length=220, index=True)
    gstin: str | None = Field(default=None, max_length=40)
    phone: str | None = Field(default=None, max_length=40)
    email: str | None = Field(default=None, max_length=160)
    address: str | None = Field(default=None, max_length=500)
    is_active: bool = Field(default=True, index=True)
    created_by_user_id: str | None = Field(default=None, index=True)
    created_at: datetime = Field(default_factory=now_utc, index=True)
    updated_at: datetime = Field(default_factory=now_utc)


class PharmacyPurchase(SQLModel, table=True):
    id: str = Field(default_factory=lambda: new_id("purchase"), primary_key=True)
    tenant_id: str = Field(index=True, foreign_key="tenant.id")
    branch_id: str = Field(index=True, foreign_key="branch.id")
    supplier_id: str | None = Field(default=None, index=True, foreign_key="pharmacysupplier.id")
    purchase_order_id: str | None = Field(default=None, max_length=120, index=True)
    invoice_number: str | None = Field(default=None, max_length=120, index=True)
    purchase_date: datetime = Field(default_factory=now_utc, index=True)
    discount_percentage: int = Field(default=0, ge=0)
    discount_amount: int = Field(default=0, ge=0)
    taxable_amount: int = Field(default=0, ge=0)
    cgst_amount: int = Field(default=0, ge=0)
    sgst_amount: int = Field(default=0, ge=0)
    gst_amount: int = Field(default=0, ge=0)
    total_amount: int = Field(default=0, ge=0)
    purchased_by_user_id: str | None = Field(default=None, index=True)
    created_at: datetime = Field(default_factory=now_utc, index=True)
    updated_at: datetime = Field(default_factory=now_utc)


class MedicineBatch(SQLModel, table=True):
    id: str = Field(default_factory=lambda: new_id("batch"), primary_key=True)
    tenant_id: str = Field(index=True, foreign_key="tenant.id")
    branch_id: str = Field(index=True, foreign_key="branch.id")
    medicine_id: str = Field(index=True, foreign_key="medicinecatalog.id")
    purchase_id: str | None = Field(default=None, index=True, foreign_key="pharmacypurchase.id")
    batch_number: str = Field(min_length=1, max_length=120, index=True)
    expiry_date: datetime | None = Field(default=None, index=True)
    quantity_on_hand: int = Field(default=0, ge=0)
    cost_price: int = Field(default=0, ge=0)
    sale_price: int = Field(default=0, ge=0)
    created_at: datetime = Field(default_factory=now_utc, index=True)
    updated_at: datetime = Field(default_factory=now_utc)


class PharmacyPurchaseItem(SQLModel, table=True):
    id: str = Field(default_factory=lambda: new_id("purchaseitem"), primary_key=True)
    tenant_id: str = Field(index=True, foreign_key="tenant.id")
    branch_id: str = Field(index=True, foreign_key="branch.id")
    purchase_id: str = Field(index=True, foreign_key="pharmacypurchase.id")
    medicine_id: str = Field(index=True, foreign_key="medicinecatalog.id")
    batch_id: str = Field(index=True, foreign_key="medicinebatch.id")
    quantity: int = Field(gt=0)
    cost_price: int = Field(default=0, ge=0)
    sale_price: int = Field(default=0, ge=0)
    discount_percentage: int = Field(default=0, ge=0)
    discount_amount: int = Field(default=0, ge=0)
    taxable_amount: int = Field(default=0, ge=0)
    cgst_percentage: int = Field(default=0, ge=0)
    sgst_percentage: int = Field(default=0, ge=0)
    cgst_amount: int = Field(default=0, ge=0)
    sgst_amount: int = Field(default=0, ge=0)
    gst_amount: int = Field(default=0, ge=0)
    line_total: int = Field(default=0, ge=0)
    created_at: datetime = Field(default_factory=now_utc, index=True)


class PharmacyReturn(SQLModel, table=True):
    id: str = Field(default_factory=lambda: new_id("pharmreturn"), primary_key=True)
    tenant_id: str = Field(index=True, foreign_key="tenant.id")
    branch_id: str = Field(index=True, foreign_key="branch.id")
    supplier_id: str | None = Field(default=None, index=True, foreign_key="pharmacysupplier.id")
    purchase_id: str | None = Field(default=None, index=True, foreign_key="pharmacypurchase.id")
    return_date: datetime = Field(default_factory=now_utc, index=True)
    reason: str = Field(min_length=2, max_length=500)
    total_amount: int = Field(default=0, ge=0)
    returned_by_user_id: str | None = Field(default=None, index=True)
    created_at: datetime = Field(default_factory=now_utc, index=True)


class PharmacyReturnItem(SQLModel, table=True):
    id: str = Field(default_factory=lambda: new_id("pharmreturnitem"), primary_key=True)
    tenant_id: str = Field(index=True, foreign_key="tenant.id")
    branch_id: str = Field(index=True, foreign_key="branch.id")
    return_id: str = Field(index=True, foreign_key="pharmacyreturn.id")
    medicine_id: str = Field(index=True, foreign_key="medicinecatalog.id")
    batch_id: str = Field(index=True, foreign_key="medicinebatch.id")
    quantity: int = Field(gt=0)
    amount: int = Field(default=0, ge=0)
    created_at: datetime = Field(default_factory=now_utc, index=True)


class PharmacyStockLedger(SQLModel, table=True):
    id: str = Field(default_factory=lambda: new_id("stock"), primary_key=True)
    tenant_id: str = Field(index=True, foreign_key="tenant.id")
    branch_id: str = Field(index=True, foreign_key="branch.id")
    medicine_id: str = Field(index=True, foreign_key="medicinecatalog.id")
    batch_id: str | None = Field(default=None, index=True, foreign_key="medicinebatch.id")
    movement_type: StockLedgerMovement = Field(index=True)
    quantity_delta: int
    balance_after: int
    reference_type: str | None = Field(default=None, max_length=80, index=True)
    reference_id: str | None = Field(default=None, max_length=120, index=True)
    actor_user_id: str | None = Field(default=None, index=True)
    created_at: datetime = Field(default_factory=now_utc, index=True)


class PharmacyIssue(SQLModel, table=True):
    id: str = Field(default_factory=lambda: new_id("pharm"), primary_key=True)
    tenant_id: str = Field(index=True, foreign_key="tenant.id")
    branch_id: str = Field(index=True, foreign_key="branch.id")
    patient_id: str = Field(index=True, foreign_key="patient.id")
    consultation_id: str | None = Field(default=None, index=True, foreign_key="consultation.id")
    issue_number: str | None = Field(default=None, index=True, max_length=60)
    source: PharmacyIssueSource = Field(default=PharmacyIssueSource.CONSULTATION, index=True)
    status: PharmacyIssueStatus = Field(default=PharmacyIssueStatus.REQUESTED, index=True)
    medicine_text: str = Field(min_length=2, max_length=5000)
    notes: str | None = Field(default=None, max_length=2000)
    external_prescriber: str | None = Field(default=None, max_length=220)
    amount: int = Field(default=0, ge=0)
    billing_invoice_id: str | None = Field(default=None, index=True)
    issued_by_user_id: str | None = Field(default=None, index=True)
    dispensed_by_user_id: str | None = Field(default=None, index=True)
    dispensed_at: datetime | None = Field(default=None, index=True)
    cancelled_reason: str | None = Field(default=None, max_length=500)
    created_at: datetime = Field(default_factory=now_utc, index=True)
    updated_at: datetime = Field(default_factory=now_utc)


class PharmacyIssueItem(SQLModel, table=True):
    id: str = Field(default_factory=lambda: new_id("issueitem"), primary_key=True)
    tenant_id: str = Field(index=True, foreign_key="tenant.id")
    branch_id: str = Field(index=True, foreign_key="branch.id")
    pharmacy_issue_id: str = Field(index=True, foreign_key="pharmacyissue.id")
    medicine_id: str | None = Field(default=None, index=True, foreign_key="medicinecatalog.id")
    substitute_for_medicine_id: str | None = Field(default=None, index=True, foreign_key="medicinecatalog.id")
    batch_id: str | None = Field(default=None, index=True, foreign_key="medicinebatch.id")
    medicine_name: str = Field(min_length=2, max_length=220)
    quantity: int = Field(default=1, gt=0)
    unit_price: int = Field(default=0, ge=0)
    dispensed_quantity: int = Field(default=0, ge=0)
    created_at: datetime = Field(default_factory=now_utc, index=True)
    updated_at: datetime = Field(default_factory=now_utc)
