from __future__ import annotations

from sqlalchemy import func

from app.core.list_filters import (
    ListField,
    ListSpec,
    standard_audit_list_fields,
    standard_audit_sort_fields,
)
from app.modules.appointments.models import Appointment
from app.modules.consultations.models import Consultation, ConsultationStatus
from app.modules.patients.models import Patient
from app.modules.practitioners.models import Practitioner
from app.modules.tenants.models import Branch


consultation_patient_name = func.coalesce(Patient.full_name, "")
consultation_patient_mobile = func.coalesce(
    func.nullif(Patient.mobile, ""),
    func.nullif(Patient.alternate_mobile, ""),
    func.nullif(Patient.guardian_mobile, ""),
    "",
)
consultation_branch_name = func.coalesce(Branch.name, "")
consultation_practitioner_name = func.coalesce(Practitioner.full_name, "")

CONSULTATION_LIST_SPEC = ListSpec(
    fields={
        **standard_audit_list_fields(Consultation),
        "appointment_id": ListField(Consultation.appointment_id, "select"),
        "appointment_number": ListField(Appointment.appointment_number, "text"),
        "patient_id": ListField(Consultation.patient_id, "select"),
        "patient_name": ListField(consultation_patient_name, "text"),
        "patient_number": ListField(Patient.patient_number, "text"),
        "patient_mobile": ListField(consultation_patient_mobile, "text"),
        "branch_id": ListField(Consultation.branch_id, "select"),
        "branch_name": ListField(consultation_branch_name, "text"),
        "practitioner_id": ListField(Consultation.practitioner_id, "select"),
        "practitioner_name": ListField(consultation_practitioner_name, "text"),
        "status": ListField(
            Consultation.status, "select", enum_type=ConsultationStatus
        ),
        "treatment_type": ListField(Consultation.treatment_type, "select"),
        "chief_complaint": ListField(Consultation.chief_complaint, "text"),
        "diagnosis": ListField(Consultation.diagnosis, "text"),
        "clinical_notes": ListField(Consultation.clinical_notes, "text"),
        "prescription_text": ListField(Consultation.prescription_text, "text"),
        "lab_referral_text": ListField(Consultation.lab_referral_text, "text"),
        "scan_referral_text": ListField(Consultation.scan_referral_text, "text"),
        "follow_up_advice": ListField(Consultation.follow_up_advice, "text"),
        "patient_remarks": ListField(Consultation.patient_remarks, "text"),
        "signed_by_user_id": ListField(Consultation.signed_by_user_id, "select"),
        "signed_at": ListField(Consultation.signed_at, "date"),
    },
    sort_fields={
        **standard_audit_sort_fields(Consultation),
        "appointment_id": Consultation.appointment_id,
        "appointment_number": Appointment.appointment_number,
        "patient_id": Consultation.patient_id,
        "patient_name": consultation_patient_name,
        "patient": consultation_patient_name,
        "patient_number": Patient.patient_number,
        "patient_mobile": consultation_patient_mobile,
        "branch_id": Consultation.branch_id,
        "branch_name": consultation_branch_name,
        "branch": consultation_branch_name,
        "practitioner_id": Consultation.practitioner_id,
        "practitioner_name": consultation_practitioner_name,
        "doctor": consultation_practitioner_name,
        "status": Consultation.status,
        "treatment_type": Consultation.treatment_type,
        "signed_by_user_id": Consultation.signed_by_user_id,
        "signed_at": Consultation.signed_at,
    },
)
