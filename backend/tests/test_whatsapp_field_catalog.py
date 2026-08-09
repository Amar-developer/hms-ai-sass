"""Guards on the WhatsApp placeholder-field catalog.

Widening a flow's catalog is how an admin gets more fields to choose from in
the template builder. The trap is that the catalog also backs
`default_field_order`, which is what a tenant sends when they have *not* saved
a custom template — so a careless widening silently appends parameters to
sends that a tenant already had approved by Meta, and those sends start
failing. These tests pin both halves of that contract.
"""

from app.modules.integrations.whatsapp_field_catalog import (
    FLOW_FIELD_CATALOG,
    default_field_order,
    flow_field_keys,
    flow_field_labels,
)


def test_patient_booking_offers_doctor_and_clinic_fields():
    """Approved patient templates commonly name the doctor and the clinic."""
    available = flow_field_keys("appointment_booked_patient")

    assert {"doctor_name", "clinic_name"} <= available


def test_patient_booking_default_order_stays_backward_compatible():
    """Tenants without a custom template must keep sending the original 3 params.

    If this fails because the catalog grew, add the flow to
    FLOW_DEFAULT_FIELD_ORDER rather than changing this expectation — an existing
    approved template does not gain parameters just because the UI offers more.
    """
    assert default_field_order("appointment_booked_patient") == [
        "recipient_name",
        "appointment_date",
        "appointment_time",
    ]


def test_every_default_field_order_is_offered_by_its_flow():
    """A default parameter must be a field the flow actually exposes."""
    for flow_key in FLOW_FIELD_CATALOG:
        available = flow_field_keys(flow_key)
        for field_key in default_field_order(flow_key):
            assert field_key in available, (
                f"{flow_key} defaults to {field_key!r}, which its catalog "
                "does not offer"
            )


def test_catalog_entries_are_unique_and_labelled():
    for flow_key, entries in FLOW_FIELD_CATALOG.items():
        keys = [key for key, _label in entries]
        assert len(keys) == len(set(keys)), f"{flow_key} repeats a field key"
        labels = flow_field_labels(flow_key)
        assert all(
            labels[key].strip() for key in keys
        ), f"{flow_key} has an unlabelled field"


def test_module_fields_are_selectable_without_code_changes():
    """The point of the entity catalog: a field nobody curated is still pickable.

    `date_of_birth` is never listed by hand for any flow — it becomes available
    purely because the appointment flows expose the patient module.
    """
    available = flow_field_keys("appointment_booked_patient")

    assert "patient.date_of_birth" in available
    assert "patient.blood_group" in available
    assert "doctor.primary_specialty" in available
    assert "invoice.balance_amount" in flow_field_keys("invoice_paid_patient")


def test_entity_context_renders_values_for_a_loaded_row():
    from datetime import date

    from app.modules.integrations.whatsapp_entity_fields import build_entity_context
    from app.modules.patients.models import Patient

    patient = Patient(
        tenant_id="t1",
        patient_number="P-1",
        full_name="Asha Rao",
        mobile="98765 43210",
        date_of_birth=date(1990, 4, 17),
        blood_group="O+",
    )

    context = build_entity_context("appointment_booked_patient", {"patient": patient})

    assert context["patient.full_name"] == "Asha Rao"
    assert context["patient.date_of_birth"] == "17 April 1990"
    assert context["patient.blood_group"] == "O+"
    # An entity the caller could not resolve renders empty, never "None".
    assert context["doctor.full_name"] == ""


def test_unset_values_never_render_as_none():
    from app.modules.integrations.whatsapp_entity_fields import render_value

    assert render_value(None, "text") == ""
    assert render_value(None, "date") == ""
    assert render_value(None, "money") == ""
