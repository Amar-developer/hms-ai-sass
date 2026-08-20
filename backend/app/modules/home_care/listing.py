from __future__ import annotations

from sqlalchemy import func

from app.core.list_filters import (
    ListField,
    ListSpec,
    standard_audit_list_fields,
    standard_audit_sort_fields,
)
from app.modules.home_care.models import HomeCareService
from app.modules.tenants.models import Branch


home_care_service_branch_name = func.coalesce(Branch.name, "")

HOME_CARE_SERVICE_LIST_SPEC = ListSpec(
    fields={
        **standard_audit_list_fields(HomeCareService),
        "branch_id": ListField(HomeCareService.branch_id, "select"),
        "branch_name": ListField(home_care_service_branch_name, "text"),
        "code": ListField(HomeCareService.code, "text"),
        "name": ListField(HomeCareService.name, "text"),
        "description": ListField(HomeCareService.description, "text"),
        "mrp_price": ListField(HomeCareService.mrp_price, "number"),
        "default_price": ListField(HomeCareService.default_price, "number"),
        "is_active": ListField(HomeCareService.is_active, "boolean"),
    },
    sort_fields={
        **standard_audit_sort_fields(HomeCareService),
        "branch_id": HomeCareService.branch_id,
        "branch_name": home_care_service_branch_name,
        "branch": home_care_service_branch_name,
        "code": HomeCareService.code,
        "name": HomeCareService.name,
        "mrp_price": HomeCareService.mrp_price,
        "default_price": HomeCareService.default_price,
        "is_active": HomeCareService.is_active,
    },
)
