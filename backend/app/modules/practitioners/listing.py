from __future__ import annotations

from app.core.list_filters import (
    ListField,
    ListSpec,
    standard_audit_list_fields,
    standard_audit_sort_fields,
)
from app.modules.practitioners.models import (
    Practitioner,
    PractitionerSchedule,
    PractitionerStatus,
    PractitionerType,
)
from app.modules.tenants.models import Branch, Department


PRACTITIONER_LIST_SPEC = ListSpec(
    fields={
        **standard_audit_list_fields(Practitioner),
        "user_id": ListField(Practitioner.user_id, "select"),
        "practitioner_number": ListField(Practitioner.practitioner_number, "text"),
        "full_name": ListField(Practitioner.full_name, "text"),
        "practitioner_type": ListField(
            Practitioner.practitioner_type,
            "select",
            enum_type=PractitionerType,
        ),
        "primary_specialty": ListField(Practitioner.primary_specialty, "text"),
        "registration_number": ListField(Practitioner.registration_number, "text"),
        "mobile": ListField(Practitioner.mobile, "text"),
        "email": ListField(Practitioner.email, "text"),
        "status": ListField(
            Practitioner.status,
            "select",
            enum_type=PractitionerStatus,
        ),
    },
    sort_fields={
        **standard_audit_sort_fields(Practitioner),
        "user_id": Practitioner.user_id,
        "practitioner_number": Practitioner.practitioner_number,
        "full_name": Practitioner.full_name,
        "practitioner_type": Practitioner.practitioner_type,
        "primary_specialty": Practitioner.primary_specialty,
        "registration_number": Practitioner.registration_number,
        "mobile": Practitioner.mobile,
        "email": Practitioner.email,
        "status": Practitioner.status,
    },
)


PRACTITIONER_SCHEDULE_LIST_SPEC = ListSpec(
    fields={
        **standard_audit_list_fields(PractitionerSchedule),
        "practitioner_id": ListField(PractitionerSchedule.practitioner_id, "select"),
        "practitioner_full_name": ListField(Practitioner.full_name, "text"),
        "branch_id": ListField(PractitionerSchedule.branch_id, "select"),
        "branch_name": ListField(Branch.name, "text"),
        "department_id": ListField(PractitionerSchedule.department_id, "select"),
        "department_name": ListField(Department.name, "text"),
        "mode": ListField(PractitionerSchedule.mode, "select"),
        "start_time": ListField(PractitionerSchedule.start_time, "text"),
        "end_time": ListField(PractitionerSchedule.end_time, "text"),
        "slot_minutes": ListField(PractitionerSchedule.slot_minutes, "number"),
        "is_active": ListField(PractitionerSchedule.is_active, "boolean"),
    },
    sort_fields={
        **standard_audit_sort_fields(PractitionerSchedule),
        "practitioner_id": PractitionerSchedule.practitioner_id,
        "practitioner_full_name": Practitioner.full_name,
        "doctor": Practitioner.full_name,
        "branch_id": PractitionerSchedule.branch_id,
        "branch_name": Branch.name,
        "branch": Branch.name,
        "department_id": PractitionerSchedule.department_id,
        "department_name": Department.name,
        "department": Department.name,
        "mode": PractitionerSchedule.mode,
        "start_time": PractitionerSchedule.start_time,
        "end_time": PractitionerSchedule.end_time,
        "slot_minutes": PractitionerSchedule.slot_minutes,
        "is_active": PractitionerSchedule.is_active,
        "status": PractitionerSchedule.is_active,
    },
)
