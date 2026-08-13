"""Module-derived placeholder fields for WhatsApp templates.

`whatsapp_field_catalog.py` used to list, by hand, the two or three values each
notification flow could put into a template. That meant a tenant who later had
an approved template mentioning a patient's date of birth needed a code change
before they could pick it — even though the processor was already holding the
Patient row that has the value.

This module removes that step. It declares, per *module entity* (patient,
appointment, doctor, clinic, invoice), which columns are safe to expose as
template parameters and how to render each one. A flow then simply says which
entities it has in hand, and every field of those entities becomes selectable
in the template builder with no further code.

Field keys are namespaced (`patient.date_of_birth`) so they can never collide
with the original flat keys (`recipient_name`), which existing saved templates
still reference and which therefore must keep working untouched.
"""

from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal
from enum import Enum


@dataclass(frozen=True)
class EntityField:
    """One selectable placeholder derived from a module's column."""

    key: str
    label: str
    attribute: str
    kind: str = "text"


# Entities are labelled the way the UI groups them, so a chip reads
# "Patient · Date of birth" rather than exposing the table name.
ENTITY_LABELS: dict[str, str] = {
    "patient": "Patient",
    "appointment": "Appointment",
    "doctor": "Doctor",
    "clinic": "Clinic",
    "invoice": "Invoice",
    "intelligence": "Patient Intelligence",
    "membership": "Membership",
    "membership_plan": "Membership Plan",
    "engagement_action": "Engagement Action",
    "lab_order": "Lab Order",
    "consultation": "Consultation",
    "pharmacy_issue": "Pharmacy",
    "home_care_booking": "Home Care Booking",
    "home_care_visit": "Home Care Visit",
    "ip_admission": "IP Admission",
    "ip_discharge": "IP Discharge",
    "physiotherapy_case": "Physiotherapy Case",
    "physiotherapy_session": "Physiotherapy Session",
}


# Only columns that are meaningful *inside a message* are listed. Internal
# plumbing (tenant_id, branch_id, foreign keys, audit user ids, consent
# bookkeeping, file names) is deliberately omitted: it would leak internal
# identifiers into a patient-visible message and can never be what an approved
# template asks for.
ENTITY_FIELDS: dict[str, tuple[EntityField, ...]] = {
    "patient": (
        EntityField("full_name", "Full name", "full_name"),
        EntityField("patient_number", "Patient number", "patient_number"),
        EntityField("mobile", "Mobile", "mobile"),
        EntityField("alternate_mobile", "Alternate mobile", "alternate_mobile"),
        EntityField("email", "Email", "email"),
        EntityField("gender", "Gender", "gender", "enum"),
        EntityField("date_of_birth", "Date of birth", "date_of_birth", "date"),
        EntityField("age_years", "Age (years)", "age_years"),
        EntityField("blood_group", "Blood group", "blood_group"),
        EntityField("guardian_name", "Guardian name", "guardian_name"),
        EntityField("guardian_mobile", "Guardian mobile", "guardian_mobile"),
        EntityField("area", "Area", "area"),
        EntityField("address", "Address", "address"),
    ),
    "appointment": (
        EntityField("id", "Appointment ID", "id"),
        EntityField("date", "Date", "appointment_date", "date"),
        EntityField("time", "Time", "appointment_time", "time"),
        EntityField("status", "Status", "status", "enum"),
        EntityField("type", "Type", "appointment_type", "enum"),
        EntityField("reason", "Reason", "reason"),
        EntityField("visit_purpose", "Visit purpose", "visit_purpose"),
    ),
    "doctor": (
        EntityField("full_name", "Name", "full_name"),
        EntityField("practitioner_number", "Doctor number", "practitioner_number"),
        EntityField("primary_specialty", "Specialty", "primary_specialty"),
        EntityField(
            "registration_number", "Registration number", "registration_number"
        ),
        EntityField("mobile", "Mobile", "mobile"),
        EntityField("email", "Email", "email"),
    ),
    "clinic": (
        EntityField("name", "Name", "name"),
        EntityField("legal_name", "Legal name", "legal_name"),
        EntityField("email", "Email", "email"),
        EntityField("phone", "Phone", "phone"),
        EntityField("address", "Address", "address"),
    ),
    "invoice": (
        EntityField("number", "Invoice number", "invoice_number"),
        EntityField("status", "Status", "status", "enum"),
        EntityField("total_amount", "Total amount", "total_amount", "money"),
        EntityField("paid_amount", "Paid amount", "paid_amount", "money"),
        EntityField("balance_amount", "Balance amount", "balance_amount", "money"),
        EntityField("discount_amount", "Discount amount", "discount_amount", "money"),
        EntityField("tax_amount", "Tax amount", "tax_amount", "money"),
        EntityField("date", "Invoice date", "created_at", "date"),
    ),
    "membership": (
        EntityField("starts_on", "Start date", "starts_on", "date"),
        EntityField("ends_on", "End date", "ends_on", "date"),
        EntityField("activated_on", "Activated date", "activated_on", "date"),
        EntityField("status", "Status", "status", "enum"),
        EntityField("used_consultations", "Used consultations", "used_consultations"),
        EntityField("paid_amount", "Paid amount", "paid_amount", "money"),
        EntityField(
            "purchase_invoice_id", "Purchase invoice ID", "purchase_invoice_id"
        ),
    ),
    "membership_plan": (
        EntityField("name", "Plan name", "name"),
        EntityField("code", "Plan code", "code"),
        EntityField("price_amount", "Plan amount", "price_amount", "money"),
        EntityField("duration_days", "Duration days", "duration_days"),
        EntityField("free_consultations", "Free consultations", "free_consultations"),
        EntityField("free_lab_tests", "Free lab tests", "free_lab_tests"),
        EntityField("free_medicines", "Free medicines", "free_medicines"),
        EntityField(
            "lab_discount_percentage", "Lab discount %", "lab_discount_percentage"
        ),
        EntityField(
            "pharmacy_discount_percentage",
            "Pharmacy discount %",
            "pharmacy_discount_percentage",
        ),
        EntityField(
            "min_discount_amount",
            "Minimum discount amount",
            "min_discount_amount",
            "money",
        ),
    ),
    "intelligence": (
        EntityField("last_activity_at", "Last activity", "last_activity_at", "date"),
        EntityField("completed_visits", "Completed visits", "completed_visits"),
        EntityField("no_show_count", "No-show count", "no_show_count"),
        EntityField("lab_order_count", "Lab order count", "lab_order_count"),
        EntityField(
            "pharmacy_dispense_count",
            "Pharmacy dispense count",
            "pharmacy_dispense_count",
        ),
        EntityField(
            "home_care_visit_count",
            "Home-care visit count",
            "home_care_visit_count",
        ),
        EntityField(
            "net_collected_30d", "30-day collected", "net_collected_30d", "money"
        ),
        EntityField(
            "net_collected_365d", "365-day collected", "net_collected_365d", "money"
        ),
        EntityField(
            "lifetime_net_collected",
            "Lifetime collected",
            "lifetime_net_collected",
            "money",
        ),
        EntityField(
            "outstanding_amount", "Outstanding amount", "outstanding_amount", "money"
        ),
        EntityField(
            "membership_ends_on", "Membership end date", "membership_ends_on", "date"
        ),
        EntityField(
            "expected_refill_at", "Expected refill date", "expected_refill_at", "date"
        ),
        EntityField(
            "recurring_medicine_id", "Recurring medicine ID", "recurring_medicine_id"
        ),
        EntityField(
            "recurring_interval_days",
            "Recurring interval days",
            "recurring_interval_days",
        ),
    ),
    "engagement_action": (
        EntityField("action_key", "Action key", "action_key"),
        EntityField("channel", "Channel", "channel"),
        EntityField("template_key", "Template key", "template_key"),
        EntityField("status", "Status", "status", "enum"),
        EntityField("reason", "Reason", "reason"),
        EntityField("created_at", "Created at", "created_at", "date"),
    ),
    "lab_order": (
        EntityField("number", "Order number", "lab_order_number"),
        EntityField("order_date", "Order date", "order_date", "date"),
        EntityField("source", "Source", "source", "enum"),
        EntityField("status", "Status", "status", "enum"),
        EntityField("priority", "Priority", "priority", "enum"),
        EntityField("tests", "Tests", "tests"),
        EntityField("notes", "Notes", "notes"),
        EntityField("amount", "Amount", "amount", "money"),
        EntityField(
            "sample_collected_at", "Sample collected at", "sample_collected_at", "date"
        ),
        EntityField("result_ready_at", "Result ready at", "result_ready_at", "date"),
    ),
    "consultation": (
        EntityField("status", "Status", "status", "enum"),
        EntityField("treatment_type", "Treatment type", "treatment_type"),
        EntityField("chief_complaint", "Chief complaint", "chief_complaint"),
        EntityField("diagnosis", "Diagnosis", "diagnosis"),
        EntityField("clinical_notes", "Clinical notes", "clinical_notes"),
        EntityField("prescription_text", "Prescription", "prescription_text"),
        EntityField("lab_referral_text", "Lab referral", "lab_referral_text"),
        EntityField("scan_referral_text", "Scan referral", "scan_referral_text"),
        EntityField("follow_up_advice", "Follow-up advice", "follow_up_advice"),
        EntityField("patient_remarks", "Patient remarks", "patient_remarks"),
        EntityField("signed_at", "Signed at", "signed_at", "date"),
        EntityField("created_at", "Created at", "created_at", "date"),
    ),
    "pharmacy_issue": (
        EntityField("number", "Issue number", "issue_number"),
        EntityField("source", "Source", "source", "enum"),
        EntityField("status", "Status", "status", "enum"),
        EntityField("medicine_text", "Medicines", "medicine_text"),
        EntityField("notes", "Notes", "notes"),
        EntityField(
            "external_prescriber", "External prescriber", "external_prescriber"
        ),
        EntityField("amount", "Amount", "amount", "money"),
        EntityField("dispensed_at", "Dispensed at", "dispensed_at", "date"),
        EntityField("created_at", "Created at", "created_at", "date"),
    ),
    "home_care_booking": (
        EntityField("number", "Booking number", "booking_number"),
        EntityField("assigned_staff_name", "Assigned staff", "assigned_staff_name"),
        EntityField("staff_type", "Staff type", "staff_type"),
        EntityField("booking_type", "Booking type", "booking_type"),
        EntityField("recurrence", "Recurrence", "recurrence"),
        EntityField("start_date", "Start date", "start_date", "date"),
        EntityField("end_date", "End date", "end_date", "date"),
        EntityField("status", "Status", "status"),
        EntityField("location", "Location", "location"),
        EntityField("complaints", "Complaints", "complaints"),
        EntityField("notes", "Notes", "notes"),
    ),
    "home_care_visit": (
        EntityField("visit_date", "Visit date", "visit_date", "date"),
        EntityField("assigned_staff_name", "Assigned staff", "assigned_staff_name"),
        EntityField("staff_type", "Staff type", "staff_type"),
        EntityField("description", "Service description", "description"),
        EntityField("quantity", "Quantity", "quantity"),
        EntityField("unit_amount", "Unit amount", "unit_amount", "money"),
        EntityField("total_amount", "Total amount", "total_amount", "money"),
        EntityField("status", "Status", "status"),
        EntityField("notes", "Notes", "notes"),
    ),
    "ip_admission": (
        EntityField("number", "Admission number", "admission_number"),
        EntityField("ward", "Ward", "ward"),
        EntityField("room", "Room", "room"),
        EntityField("bed", "Bed", "bed"),
        EntityField("admission_date", "Admission date", "admission_date", "date"),
        EntityField(
            "expected_discharge_date",
            "Expected discharge date",
            "expected_discharge_date",
            "date",
        ),
        EntityField("reason", "Reason", "reason"),
        EntityField(
            "provisional_diagnosis", "Provisional diagnosis", "provisional_diagnosis"
        ),
        EntityField("status", "Status", "status"),
    ),
    "ip_discharge": (
        EntityField("discharge_date", "Discharge date", "discharge_date", "date"),
        EntityField("final_diagnosis", "Final diagnosis", "final_diagnosis"),
        EntityField("course_in_hospital", "Course in hospital", "course_in_hospital"),
        EntityField("procedures", "Procedures", "procedures"),
        EntityField("medications", "Medications", "medications"),
        EntityField("follow_up_advice", "Follow-up advice", "follow_up_advice"),
        EntityField(
            "condition_at_discharge", "Condition at discharge", "condition_at_discharge"
        ),
        EntityField("status", "Status", "status"),
        EntityField("finalized_at", "Finalized at", "finalized_at", "date"),
    ),
    "physiotherapy_case": (
        EntityField("case_number", "Case number", "case_number"),
        EntityField("assessment_date", "Assessment date", "assessment_date", "date"),
        EntityField("care_context", "Care context", "care_context"),
        EntityField("body_region", "Body region", "body_region"),
        EntityField("condition", "Condition", "condition"),
        EntityField("pain_score", "Pain score", "pain_score"),
        EntityField("range_of_motion", "Range of motion", "range_of_motion"),
        EntityField("muscle_strength", "Muscle strength", "muscle_strength"),
        EntityField("treatment_goal", "Treatment goal", "treatment_goal"),
        EntityField("planned_sessions", "Planned sessions", "planned_sessions"),
        EntityField("frequency", "Frequency", "frequency"),
        EntityField("status", "Status", "status"),
    ),
    "physiotherapy_session": (
        EntityField("session_date", "Session date", "session_date", "date"),
        EntityField("session_number", "Session number", "session_number"),
        EntityField("modality_type", "Modality", "modality_type"),
        EntityField("treatment_area", "Treatment area", "treatment_area"),
        EntityField("intensity", "Intensity", "intensity"),
        EntityField("duration_minutes", "Duration minutes", "duration_minutes"),
        EntityField("pre_pain_score", "Pre pain score", "pre_pain_score"),
        EntityField("post_pain_score", "Post pain score", "post_pain_score"),
        EntityField("exercises", "Exercises", "exercises"),
        EntityField("home_program", "Home program", "home_program"),
        EntityField("notes", "Notes", "notes"),
        EntityField("charge_amount", "Charge amount", "charge_amount", "money"),
        EntityField("status", "Status", "status"),
    ),
}


# Which module entities each flow has loaded at send time. Adding an entity
# here makes every one of its fields selectable for that flow; it does not
# change what an existing template sends, because a template only ever sends
# the fields it has explicitly saved.
FLOW_ENTITIES: dict[str, tuple[str, ...]] = {
    "appointment_booked_patient": ("patient", "appointment", "doctor", "clinic"),
    "appointment_booked_doctor": ("patient", "appointment", "doctor", "clinic"),
    "appointment_cancelled_patient": ("patient", "appointment", "doctor", "clinic"),
    "appointment_cancelled_doctor": ("patient", "appointment", "doctor", "clinic"),
    "appointment_reminder_patient": ("patient", "appointment", "doctor", "clinic"),
    "invoice_paid_patient": ("patient", "invoice", "clinic"),
    "payment_pending_patient": ("patient", "invoice", "clinic"),
    "invoice_refunded_patient": ("patient", "invoice", "clinic"),
    "lab_report_ready_patient": ("patient", "clinic", "lab_order"),
    "prescription_ready_patient": (
        "patient",
        "doctor",
        "clinic",
        "consultation",
    ),
    "follow_up_advice_patient": (
        "patient",
        "doctor",
        "clinic",
        "consultation",
    ),
    "medicine_refill_patient": (
        "patient",
        "clinic",
        "intelligence",
        "pharmacy_issue",
        "engagement_action",
    ),
    "health_tip_patient": (
        "patient",
        "clinic",
        "intelligence",
        "membership",
        "membership_plan",
        "engagement_action",
    ),
    "lab_test_reminder_patient": (
        "patient",
        "clinic",
        "intelligence",
        "lab_order",
        "engagement_action",
    ),
    "membership_renewal_patient": (
        "patient",
        "clinic",
        "intelligence",
        "membership",
        "membership_plan",
        "invoice",
        "engagement_action",
    ),
    "unused_benefit_patient": (
        "patient",
        "clinic",
        "intelligence",
        "membership",
        "membership_plan",
        "engagement_action",
    ),
    "patient_reengagement": (
        "patient",
        "clinic",
        "intelligence",
        "membership",
        "membership_plan",
        "engagement_action",
    ),
    "home_care_booking_patient": ("patient", "clinic", "home_care_booking"),
    "home_care_visit_patient": (
        "patient",
        "clinic",
        "home_care_booking",
        "home_care_visit",
    ),
    "home_visit_booking_patient": ("patient", "clinic", "home_care_booking"),
    "home_visit_reminder_patient": (
        "patient",
        "clinic",
        "home_care_booking",
        "home_care_visit",
    ),
    "ip_admission_patient": ("patient", "clinic", "ip_admission", "doctor"),
    "ip_discharge_patient": (
        "patient",
        "clinic",
        "ip_admission",
        "ip_discharge",
        "doctor",
    ),
    "physiotherapy_case_patient": (
        "patient",
        "clinic",
        "physiotherapy_case",
        "doctor",
    ),
    "physiotherapy_session_patient": (
        "patient",
        "clinic",
        "physiotherapy_case",
        "physiotherapy_session",
        "doctor",
    ),
    "pharmacy_dispense_patient": ("patient", "clinic", "pharmacy_issue"),
    "service_invoice_patient": ("patient", "clinic", "invoice"),
    "service_follow_up_patient": ("patient", "clinic", "intelligence"),
}

DATE_FORMAT = "%d %B %Y"
TIME_FORMAT = "%I:%M %p"


def field_key(entity: str, field: EntityField) -> str:
    return f"{entity}.{field.key}"


def field_label(entity: str, field: EntityField) -> str:
    return f"{ENTITY_LABELS.get(entity, entity.title())} · {field.label}"


def entity_catalog(flow_key: str) -> list[tuple[str, str]]:
    """Every (key, label) pair a flow exposes through its module entities."""
    entries: list[tuple[str, str]] = []
    for entity in FLOW_ENTITIES.get(flow_key, ()):
        for field in ENTITY_FIELDS.get(entity, ()):
            entries.append((field_key(entity, field), field_label(entity, field)))
    return entries


def render_value(value, kind: str) -> str:
    """Render a column value the way a message should read.

    Returns "" for anything unset so a template placeholder degrades to an
    empty string rather than leaking "None" into a patient's message.
    """
    if value is None:
        return ""
    if kind == "money":
        amount = value if isinstance(value, Decimal) else Decimal(str(value))
        return f"{amount:.2f}".rstrip("0").rstrip(".")
    if kind == "enum":
        raw = value.value if isinstance(value, Enum) else str(value)
        return raw.replace("_", " ").strip().title()
    if kind == "date":
        if isinstance(value, datetime):
            return value.strftime(DATE_FORMAT)
        if isinstance(value, date):
            return value.strftime(DATE_FORMAT)
        return str(value)
    if kind == "time":
        if isinstance(value, datetime):
            return value.strftime(TIME_FORMAT)
        formatted = getattr(value, "strftime", None)
        return formatted(TIME_FORMAT) if formatted else str(value)
    return str(value)


def build_entity_context(flow_key: str, entities: dict[str, object]) -> dict[str, str]:
    """Flatten the loaded module rows into namespaced placeholder values.

    Entities the caller could not resolve (a walk-in with no practitioner, say)
    are simply absent, and their fields render empty.
    """
    context: dict[str, str] = {}
    for entity in FLOW_ENTITIES.get(flow_key, ()):
        instance = entities.get(entity)
        for field in ENTITY_FIELDS.get(entity, ()):
            key = field_key(entity, field)
            if instance is None:
                context[key] = ""
                continue
            context[key] = render_value(
                getattr(instance, field.attribute, None), field.kind
            )
    return context
