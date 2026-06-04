from datetime import datetime
from enum import Enum

from sqlmodel import Field, SQLModel

from app.modules.tenants.models import new_id, now_utc


class LabOrderSource(str, Enum):
    CONSULTATION = "consultation"
    OP_DIRECT = "op_direct"
    EXTERNAL_REFERRAL = "external_referral"


class LabOrderPriority(str, Enum):
    ROUTINE = "routine"
    URGENT = "urgent"
    STAT = "stat"


class LabOrderStatus(str, Enum):
    ORDERED = "ordered"
    SAMPLE_COLLECTED = "sample_collected"
    IN_PROGRESS = "in_progress"
    RESULT_READY = "result_ready"
    REPORT_DELIVERED = "report_delivered"
    CANCELLED = "cancelled"


class LabTestCatalog(SQLModel, table=True):
    id: str = Field(default_factory=lambda: new_id("labtest"), primary_key=True)
    tenant_id: str = Field(index=True, foreign_key="tenant.id")
    branch_id: str | None = Field(default=None, index=True, foreign_key="branch.id")
    code: str = Field(min_length=2, max_length=40, index=True)
    name: str = Field(min_length=2, max_length=220, index=True)
    department: str | None = Field(default=None, max_length=120, index=True)
    sample_type: str | None = Field(default=None, max_length=120)
    default_price: int = Field(default=0, ge=0)
    supplier_id: str | None = Field(default=None, index=True, foreign_key="pharmacysupplier.id")
    purchase_price: int = Field(default=0, ge=0)
    turnaround_minutes: int | None = Field(default=None, ge=0)
    instructions: str | None = Field(default=None, max_length=1000)
    is_active: bool = Field(default=True, index=True)
    created_by_user_id: str | None = Field(default=None, index=True)
    updated_by_user_id: str | None = Field(default=None, index=True)
    created_at: datetime = Field(default_factory=now_utc, index=True)
    updated_at: datetime = Field(default_factory=now_utc)


class LabTestPackage(SQLModel, table=True):
    id: str = Field(default_factory=lambda: new_id("labpkg"), primary_key=True)
    tenant_id: str = Field(index=True, foreign_key="tenant.id")
    branch_id: str | None = Field(default=None, index=True, foreign_key="branch.id")
    code: str = Field(min_length=2, max_length=40, index=True)
    name: str = Field(min_length=2, max_length=220, index=True)
    description: str | None = Field(default=None, max_length=1000)
    package_price: int = Field(default=0, ge=0)
    supplier_id: str | None = Field(default=None, index=True, foreign_key="pharmacysupplier.id")
    purchase_price: int = Field(default=0, ge=0)
    is_active: bool = Field(default=True, index=True)
    created_by_user_id: str | None = Field(default=None, index=True)
    updated_by_user_id: str | None = Field(default=None, index=True)
    created_at: datetime = Field(default_factory=now_utc, index=True)
    updated_at: datetime = Field(default_factory=now_utc)


class LabTestPackageItem(SQLModel, table=True):
    id: str = Field(default_factory=lambda: new_id("labpkgitem"), primary_key=True)
    tenant_id: str = Field(index=True, foreign_key="tenant.id")
    package_id: str = Field(index=True, foreign_key="labtestpackage.id")
    test_id: str = Field(index=True, foreign_key="labtestcatalog.id")
    created_at: datetime = Field(default_factory=now_utc, index=True)


class LabResultTemplate(SQLModel, table=True):
    id: str = Field(default_factory=lambda: new_id("labtmpl"), primary_key=True)
    tenant_id: str = Field(index=True, foreign_key="tenant.id")
    test_id: str | None = Field(default=None, index=True, foreign_key="labtestcatalog.id")
    name: str = Field(min_length=2, max_length=220, index=True)
    content_json: str = Field(default="{}")
    is_active: bool = Field(default=True, index=True)
    created_by_user_id: str | None = Field(default=None, index=True)
    created_at: datetime = Field(default_factory=now_utc, index=True)
    updated_at: datetime = Field(default_factory=now_utc)


class LabOrder(SQLModel, table=True):
    id: str = Field(default_factory=lambda: new_id("labord"), primary_key=True)
    tenant_id: str = Field(index=True, foreign_key="tenant.id")
    branch_id: str = Field(index=True, foreign_key="branch.id")
    patient_id: str = Field(index=True, foreign_key="patient.id")
    consultation_id: str | None = Field(default=None, index=True, foreign_key="consultation.id")
    lab_order_number: str | None = Field(default=None, index=True, max_length=60)
    source: LabOrderSource = Field(default=LabOrderSource.CONSULTATION, index=True)
    status: LabOrderStatus = Field(default=LabOrderStatus.ORDERED, index=True)
    priority: LabOrderPriority = Field(default=LabOrderPriority.ROUTINE, index=True)
    tests: str = Field(min_length=2, max_length=2000)
    notes: str | None = Field(default=None, max_length=2000)
    external_referrer: str | None = Field(default=None, max_length=220)
    amount: int = Field(default=0, ge=0)
    ordered_by_user_id: str | None = Field(default=None, index=True)
    sample_collected_at: datetime | None = Field(default=None, index=True)
    result_ready_at: datetime | None = Field(default=None, index=True)
    cancelled_reason: str | None = Field(default=None, max_length=500)
    created_at: datetime = Field(default_factory=now_utc, index=True)
    updated_at: datetime = Field(default_factory=now_utc)


class LabOrderItem(SQLModel, table=True):
    id: str = Field(default_factory=lambda: new_id("labitem"), primary_key=True)
    tenant_id: str = Field(index=True, foreign_key="tenant.id")
    branch_id: str = Field(index=True, foreign_key="branch.id")
    lab_order_id: str = Field(index=True, foreign_key="laborder.id")
    test_id: str | None = Field(default=None, index=True, foreign_key="labtestcatalog.id")
    package_id: str | None = Field(default=None, index=True, foreign_key="labtestpackage.id")
    test_name: str = Field(min_length=2, max_length=220)
    sample_type: str | None = Field(default=None, max_length=120)
    price: int = Field(default=0, ge=0)
    mrp_price: int = Field(default=0, ge=0)
    selling_price: int = Field(default=0, ge=0)
    buying_price: int = Field(default=0, ge=0)
    supplier_id: str | None = Field(default=None, index=True, foreign_key="pharmacysupplier.id")
    external_source: str | None = Field(default=None, max_length=80)
    external_slug: str | None = Field(default=None, max_length=220)
    external_item_code: str | None = Field(default=None, max_length=220)
    status: LabOrderStatus = Field(default=LabOrderStatus.ORDERED, index=True)
    created_at: datetime = Field(default_factory=now_utc, index=True)
    updated_at: datetime = Field(default_factory=now_utc)


class LabSample(SQLModel, table=True):
    id: str = Field(default_factory=lambda: new_id("labsample"), primary_key=True)
    tenant_id: str = Field(index=True, foreign_key="tenant.id")
    branch_id: str = Field(index=True, foreign_key="branch.id")
    lab_order_id: str = Field(index=True, foreign_key="laborder.id")
    barcode: str = Field(min_length=2, max_length=120, index=True)
    sample_type: str | None = Field(default=None, max_length=120)
    collected_by_user_id: str | None = Field(default=None, index=True)
    collected_at: datetime = Field(default_factory=now_utc, index=True)
    notes: str | None = Field(default=None, max_length=1000)


class LabResult(SQLModel, table=True):
    id: str = Field(default_factory=lambda: new_id("labres"), primary_key=True)
    tenant_id: str = Field(index=True, foreign_key="tenant.id")
    branch_id: str = Field(index=True, foreign_key="branch.id")
    lab_order_id: str = Field(index=True, foreign_key="laborder.id")
    template_id: str | None = Field(default=None, index=True, foreign_key="labresulttemplate.id")
    result_summary: str = Field(min_length=2, max_length=5000)
    abnormal_flag: bool = Field(default=False, index=True)
    report_url: str | None = Field(default=None, max_length=500)
    report_file_name: str | None = Field(default=None, max_length=220)
    released_by_user_id: str | None = Field(default=None, index=True)
    released_at: datetime = Field(default_factory=now_utc, index=True)
