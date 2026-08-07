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
    "lab_report_ready_patient": ("patient", "clinic"),
    "prescription_ready_patient": ("patient", "doctor", "clinic"),
    "follow_up_advice_patient": ("patient", "doctor", "clinic"),
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
