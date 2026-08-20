from __future__ import annotations

from sqlalchemy import func

from app.core.list_filters import (
    ListField,
    ListSpec,
    standard_audit_list_fields,
    standard_audit_sort_fields,
)
from app.modules.patients.models import Patient
from app.modules.pharmacy.models import (
    MedicineCatalog,
    PharmacyIssue,
    PharmacyIssueSource,
    PharmacyIssueStatus,
    PharmacySupplier,
)
from app.modules.tenants.models import Branch

patient_display_name = func.coalesce(Patient.full_name, "")
medicine_branch_name = func.coalesce(Branch.name, "")
medicine_supplier_name = func.coalesce(PharmacySupplier.name, "")

MEDICINE_CATALOG_LIST_SPEC = ListSpec(
    fields={
        **standard_audit_list_fields(MedicineCatalog),
        "branch_id": ListField(MedicineCatalog.branch_id, "select"),
        "branch_name": ListField(medicine_branch_name, "text"),
        "code": ListField(MedicineCatalog.code, "text"),
        "name": ListField(MedicineCatalog.name, "text"),
        "generic_name": ListField(MedicineCatalog.generic_name, "text"),
        "form": ListField(MedicineCatalog.form, "select"),
        "strength": ListField(MedicineCatalog.strength, "text"),
        "manufacturer": ListField(MedicineCatalog.manufacturer, "select"),
        "supplier_id": ListField(MedicineCatalog.supplier_id, "select"),
        "supplier_name": ListField(medicine_supplier_name, "text"),
        "mrp_price": ListField(MedicineCatalog.mrp_price, "number"),
        "purchase_price": ListField(MedicineCatalog.purchase_price, "number"),
        "default_sale_price": ListField(MedicineCatalog.default_sale_price, "number"),
        "reorder_level": ListField(MedicineCatalog.reorder_level, "number"),
        "is_active": ListField(MedicineCatalog.is_active, "boolean"),
    },
    sort_fields={
        **standard_audit_sort_fields(MedicineCatalog),
        "branch_id": MedicineCatalog.branch_id,
        "branch_name": medicine_branch_name,
        "branch": medicine_branch_name,
        "code": MedicineCatalog.code,
        "name": MedicineCatalog.name,
        "generic_name": MedicineCatalog.generic_name,
        "form": MedicineCatalog.form,
        "strength": MedicineCatalog.strength,
        "manufacturer": MedicineCatalog.manufacturer,
        "supplier_id": MedicineCatalog.supplier_id,
        "supplier_name": medicine_supplier_name,
        "supplier": medicine_supplier_name,
        "mrp_price": MedicineCatalog.mrp_price,
        "purchase_price": MedicineCatalog.purchase_price,
        "default_sale_price": MedicineCatalog.default_sale_price,
        "reorder_level": MedicineCatalog.reorder_level,
        "is_active": MedicineCatalog.is_active,
    },
)

PHARMACY_ISSUE_LIST_SPEC = ListSpec(
    fields={
        **standard_audit_list_fields(PharmacyIssue),
        "issue_number": ListField(PharmacyIssue.issue_number, "text"),
        "patient_name": ListField(patient_display_name, "text"),
        "patient_number": ListField(Patient.patient_number, "text"),
        "source": ListField(
            PharmacyIssue.source,
            "select",
            enum_type=PharmacyIssueSource,
        ),
        "status": ListField(
            PharmacyIssue.status,
            "select",
            enum_type=PharmacyIssueStatus,
        ),
        "medicine_text": ListField(PharmacyIssue.medicine_text, "text"),
        "notes": ListField(PharmacyIssue.notes, "text"),
        "external_prescriber": ListField(PharmacyIssue.external_prescriber, "text"),
        "amount": ListField(PharmacyIssue.amount, "number"),
        "dispensed_by_user_id": ListField(
            PharmacyIssue.dispensed_by_user_id,
            "select",
        ),
        "dispensed_at": ListField(PharmacyIssue.dispensed_at, "date"),
    },
    sort_fields={
        **standard_audit_sort_fields(PharmacyIssue),
        "issue_number": PharmacyIssue.issue_number,
        "patient_name": patient_display_name,
        "patient": patient_display_name,
        "source": PharmacyIssue.source,
        "status": PharmacyIssue.status,
        "amount": PharmacyIssue.amount,
        "dispensed_by_user_id": PharmacyIssue.dispensed_by_user_id,
        "dispensed_at": PharmacyIssue.dispensed_at,
    },
)


PHARMACY_SUPPLIER_LIST_SPEC = ListSpec(
    fields={
        **standard_audit_list_fields(PharmacySupplier),
        "supplier_number": ListField(PharmacySupplier.supplier_number, "text"),
        "name": ListField(PharmacySupplier.name, "text"),
        "gstin": ListField(PharmacySupplier.gstin, "text"),
        "phone": ListField(PharmacySupplier.phone, "text"),
        "email": ListField(PharmacySupplier.email, "text"),
        "address": ListField(PharmacySupplier.address, "text"),
        "is_active": ListField(PharmacySupplier.is_active, "boolean"),
    },
    sort_fields={
        **standard_audit_sort_fields(PharmacySupplier),
        "supplier_number": PharmacySupplier.supplier_number,
        "name": PharmacySupplier.name,
        "gstin": PharmacySupplier.gstin,
        "phone": PharmacySupplier.phone,
        "email": PharmacySupplier.email,
        "is_active": PharmacySupplier.is_active,
    },
)
