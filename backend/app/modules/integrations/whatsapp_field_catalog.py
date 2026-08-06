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
"""

FLOW_FIELD_CATALOG: dict[str, list[tuple[str, str]]] = {
    "appointment_booked_patient": [
        ("recipient_name", "Recipient name"),
        ("appointment_date", "Appointment date"),
        ("appointment_time", "Appointment time"),
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


def flow_field_keys(flow_key: str) -> set[str]:
    return {key for key, _label in FLOW_FIELD_CATALOG.get(flow_key, [])}


def flow_field_labels(flow_key: str) -> dict[str, str]:
    return dict(FLOW_FIELD_CATALOG.get(flow_key, []))


def default_field_order(flow_key: str) -> list[str]:
    return [key for key, _label in FLOW_FIELD_CATALOG.get(flow_key, [])]
