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
