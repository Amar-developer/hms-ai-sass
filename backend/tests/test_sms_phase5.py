"""Plan/credit enforcement, language selection, and cost reporting."""

from datetime import date

from sqlmodel import Session

from app.modules.notifications.sms_processor import process_due_sms_notifications
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
