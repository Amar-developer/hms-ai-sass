from __future__ import annotations

from app.core.list_filters import (
    ListField,
    ListSpec,
    standard_audit_list_fields,
    standard_audit_sort_fields,
)
from app.modules.tenants.models import Branch, Department


BRANCH_LIST_SPEC = ListSpec(
    fields={
        **standard_audit_list_fields(Branch),
        "source_template_branch_id": ListField(
            Branch.source_template_branch_id,
            "select",
        ),
        "name": ListField(Branch.name, "text"),
        "code": ListField(Branch.code, "text"),
        "area": ListField(Branch.area, "text"),
        "address": ListField(Branch.address, "text"),
        "city": ListField(Branch.city, "text"),
        "state": ListField(Branch.state, "text"),
        "is_global_template": ListField(Branch.is_global_template, "boolean"),
        "is_template_locked": ListField(Branch.is_template_locked, "boolean"),
        "is_active": ListField(Branch.is_active, "boolean"),
    },
    sort_fields={
        **standard_audit_sort_fields(Branch),
        "name": Branch.name,
        "code": Branch.code,
        "area": Branch.area,
        "city": Branch.city,
        "state": Branch.state,
        "is_global_template": Branch.is_global_template,
        "is_template_locked": Branch.is_template_locked,
        "is_active": Branch.is_active,
    },
)


DEPARTMENT_LIST_SPEC = ListSpec(
    fields={
        **standard_audit_list_fields(Department),
        "branch_id": ListField(Department.branch_id, "select"),
        "source_template_department_id": ListField(
            Department.source_template_department_id,
            "select",
        ),
        "name": ListField(Department.name, "text"),
        "code": ListField(Department.code, "text"),
        "description": ListField(Department.description, "text"),
        "is_global_template": ListField(Department.is_global_template, "boolean"),
        "is_template_locked": ListField(Department.is_template_locked, "boolean"),
        "is_active": ListField(Department.is_active, "boolean"),
    },
    sort_fields={
        **standard_audit_sort_fields(Department),
        "branch_id": Department.branch_id,
        "name": Department.name,
        "code": Department.code,
        "description": Department.description,
        "is_global_template": Department.is_global_template,
        "is_template_locked": Department.is_template_locked,
        "is_active": Department.is_active,
    },
)
