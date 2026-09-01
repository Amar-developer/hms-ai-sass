"""Guards on the WhatsApp placeholder-field catalog.

Widening a flow's catalog is how an admin gets more fields to choose from in
the template builder. The trap is that the catalog also backs
`default_field_order`, which is what a tenant sends when they have *not* saved
a custom template — so a careless widening silently appends parameters to
sends that a tenant already had approved by Meta, and those sends start
failing. These tests pin both halves of that contract.
"""

from app.modules.integrations.whatsapp.field_catalog import (
    FLOW_FIELD_CATALOG,
    default_field_order,
    flow_field_keys,
    flow_field_labels,
    normalize_saved_field_order,
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


def test_membership_benefit_default_order_matches_approved_six_parameters():
    assert default_field_order("unused_benefit_patient") == [
        "recipient_name",
        "membership_plan_name",
        "clinic_name",
        "unused_benefits_summary",
        "expiry_date",
        "clinic.phone",
    ]


def test_legacy_ten_field_membership_mapping_is_upgraded_to_six_parameters():
    legacy = [
        "recipient_name",
        "membership_plan_name",
        "membership_plan.name",
        "expiry_date",
        "days_remaining",
        "unused_consultations",
        "unused_lab_tests",
        "unused_medicines",
        "unused_benefits_summary",
        "clinic_name",
    ]

    assert normalize_saved_field_order("unused_benefit_patient", legacy) == [
        "recipient_name",
        "membership_plan_name",
        "clinic_name",
        "unused_benefits_summary",
        "expiry_date",
        "clinic.phone",
    ]


def test_home_care_and_visit_confirmation_use_approved_six_parameters():
    approved = [
        "recipient_name",
        "clinic_name",
        "service_description",
        "booking_start_date",
        "booking_end_date",
        "clinic_name",
    ]

    assert default_field_order("home_care_booking_patient") == approved
    assert default_field_order("home_visit_booking_patient") == approved


def test_legacy_home_booking_mappings_are_upgraded_to_six_parameters():
    approved = default_field_order("home_care_booking_patient")

    assert (
        normalize_saved_field_order(
            "home_care_booking_patient",
            [
                "recipient_name",
                "home_care_booking.number",
                "home_care_booking.start_date",
                "home_care_booking.assigned_staff_name",
                "clinic.name",
            ],
        )
        == approved
    )
    assert (
        normalize_saved_field_order(
            "home_visit_booking_patient",
            [
                "recipient_name",
                "home_care_booking.number",
                "home_care_booking.start_date",
                "home_care_booking.location",
                "clinic.name",
            ],
        )
        == approved
    )


def test_empty_fixed_template_mappings_restore_approved_contract():
    for flow_key in (
        "unused_benefit_patient",
        "home_care_booking_patient",
        "home_visit_booking_patient",
    ):
        assert normalize_saved_field_order(flow_key, []) == default_field_order(
            flow_key
        )


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
    assert "lab_order.tests" in flow_field_keys("lab_report_ready_patient")
    assert "consultation.diagnosis" in flow_field_keys("prescription_ready_patient")
    assert "membership_plan.price_amount" in flow_field_keys(
        "membership_renewal_patient"
    )
    assert "membership.used_consultations" in flow_field_keys(
        "membership_renewal_patient"
    )
    assert "engagement_action.reason" in flow_field_keys("patient_reengagement")
    assert "pharmacy_issue.medicine_text" in flow_field_keys("medicine_refill_patient")
    assert "home_care_booking.start_date" in flow_field_keys(
        "home_care_booking_patient"
    )
    assert "home_care_visit.visit_date" in flow_field_keys(
        "home_visit_reminder_patient"
    )
    assert "ip_admission.admission_date" in flow_field_keys("ip_admission_patient")
    assert "ip_discharge.final_diagnosis" in flow_field_keys("ip_discharge_patient")
    assert "physiotherapy_case.condition" in flow_field_keys(
        "physiotherapy_case_patient"
    )
    assert "physiotherapy_session.home_program" in flow_field_keys(
        "physiotherapy_session_patient"
    )


def test_entity_context_renders_values_for_a_loaded_row():
    from datetime import date

    from app.modules.integrations.whatsapp.entity_fields import build_entity_context
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


def test_membership_assistance_phone_comes_from_tenant_phone():
    from app.modules.integrations.whatsapp.entity_fields import build_entity_context
    from app.modules.tenants.models import Tenant

    tenant = Tenant(name="Sri Maha Clinic", phone="9047660909")

    context = build_entity_context("unused_benefit_patient", {"clinic": tenant})

    assert context["clinic.phone"] == "9047660909"


def test_membership_and_lab_entity_contexts_render_values():
    from datetime import date

    from app.modules.integrations.whatsapp.entity_fields import build_entity_context
    from app.modules.lab.models import LabOrder
    from app.modules.patient_subscriptions.models import (
        PatientSubscriptionEnrollment,
        PatientSubscriptionEnrollmentStatus,
        PatientSubscriptionPlan,
    )

    plan = PatientSubscriptionPlan(
        tenant_id="t1",
        name="Smart Premium Care",
        price_amount=5000,
        duration_days=365,
        free_consultations=4,
        free_lab_test_ids_json='["cbc","lipid"]',
        free_medicine_ids_json='["med1"]',
    )
    enrollment = PatientSubscriptionEnrollment(
        tenant_id="t1",
        branch_id="b1",
        patient_id="p1",
        plan_id="plan1",
        starts_on=date(2026, 8, 1),
        ends_on=date(2027, 8, 1),
        status=PatientSubscriptionEnrollmentStatus.ACTIVE,
        used_consultations=2,
        paid_amount=5000,
    )
    lab_order = LabOrder(
        tenant_id="t1",
        branch_id="b1",
        patient_id="p1",
        tests="CBC, Lipid Profile",
        amount=1200,
    )

    membership_context = build_entity_context(
        "membership_renewal_patient",
        {"membership": enrollment, "membership_plan": plan},
    )
    lab_context = build_entity_context(
        "lab_report_ready_patient", {"lab_order": lab_order}
    )

    assert membership_context["membership_plan.name"] == "Smart Premium Care"
    assert membership_context["membership_plan.price_amount"] == "5000"
    assert membership_context["membership_plan.free_lab_tests"] == "2"
    assert membership_context["membership.used_consultations"] == "2"
    assert lab_context["lab_order.tests"] == "CBC, Lipid Profile"
    assert lab_context["lab_order.amount"] == "1200"


def test_unset_values_never_render_as_none():
    from app.modules.integrations.whatsapp.entity_fields import render_value

    assert render_value(None, "text") == ""
    assert render_value(None, "date") == ""
    assert render_value(None, "money") == ""


def test_flow_audience_is_one_answer_for_every_caller():
    """Queue time and send time must classify a flow identically.

    These used to disagree: some callers tested the `_doctor` suffix, others a
    hardcoded pair of appointment keys. A third doctor flow would then be
    queued as a doctor message but sent as a patient one.
    """
    from app.modules.integrations.whatsapp.schemas import (
        WhatsAppFlowKey,
        audience_enabled_for,
        flow_audience,
    )
    import typing

    assert flow_audience("admin_daily_report") == "admin"
    assert flow_audience("appointment_booked_doctor") == "doctor"
    assert flow_audience("appointment_booked_patient") == "patient"
    # A doctor flow that does not exist yet still classifies correctly.
    assert flow_audience("lab_report_ready_doctor") == "doctor"

    for key in typing.get_args(WhatsAppFlowKey):
        audience = flow_audience(key)
        assert audience in {"patient", "doctor", "admin"}
        assert audience_enabled_for(
            key, patient_enabled=False, doctor_enabled=False
        ) is (audience == "admin")
        assert (
            audience_enabled_for(key, patient_enabled=True, doctor_enabled=True) is True
        )
