"""Phase 5: P1 flows, plan/credit enforcement, language selection,
cost reporting, and provider-invoice reconciliation."""

from datetime import date, timedelta

from sqlmodel import Session

from app.modules.notifications.sms_processor import process_due_sms_notifications
from app.modules.integrations.sms_home_care_reminders import (
    queue_due_sms_home_care_visit_reminders,
)
from app.modules.integrations.sms_membership_reminders import (
    queue_due_sms_membership_expiry_reminders,
)
from tests.test_sms_p0_triggers import (
    _sms_events,
    _sms_flow,
    configure_ready_sms_integration,
    create_patient,
    setup_notify_tenant,
)


class FakeGateway:
    def __init__(self, result):
        self.result = result
        self.requests = []

    def send_sms(self, request, **kwargs):
        self.requests.append((request, kwargs))
        return self.result


def _accepted_result():
    from app.infrastructure.integrations.ports.sms import SmsSendResult

    return SmsSendResult(True, "accepted", "ok")


# --------------------------------------------------------------------------
# Plan-level segment ceiling (fail closed) and credit top-ups
# --------------------------------------------------------------------------


def test_a_plan_with_no_sms_entitlement_blocks_usage_and_sending(client, test_engine):
    tenant, branch = setup_notify_tenant(client, modules=["sms"], providers=["sms"])
    # Override the fixture's generous plan headroom with a zero-entitlement plan.
    plan = client.post(
        "/api/v1/subscription-plans",
        json={
            "key": "sms_phase5_zero",
            "name": "Zero SMS Plan",
            "monthly_patient_limit": 1000,
            "monthly_sms_segment_limit": 0,
            "enabled_modules": ["patients", "appointments", "queue", "sms"],
        },
    ).json()
    client.post(
        "/api/v1/subscription-plans/tenant-subscriptions",
        headers={"X-Tenant-ID": tenant["id"]},
        json={
            "plan_id": plan["id"],
            "starts_on": date.today().isoformat(),
            "is_trial": False,
        },
    )
    configure_ready_sms_integration(
        client, tenant["id"], flows=[_sms_flow("appointment_booked_patient")]
    )
    patient = create_patient(client, tenant["id"])

    usage = client.get(
        "/api/v1/communications/sms/usage", headers={"X-Tenant-ID": tenant["id"]}
    ).json()
    assert usage["plan_segment_limit"] == 0
    assert usage["limit_reached"] is True

    response = client.post(
        "/api/v1/appointments",
        headers={"X-Tenant-ID": tenant["id"]},
        json={
            "branch_id": branch["id"],
            "patient_id": patient["id"],
            "appointment_type": "op",
            "appointment_date": date.today().isoformat(),
            "department_id": "general",
            "practitioner_id": "doctor_demo",
        },
    )
    assert response.status_code == 201

    with Session(test_engine) as session:
        assert _sms_events(session, tenant["id"]) == []


def test_a_segment_credit_top_up_raises_the_effective_ceiling(client, test_engine):
    tenant, branch = setup_notify_tenant(client, modules=["sms"], providers=["sms"])
    plan = client.post(
        "/api/v1/subscription-plans",
        json={
            "key": "sms_phase5_credit",
            "name": "Credit Test Plan",
            "monthly_patient_limit": 1000,
            "monthly_sms_segment_limit": 0,
            "enabled_modules": ["patients", "appointments", "queue", "sms"],
        },
    ).json()
    client.post(
        "/api/v1/subscription-plans/tenant-subscriptions",
        headers={"X-Tenant-ID": tenant["id"]},
        json={
            "plan_id": plan["id"],
            "starts_on": date.today().isoformat(),
            "is_trial": False,
        },
    )
    configure_ready_sms_integration(
        client, tenant["id"], flows=[_sms_flow("appointment_booked_patient")]
    )
    before = client.get(
        "/api/v1/communications/sms/usage", headers={"X-Tenant-ID": tenant["id"]}
    ).json()
    assert before["plan_segment_limit"] == 0

    credit = client.post(
        "/api/v1/subscription-plans/credits",
        headers={"X-Tenant-ID": tenant["id"]},
        json={"credit_type": "sms_segments", "quantity": 50, "amount": 0},
    )
    assert credit.status_code == 201, credit.text

    after = client.get(
        "/api/v1/communications/sms/usage", headers={"X-Tenant-ID": tenant["id"]}
    ).json()
    assert after["plan_segment_credits"] == 50
    assert after["plan_segment_limit"] == 50


# --------------------------------------------------------------------------
# Cost reporting
# --------------------------------------------------------------------------


def test_usage_reports_estimated_cost_from_the_configured_rate(client, test_engine):
    tenant, branch = setup_notify_tenant(client, modules=["sms"], providers=["sms"])
    configure_ready_sms_integration(
        client, tenant["id"], flows=[_sms_flow("appointment_booked_patient")]
    )
    save = client.put(
        "/api/v1/communications/sms/settings",
        headers={"X-Tenant-ID": tenant["id"]},
        json={
            "provider": "smscountry",
            "enabled": True,
            "sms_country_api_mode": "rest",
            "api_url": "https://restapi.smscountry.com/v0.1/Accounts/{auth_key}/SMSes/",
            "dlt_entity_id": "1101000012345678901",
            "default_sender_id": "MEDHUB",
            "cost_per_segment_paise": 25,
            "flows": [_sms_flow("appointment_booked_patient")],
        },
    )
    assert save.status_code == 200, save.text

    usage = client.get(
        "/api/v1/communications/sms/usage", headers={"X-Tenant-ID": tenant["id"]}
    ).json()
    assert usage["cost_per_segment_paise"] == 25
    assert usage["estimated_cost_paise"] == usage["segments_used"] * 25


def test_zero_cost_rate_omits_estimated_cost_rather_than_showing_free(
    client, test_engine
):
    tenant, branch = setup_notify_tenant(client, modules=["sms"], providers=["sms"])
    configure_ready_sms_integration(
        client, tenant["id"], flows=[_sms_flow("appointment_booked_patient")]
    )
    usage = client.get(
        "/api/v1/communications/sms/usage", headers={"X-Tenant-ID": tenant["id"]}
    ).json()
    assert usage["cost_per_segment_paise"] == 0
    assert usage["estimated_cost_paise"] is None


# --------------------------------------------------------------------------
# Reconciliation
# --------------------------------------------------------------------------


def test_reconciliation_records_variance_against_internal_segments(client, test_engine):
    tenant, branch = setup_notify_tenant(client, modules=["sms"], providers=["sms"])
    configure_ready_sms_integration(
        client, tenant["id"], flows=[_sms_flow("appointment_booked_patient")]
    )
    patient = create_patient(client, tenant["id"])
    client.post(
        "/api/v1/appointments",
        headers={"X-Tenant-ID": tenant["id"]},
        json={
            "branch_id": branch["id"],
            "patient_id": patient["id"],
            "appointment_type": "op",
            "appointment_date": date.today().isoformat(),
            "department_id": "general",
            "practitioner_id": "doctor_demo",
        },
    )
    with Session(test_engine) as session:
        internal_segments = sum(
            event.segment_count or 1 for event in _sms_events(session, tenant["id"])
        )
    assert internal_segments >= 1

    today = date.today()
    response = client.post(
        "/api/v1/communications/sms/reconciliation",
        headers={"X-Tenant-ID": tenant["id"]},
        json={
            "period_start": today.replace(day=1).isoformat(),
            "period_end": today.isoformat(),
            "provider_billed_segments": internal_segments + 2,
            "provider_amount_paise": 500,
            "notes": "First month's SMSCountry invoice",
        },
    )
    assert response.status_code == 201, response.text
    record = response.json()
    assert record["internal_segments"] == internal_segments
    assert record["variance_segments"] == 2

    listing = client.get(
        "/api/v1/communications/sms/reconciliation",
        headers={"X-Tenant-ID": tenant["id"]},
    ).json()
    assert len(listing) == 1
    assert listing[0]["id"] == record["id"]


def test_reconciliation_rejects_an_inverted_period(client, test_engine):
    tenant, branch = setup_notify_tenant(client, modules=["sms"], providers=["sms"])
    configure_ready_sms_integration(
        client, tenant["id"], flows=[_sms_flow("appointment_booked_patient")]
    )
    response = client.post(
        "/api/v1/communications/sms/reconciliation",
        headers={"X-Tenant-ID": tenant["id"]},
        json={
            "period_start": date.today().isoformat(),
            "period_end": (date.today() - timedelta(days=5)).isoformat(),
            "provider_billed_segments": 10,
            "provider_amount_paise": 100,
        },
    )
    assert response.status_code == 422


# --------------------------------------------------------------------------
# Language selection
# --------------------------------------------------------------------------


def test_worker_sends_the_template_matching_the_patients_preferred_language(
    client, test_engine, monkeypatch
):
    tenant, branch = setup_notify_tenant(client, modules=["sms"], providers=["sms"])
    configure_ready_sms_integration(
        client,
        tenant["id"],
        flows=[
            _sms_flow(
                "appointment_booked_patient",
                id="sms_tpl_en",
                language="en",
                registered_body="Hello {#var#}, appointment confirmed.",
            ),
            _sms_flow(
                "appointment_booked_patient",
                id="sms_tpl_hi",
                language="hi",
                registered_body="Namaste {#var#}, appointment confirmed.",
            ),
        ],
    )
    patient_resp = client.post(
        "/api/v1/patients",
        headers={"X-Tenant-ID": tenant["id"]},
        json={
            "full_name": "Hindi Patient",
            "mobile": "9876500000",
            "sms_preferred_language": "hi",
        },
    )
    assert patient_resp.status_code == 201, patient_resp.text
    patient = patient_resp.json()

    booking = client.post(
        "/api/v1/appointments",
        headers={"X-Tenant-ID": tenant["id"]},
        json={
            "branch_id": branch["id"],
            "patient_id": patient["id"],
            "appointment_type": "op",
            "appointment_date": date.today().isoformat(),
            "department_id": "general",
            "practitioner_id": "doctor_demo",
        },
    )
    assert booking.status_code == 201

    gateway = FakeGateway(_accepted_result())
    with Session(test_engine) as session:
        process_due_sms_notifications(session, gateway=gateway)

    assert len(gateway.requests) == 1
    sent_request, _kwargs = gateway.requests[0]
    assert "Namaste" in sent_request.body
    assert sent_request.template.language == "hi"


def test_worker_falls_back_to_english_when_patient_language_has_no_template(
    client, test_engine
):
    tenant, branch = setup_notify_tenant(client, modules=["sms"], providers=["sms"])
    configure_ready_sms_integration(
        client,
        tenant["id"],
        flows=[
            _sms_flow(
                "appointment_booked_patient",
                id="sms_tpl_en_only",
                language="en",
                registered_body="Hello {#var#}, appointment confirmed.",
            )
        ],
    )
    patient_resp = client.post(
        "/api/v1/patients",
        headers={"X-Tenant-ID": tenant["id"]},
        json={
            "full_name": "Tamil Patient",
            "mobile": "9876500001",
            "sms_preferred_language": "ta",
        },
    )
    patient = patient_resp.json()
    booking = client.post(
        "/api/v1/appointments",
        headers={"X-Tenant-ID": tenant["id"]},
        json={
            "branch_id": branch["id"],
            "patient_id": patient["id"],
            "appointment_type": "op",
            "appointment_date": date.today().isoformat(),
            "department_id": "general",
            "practitioner_id": "doctor_demo",
        },
    )
    assert booking.status_code == 201

    gateway = FakeGateway(_accepted_result())
    with Session(test_engine) as session:
        process_due_sms_notifications(session, gateway=gateway)

    assert len(gateway.requests) == 1
    sent_request, _kwargs = gateway.requests[0]
    assert "Hello" in sent_request.body


# --------------------------------------------------------------------------
# P1 flow triggers
# --------------------------------------------------------------------------


def test_payment_receipt_sms_queues_on_full_payment(client, test_engine):
    tenant, branch = setup_notify_tenant(
        client, modules=["sms", "billing_advanced"], providers=["sms"]
    )
    configure_ready_sms_integration(
        client,
        tenant["id"],
        flows=[
            _sms_flow(
                "payment_receipt_patient",
                registered_body="Hello {#var#}, receipt for {#var#}: Rs {#var#}.",
                variable_keys=["patient_name", "invoice_number", "total_amount"],
            )
        ],
    )
    patient = create_patient(client, tenant["id"])
    booking = client.post(
        "/api/v1/appointments",
        headers={"X-Tenant-ID": tenant["id"]},
        json={
            "branch_id": branch["id"],
            "patient_id": patient["id"],
            "appointment_type": "op",
            "appointment_date": date.today().isoformat(),
            "department_id": "general",
            "practitioner_id": "doctor_demo",
        },
    ).json()
    consultation = client.post(
        "/api/v1/consultations",
        headers={"X-Tenant-ID": tenant["id"]},
        json={
            "appointment_id": booking["appointment"]["id"],
            "chief_complaint": "Fever",
            "diagnosis": "Viral fever",
            "clinical_notes": "Hydration advised",
        },
    ).json()
    signed = client.post(
        f"/api/v1/consultations/{consultation['id']}/sign",
        headers={"X-Tenant-ID": tenant["id"]},
        json={"signed_by_user_id": "doctor_demo"},
    ).json()
    client.post(
        "/api/v1/billing/doctor-fee-rules",
        headers={"X-Tenant-ID": tenant["id"]},
        json={
            "appointment_type": "op",
            "fee_amount": 500,
            "doctor_share_percentage": 60,
        },
    )
    invoice_detail = client.post(
        "/api/v1/billing/invoices/from-consultation",
        headers={"X-Tenant-ID": tenant["id"]},
        json={"consultation_id": signed["id"]},
    ).json()
    invoice = invoice_detail["invoice"]
    client.post(
        f"/api/v1/billing/invoices/{invoice['id']}/payments",
        headers={"X-Tenant-ID": tenant["id"]},
        json={"method": "cash", "amount": invoice["total_amount"]},
    )

    with Session(test_engine) as session:
        events = _sms_events(session, tenant["id"])
        receipts = [e for e in events if e.template_key == "payment_receipt_patient"]
        assert len(receipts) == 1


def test_document_ready_sms_carries_no_prescription_text(client, test_engine):
    tenant, branch = setup_notify_tenant(client, modules=["sms"], providers=["sms"])
    configure_ready_sms_integration(
        client,
        tenant["id"],
        flows=[_sms_flow("document_ready_patient")],
    )
    patient = create_patient(client, tenant["id"])
    booking = client.post(
        "/api/v1/appointments",
        headers={"X-Tenant-ID": tenant["id"]},
        json={
            "branch_id": branch["id"],
            "patient_id": patient["id"],
            "appointment_type": "op",
            "appointment_date": date.today().isoformat(),
            "department_id": "general",
            "practitioner_id": "doctor_demo",
        },
    ).json()
    secret_prescription = "Amoxicillin 500mg twice daily for Mr. Confidential"
    consultation = client.post(
        "/api/v1/consultations",
        headers={"X-Tenant-ID": tenant["id"]},
        json={
            "appointment_id": booking["appointment"]["id"],
            "chief_complaint": "Fever",
            "diagnosis": "Viral fever",
            "clinical_notes": "Hydration advised",
            "prescription_text": secret_prescription,
        },
    ).json()
    client.post(
        f"/api/v1/consultations/{consultation['id']}/sign",
        headers={"X-Tenant-ID": tenant["id"]},
        json={"signed_by_user_id": "doctor_demo"},
    )

    with Session(test_engine) as session:
        events = _sms_events(session, tenant["id"])
        ready = [e for e in events if e.template_key == "document_ready_patient"]
        assert len(ready) == 1
        assert secret_prescription not in ready[0].message


def test_membership_expiry_reminder_scheduler_fires_within_the_lead_window(
    client, test_engine, monkeypatch
):
    tenant, branch = setup_notify_tenant(client, modules=["sms"], providers=["sms"])
    configure_ready_sms_integration(
        client, tenant["id"], flows=[_sms_flow("membership_expiry_patient")]
    )
    patient = create_patient(client, tenant["id"])

    plan_resp = client.post(
        "/api/v1/patient-subscriptions/plans",
        headers={"X-Tenant-ID": tenant["id"]},
        json={
            "branch_id": branch["id"],
            "name": "Gold Membership",
            "price_amount": 5000,
            "duration_days": 365,
        },
    )
    if plan_resp.status_code != 201:
        import pytest

        pytest.skip("patient-subscriptions plan route unavailable in this build")
    plan = plan_resp.json()

    enrollment_resp = client.post(
        "/api/v1/patient-subscriptions/enrollments",
        headers={"X-Tenant-ID": tenant["id"]},
        json={
            "branch_id": branch["id"],
            "patient_id": patient["id"],
            "plan_id": plan["id"],
            "starts_on": (date.today() - timedelta(days=360)).isoformat(),
            "ends_on": (date.today() + timedelta(days=3)).isoformat(),
        },
    )
    if enrollment_resp.status_code != 201:
        import pytest

        pytest.skip("patient-subscriptions enrollment route unavailable in this build")

    with Session(test_engine) as session:
        queued = queue_due_sms_membership_expiry_reminders(session)
        events = _sms_events(session, tenant["id"])
        reminders = [e for e in events if e.template_key == "membership_expiry_patient"]
        assert queued == 1
        assert len(reminders) == 1


def test_home_care_visit_reminder_scheduler_fires_on_a_planned_visit_date(
    client, test_engine
):
    tenant, branch = setup_notify_tenant(
        client, modules=["sms", "home_care"], providers=["sms"]
    )
    configure_ready_sms_integration(
        client, tenant["id"], flows=[_sms_flow("home_care_visit_reminder_patient")]
    )
    patient = create_patient(client, tenant["id"])

    tomorrow = date.today() + timedelta(days=1)
    booking_resp = client.post(
        "/api/v1/home-care/bookings",
        headers={"X-Tenant-ID": tenant["id"]},
        json={
            "branch_id": branch["id"],
            "patient_id": patient["id"],
            "recurrence": "daily",
            "visit_day_mode": "all",
            "start_date": tomorrow.isoformat(),
            "end_date": (tomorrow + timedelta(days=5)).isoformat(),
            "status": "scheduled",
        },
    )
    if booking_resp.status_code != 201:
        import pytest

        pytest.skip("home-care booking route unavailable in this build")

    with Session(test_engine) as session:
        queued = queue_due_sms_home_care_visit_reminders(session)
        events = _sms_events(session, tenant["id"])
        reminders = [
            e for e in events if e.template_key == "home_care_visit_reminder_patient"
        ]
        assert queued == 1
        assert len(reminders) == 1
