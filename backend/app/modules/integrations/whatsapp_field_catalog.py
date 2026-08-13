"""Registry of the placeholder fields available to each WhatsApp notification
flow (trigger), plus each flow's default parameter order.

This is the single source of truth shared by:
- `whatsapp_schemas.py` — validates a custom template's chosen field keys
  against the fields its trigger actually makes available.
- `whatsapp_processor.py` — builds a named context dict per flow using these
  same field keys, and falls back to a flow's default field order when no
  custom template overrides it.
- `whatsapp_service.py` — serializes this catalog into the settings response
  so the frontend can render field pickers without keeping its own copy.

Deliberately has no dependency on `whatsapp_schemas.py` to avoid a circular
import (that module imports from here, not the other way around).

The lists below are the *curated* fields — the handful an approved template
usually needs, kept first in the picker. They are not the whole menu: every
column each flow's module entities expose is appended automatically by
`whatsapp_entity_fields.py`, so adding a placeholder such as a patient's date
of birth to a template is a settings change, not a code change.
"""

from app.modules.integrations.whatsapp_entity_fields import entity_catalog

FLOW_FIELD_CATALOG: dict[str, list[tuple[str, str]]] = {
    "appointment_booked_patient": [
        ("recipient_name", "Recipient name"),
        ("doctor_name", "Doctor name"),
        ("appointment_date", "Appointment date"),
        ("appointment_time", "Appointment time"),
        ("clinic_name", "Hospital/clinic name"),
        ("appointment_id", "Appointment ID"),
    ],
    "appointment_booked_doctor": [
        ("recipient_name", "Doctor name"),
        ("appointment_status", "Appointment status"),
        ("appointment_id", "Appointment ID"),
        ("appointment_date", "Appointment date"),
        ("appointment_time", "Appointment time"),
        ("appointment_view_url", "Appointment view URL"),
    ],
    "appointment_cancelled_patient": [
        ("recipient_name", "Recipient name"),
        ("appointment_date", "Appointment date"),
        ("appointment_time", "Appointment time"),
        ("cancellation_reason", "Cancellation reason"),
    ],
    "appointment_cancelled_doctor": [
        ("recipient_name", "Doctor name"),
        ("appointment_date", "Appointment date"),
        ("appointment_time", "Appointment time"),
        ("cancellation_reason", "Cancellation reason"),
    ],
    "appointment_reminder_patient": [
        ("recipient_name", "Recipient name"),
        ("appointment_date", "Appointment date"),
        ("appointment_time", "Appointment time"),
    ],
    "invoice_paid_patient": [
        ("recipient_name", "Recipient name"),
        ("invoice_number", "Invoice number"),
        ("service_description", "Service"),
        ("total_amount", "Total amount"),
    ],
    "payment_pending_patient": [
        ("recipient_name", "Recipient name"),
        ("invoice_number", "Invoice number"),
        ("paid_amount", "Amount paid"),
        ("balance_amount", "Balance amount"),
    ],
    "invoice_refunded_patient": [
        ("recipient_name", "Recipient name"),
        ("invoice_number", "Invoice number"),
        ("refund_amount", "Refund amount"),
    ],
    "lab_report_ready_patient": [
        ("recipient_name", "Recipient name"),
        ("report_name", "Report name"),
        ("clinic_name", "Hospital/clinic name"),
        ("report_date", "Report date"),
    ],
    "prescription_ready_patient": [
        ("recipient_name", "Recipient name"),
        ("consultation_date", "Consultation date"),
        ("doctor_name", "Doctor name"),
    ],
    "follow_up_advice_patient": [
        ("recipient_name", "Recipient name"),
        ("follow_up_advice", "Follow-up advice"),
    ],
    "medicine_refill_patient": [
        ("recipient_name", "Recipient name"),
        ("expected_date", "Expected refill date"),
        ("clinic_name", "Hospital/clinic name"),
    ],
    "health_tip_patient": [
        ("recipient_name", "Recipient name"),
        ("clinic_name", "Hospital/clinic name"),
        ("content_title", "Tenant content title"),
        ("content_body", "Tenant content message"),
        ("content_category", "Tenant content category"),
        ("engagement_segment", "Engagement segment"),
        ("health_tip_topic", "Health tip topic"),
        ("action_reason", "Tip reason"),
        ("flag_label", "Patient flag label"),
        ("flag_reason", "Flag reason"),
        ("days_since_activity", "Days since last activity"),
        ("last_activity_date", "Last activity date"),
        ("patient.age_years", "Patient age"),
        ("patient.gender", "Patient gender"),
        ("membership_plan_name", "Membership plan name"),
    ],
    "lab_test_reminder_patient": [
        ("recipient_name", "Recipient name"),
        ("lab_test_name", "Lab test name"),
        ("lab_due_date", "Lab due date"),
        ("clinic_name", "Hospital/clinic name"),
        ("lab_notes", "Lab schedule notes"),
    ],
    "membership_renewal_patient": [
        ("recipient_name", "Recipient name"),
        ("membership_plan_name", "Membership plan name"),
        ("expiry_date", "Membership expiry date"),
        ("days_remaining", "Membership days remaining"),
        ("clinic_name", "Hospital/clinic name"),
    ],
    "unused_benefit_patient": [
        ("recipient_name", "Recipient name"),
        ("membership_plan_name", "Membership plan name"),
        ("membership_plan.name", "Plan name"),
        ("expiry_date", "Membership expiry date"),
        ("days_remaining", "Membership days remaining"),
        ("unused_consultations", "Unused consultations"),
        ("unused_lab_tests", "Unused lab tests"),
        ("unused_medicines", "Unused medicines"),
        ("unused_benefits_summary", "Unused benefits summary"),
        ("clinic_name", "Hospital/clinic name"),
    ],
    "patient_reengagement": [
        ("recipient_name", "Recipient name"),
        ("clinic_name", "Hospital/clinic name"),
        ("content_title", "Tenant content title"),
        ("content_body", "Tenant content message"),
        ("content_category", "Tenant content category"),
        ("engagement_segment", "Engagement segment"),
        ("action_reason", "Engagement reason"),
        ("flag_label", "Patient flag label"),
        ("flag_reason", "Flag reason"),
        ("last_activity_date", "Last activity date"),
        ("days_since_activity", "Days since last activity"),
        ("completed_visits", "Completed visits"),
        ("no_show_count", "No-show count"),
        ("lifetime_collected", "Lifetime collected"),
        ("outstanding_amount", "Outstanding amount"),
        ("membership_plan_name", "Membership plan name"),
    ],
    "home_care_booking_patient": [
        ("recipient_name", "Recipient name"),
        ("home_care_booking.number", "Booking number"),
        ("home_care_booking.start_date", "Start date"),
        ("home_care_booking.assigned_staff_name", "Assigned staff"),
        ("clinic.name", "Hospital/clinic name"),
    ],
    "home_care_visit_patient": [
        ("recipient_name", "Recipient name"),
        ("home_care_visit.visit_date", "Visit date"),
        ("home_care_visit.description", "Service description"),
        ("home_care_visit.assigned_staff_name", "Assigned staff"),
        ("clinic.name", "Hospital/clinic name"),
    ],
    "home_visit_booking_patient": [
        ("recipient_name", "Recipient name"),
        ("home_care_booking.number", "Booking number"),
        ("home_care_booking.start_date", "Visit date"),
        ("home_care_booking.location", "Location"),
        ("clinic.name", "Hospital/clinic name"),
    ],
    "home_visit_reminder_patient": [
        ("recipient_name", "Recipient name"),
        ("home_care_visit.visit_date", "Visit date"),
        ("home_care_visit.description", "Service description"),
        ("home_care_booking.location", "Location"),
        ("clinic.name", "Hospital/clinic name"),
    ],
    "ip_admission_patient": [
        ("recipient_name", "Recipient name"),
        ("ip_admission.number", "Admission number"),
        ("ip_admission.admission_date", "Admission date"),
        ("ip_admission.ward", "Ward"),
        ("ip_admission.bed", "Bed"),
    ],
    "ip_discharge_patient": [
        ("recipient_name", "Recipient name"),
        ("ip_admission.number", "Admission number"),
        ("ip_discharge.discharge_date", "Discharge date"),
        ("ip_discharge.final_diagnosis", "Final diagnosis"),
        ("ip_discharge.follow_up_advice", "Follow-up advice"),
    ],
    "physiotherapy_case_patient": [
        ("recipient_name", "Recipient name"),
        ("physiotherapy_case.case_number", "Case number"),
        ("physiotherapy_case.assessment_date", "Assessment date"),
        ("physiotherapy_case.condition", "Condition"),
        ("physiotherapy_case.planned_sessions", "Planned sessions"),
    ],
    "physiotherapy_session_patient": [
        ("recipient_name", "Recipient name"),
        ("physiotherapy_session.session_date", "Session date"),
        ("physiotherapy_session.session_number", "Session number"),
        ("physiotherapy_session.modality_type", "Modality"),
        ("physiotherapy_session.home_program", "Home program"),
    ],
    "pharmacy_dispense_patient": [
        ("recipient_name", "Recipient name"),
        ("pharmacy_issue.number", "Issue number"),
        ("pharmacy_issue.medicine_text", "Medicines"),
        ("pharmacy_issue.amount", "Amount"),
        ("pharmacy_issue.dispensed_at", "Dispensed at"),
    ],
    "service_invoice_patient": [
        ("recipient_name", "Recipient name"),
        ("invoice.number", "Invoice number"),
        ("invoice.total_amount", "Total amount"),
        ("invoice.balance_amount", "Balance amount"),
        ("clinic.name", "Hospital/clinic name"),
    ],
    "service_follow_up_patient": [
        ("recipient_name", "Recipient name"),
        ("intelligence.last_activity_at", "Last activity"),
        ("intelligence.completed_visits", "Completed visits"),
        ("clinic.name", "Hospital/clinic name"),
    ],
}


# Flows whose default parameter order is deliberately NARROWER than the full
# catalog above. `default_field_order` is what a tenant sends when they have not
# saved a custom template, so it must keep matching the template they already
# had approved — widening the catalog to offer more optional fields must never
# silently add parameters to those existing sends. Only list a flow here when
# its catalog was extended after tenants were already live on it.
FLOW_DEFAULT_FIELD_ORDER: dict[str, list[str]] = {
    "appointment_booked_patient": [
        "recipient_name",
        "appointment_date",
        "appointment_time",
    ],
}


def flow_fields(flow_key: str) -> list[tuple[str, str]]:
    """Every selectable (key, label) for a flow, in the order the UI shows them.

    The hand-written entries above come first so the fields an approved
    template most commonly needs stay at the top of the picker; the
    module-derived fields (patient.date_of_birth, invoice.balance_amount, ...)
    follow. A module field whose flat equivalent is already listed is skipped,
    so "Recipient name" and "Patient · Full name" never both appear.
    """
    curated = list(FLOW_FIELD_CATALOG.get(flow_key, []))
    seen = {key for key, _label in curated}
    for key, label in entity_catalog(flow_key):
        if key in seen:
            continue
        seen.add(key)
        curated.append((key, label))
    return curated


def flow_field_keys(flow_key: str) -> set[str]:
    return {key for key, _label in flow_fields(flow_key)}


def flow_field_labels(flow_key: str) -> dict[str, str]:
    return dict(flow_fields(flow_key))


def default_field_order(flow_key: str) -> list[str]:
    pinned = FLOW_DEFAULT_FIELD_ORDER.get(flow_key)
    if pinned is not None:
        return list(pinned)
    return [key for key, _label in FLOW_FIELD_CATALOG.get(flow_key, [])]
