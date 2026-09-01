from __future__ import annotations

from sqlalchemy import func

from app.core.list_filters import (
    ListField,
    ListSpec,
    standard_audit_list_fields,
    standard_audit_sort_fields,
)
from app.modules.appointments.models import (
    Appointment,
    AppointmentStatus,
    AppointmentType,
)
from app.modules.consultations.models import Consultation, ConsultationStatus
from app.modules.patients.models import Patient
from app.modules.practitioners.models import Practitioner
from app.modules.queue.models import QueueEntry
from app.modules.tenants.models import Branch, Department


appointment_patient_name = func.coalesce(Patient.full_name, "")
appointment_patient_mobile = func.coalesce(
    func.nullif(Patient.mobile, ""),
    func.nullif(Patient.alternate_mobile, ""),
    func.nullif(Patient.guardian_mobile, ""),
    "",
)
appointment_branch_name = func.coalesce(Branch.name, "")
appointment_department_name = func.coalesce(Department.name, "")
appointment_practitioner_name = func.coalesce(Practitioner.full_name, "")
appointment_token_number = func.coalesce(QueueEntry.token_number, "")

APPOINTMENT_LIST_SPEC = ListSpec(
    fields={
        **standard_audit_list_fields(Appointment),
        "appointment_number": ListField(Appointment.appointment_number, "text"),
        "patient_id": ListField(Appointment.patient_id, "select"),
        "patient_name": ListField(appointment_patient_name, "text"),
        "patient_number": ListField(Patient.patient_number, "text"),
        "patient_mobile": ListField(appointment_patient_mobile, "text"),
        "branch_id": ListField(Appointment.branch_id, "select"),
        "branch_name": ListField(appointment_branch_name, "text"),
        "department_id": ListField(Appointment.department_id, "select"),
        "department_name": ListField(appointment_department_name, "text"),
        "practitioner_id": ListField(Appointment.practitioner_id, "select"),
        "practitioner_name": ListField(appointment_practitioner_name, "text"),
        "token_number": ListField(appointment_token_number, "text"),
        "consultation_status": ListField(
            Consultation.status,
            "select",
            enum_type=ConsultationStatus,
        ),
        "appointment_type": ListField(
            Appointment.appointment_type,
            "select",
            enum_type=AppointmentType,
        ),
        "status": ListField(
            Appointment.status,
            "select",
            enum_type=AppointmentStatus,
        ),
        "appointment_date": ListField(Appointment.appointment_date, "date"),
        "acquisition_source": ListField(Appointment.acquisition_source, "select"),
        "referrer_name": ListField(Appointment.referrer_name, "text"),
        "reason": ListField(Appointment.reason, "text"),
        "visit_purpose": ListField(Appointment.visit_purpose, "select"),
        "is_billable": ListField(Appointment.is_billable, "boolean"),
        "custom_fee_amount": ListField(Appointment.custom_fee_amount, "number"),
    },
    sort_fields={
        **standard_audit_sort_fields(Appointment),
        "appointment_number": Appointment.appointment_number,
        "patient_id": Appointment.patient_id,
        "patient_name": appointment_patient_name,
        "patient": appointment_patient_name,
        "patient_number": Patient.patient_number,
        "patient_mobile": appointment_patient_mobile,
        "branch_id": Appointment.branch_id,
        "branch_name": appointment_branch_name,
        "branch": appointment_branch_name,
        "department_id": Appointment.department_id,
        "department_name": appointment_department_name,
        "department": appointment_department_name,
        "practitioner_id": Appointment.practitioner_id,
        "practitioner_name": appointment_practitioner_name,
        "doctor": appointment_practitioner_name,
        "token_number": appointment_token_number,
        "consultation_status": Consultation.status,
        "appointment_type": Appointment.appointment_type,
        "status": Appointment.status,
        "appointment_date": Appointment.appointment_date,
        "acquisition_source": Appointment.acquisition_source,
        "visit_purpose": Appointment.visit_purpose,
        "is_billable": Appointment.is_billable,
        "custom_fee_amount": Appointment.custom_fee_amount,
    },
)
