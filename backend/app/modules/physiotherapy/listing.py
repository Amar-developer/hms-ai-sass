from __future__ import annotations

from sqlalchemy import func

from app.core.list_filters import (
    ListField,
    ListSpec,
    standard_audit_list_fields,
    standard_audit_sort_fields,
)
from app.modules.pharmacy.models import PharmacySupplier
from app.modules.physiotherapy.models import PhysiotherapyEquipment
from app.modules.tenants.models import Branch


physio_equipment_branch_name = func.coalesce(Branch.name, "")
physio_equipment_supplier_name = func.coalesce(PharmacySupplier.name, "")

PHYSIOTHERAPY_EQUIPMENT_LIST_SPEC = ListSpec(
    fields={
        **standard_audit_list_fields(PhysiotherapyEquipment),
        "branch_id": ListField(PhysiotherapyEquipment.branch_id, "select"),
        "branch_name": ListField(physio_equipment_branch_name, "text"),
        "name": ListField(PhysiotherapyEquipment.name, "text"),
        "modality_type": ListField(PhysiotherapyEquipment.modality_type, "select"),
        "manufacturer": ListField(PhysiotherapyEquipment.manufacturer, "select"),
        "model_number": ListField(PhysiotherapyEquipment.model_number, "text"),
        "serial_number": ListField(PhysiotherapyEquipment.serial_number, "text"),
        "supplier_id": ListField(PhysiotherapyEquipment.supplier_id, "select"),
        "supplier_name": ListField(physio_equipment_supplier_name, "text"),
        "mrp_price": ListField(PhysiotherapyEquipment.mrp_price, "number"),
        "purchase_price": ListField(PhysiotherapyEquipment.purchase_price, "number"),
        "is_portable": ListField(PhysiotherapyEquipment.is_portable, "boolean"),
        "is_active": ListField(PhysiotherapyEquipment.is_active, "boolean"),
    },
    sort_fields={
        **standard_audit_sort_fields(PhysiotherapyEquipment),
        "branch_id": PhysiotherapyEquipment.branch_id,
        "branch_name": physio_equipment_branch_name,
        "branch": physio_equipment_branch_name,
        "name": PhysiotherapyEquipment.name,
        "modality_type": PhysiotherapyEquipment.modality_type,
        "manufacturer": PhysiotherapyEquipment.manufacturer,
        "model_number": PhysiotherapyEquipment.model_number,
        "serial_number": PhysiotherapyEquipment.serial_number,
        "supplier_id": PhysiotherapyEquipment.supplier_id,
        "supplier_name": physio_equipment_supplier_name,
        "supplier": physio_equipment_supplier_name,
        "mrp_price": PhysiotherapyEquipment.mrp_price,
        "purchase_price": PhysiotherapyEquipment.purchase_price,
        "is_portable": PhysiotherapyEquipment.is_portable,
        "is_active": PhysiotherapyEquipment.is_active,
    },
)
