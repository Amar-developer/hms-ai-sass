from __future__ import annotations

from sqlalchemy import func

from app.core.list_filters import (
    ListField,
    ListSpec,
    standard_audit_list_fields,
    standard_audit_sort_fields,
)
from app.modules.lab.models import (
    LabOrder,
    LabOrderPriority,
    LabOrderSource,
    LabOrderStatus,
    LabTestCatalog,
    LabTestPackage,
)
from app.modules.patients.models import Patient
from app.modules.pharmacy.models import PharmacySupplier
from app.modules.tenants.models import Branch


patient_display_name = func.coalesce(Patient.full_name, "")
lab_catalog_branch_name = func.coalesce(Branch.name, "")
lab_catalog_supplier_name = func.coalesce(PharmacySupplier.name, "")

LAB_TEST_CATALOG_LIST_SPEC = ListSpec(
    fields={
        **standard_audit_list_fields(LabTestCatalog),
        "branch_id": ListField(LabTestCatalog.branch_id, "select"),
        "branch_name": ListField(lab_catalog_branch_name, "text"),
        "code": ListField(LabTestCatalog.code, "text"),
        "name": ListField(LabTestCatalog.name, "text"),
        "department": ListField(LabTestCatalog.department, "select"),
        "sample_type": ListField(LabTestCatalog.sample_type, "select"),
        "supplier_id": ListField(LabTestCatalog.supplier_id, "select"),
        "supplier_name": ListField(lab_catalog_supplier_name, "text"),
        "mrp_price": ListField(LabTestCatalog.mrp_price, "number"),
        "default_price": ListField(LabTestCatalog.default_price, "number"),
        "purchase_price": ListField(LabTestCatalog.purchase_price, "number"),
        "turnaround_minutes": ListField(LabTestCatalog.turnaround_minutes, "number"),
        "instructions": ListField(LabTestCatalog.instructions, "text"),
        "is_active": ListField(LabTestCatalog.is_active, "boolean"),
    },
    sort_fields={
        **standard_audit_sort_fields(LabTestCatalog),
        "branch_id": LabTestCatalog.branch_id,
        "branch_name": lab_catalog_branch_name,
        "branch": lab_catalog_branch_name,
        "code": LabTestCatalog.code,
        "name": LabTestCatalog.name,
        "department": LabTestCatalog.department,
        "sample_type": LabTestCatalog.sample_type,
        "supplier_id": LabTestCatalog.supplier_id,
        "supplier_name": lab_catalog_supplier_name,
        "supplier": lab_catalog_supplier_name,
        "mrp_price": LabTestCatalog.mrp_price,
        "default_price": LabTestCatalog.default_price,
        "purchase_price": LabTestCatalog.purchase_price,
        "turnaround_minutes": LabTestCatalog.turnaround_minutes,
        "is_active": LabTestCatalog.is_active,
    },
)

LAB_TEST_PACKAGE_LIST_SPEC = ListSpec(
    fields={
        **standard_audit_list_fields(LabTestPackage),
        "branch_id": ListField(LabTestPackage.branch_id, "select"),
        "branch_name": ListField(lab_catalog_branch_name, "text"),
        "code": ListField(LabTestPackage.code, "text"),
        "name": ListField(LabTestPackage.name, "text"),
        "description": ListField(LabTestPackage.description, "text"),
        "supplier_id": ListField(LabTestPackage.supplier_id, "select"),
        "supplier_name": ListField(lab_catalog_supplier_name, "text"),
        "mrp_price": ListField(LabTestPackage.mrp_price, "number"),
        "package_price": ListField(LabTestPackage.package_price, "number"),
        "purchase_price": ListField(LabTestPackage.purchase_price, "number"),
        "is_active": ListField(LabTestPackage.is_active, "boolean"),
    },
    sort_fields={
        **standard_audit_sort_fields(LabTestPackage),
        "branch_id": LabTestPackage.branch_id,
        "branch_name": lab_catalog_branch_name,
        "branch": lab_catalog_branch_name,
        "code": LabTestPackage.code,
        "name": LabTestPackage.name,
        "supplier_id": LabTestPackage.supplier_id,
        "supplier_name": lab_catalog_supplier_name,
        "supplier": lab_catalog_supplier_name,
        "mrp_price": LabTestPackage.mrp_price,
        "package_price": LabTestPackage.package_price,
        "purchase_price": LabTestPackage.purchase_price,
        "is_active": LabTestPackage.is_active,
    },
)

LAB_ORDER_LIST_SPEC = ListSpec(
    fields={
        **standard_audit_list_fields(LabOrder),
        "lab_order_number": ListField(LabOrder.lab_order_number, "text"),
        "patient_name": ListField(patient_display_name, "text"),
        "patient_number": ListField(Patient.patient_number, "text"),
        "tests": ListField(LabOrder.tests, "text"),
        "notes": ListField(LabOrder.notes, "text"),
        "external_referrer": ListField(LabOrder.external_referrer, "text"),
        "acquisition_source": ListField(LabOrder.acquisition_source, "select"),
        "source": ListField(LabOrder.source, "select", enum_type=LabOrderSource),
        "status": ListField(LabOrder.status, "select", enum_type=LabOrderStatus),
        "priority": ListField(LabOrder.priority, "select", enum_type=LabOrderPriority),
        "amount": ListField(LabOrder.amount, "number"),
        "order_date": ListField(LabOrder.order_date, "date"),
        "sample_collected_at": ListField(LabOrder.sample_collected_at, "date"),
        "result_ready_at": ListField(LabOrder.result_ready_at, "date"),
    },
    sort_fields={
        **standard_audit_sort_fields(LabOrder),
        "lab_order_number": LabOrder.lab_order_number,
        "patient_name": patient_display_name,
        "patient": patient_display_name,
        "acquisition_source": LabOrder.acquisition_source,
        "source": LabOrder.source,
        "status": LabOrder.status,
        "priority": LabOrder.priority,
        "amount": LabOrder.amount,
        "order_date": LabOrder.order_date,
        "sample_collected_at": LabOrder.sample_collected_at,
        "result_ready_at": LabOrder.result_ready_at,
    },
)
