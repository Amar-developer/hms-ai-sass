"""Phase 4: P0 SMS workflows fire as approved templates, not free text.

Every trigger site that used to call `queue_notification_if_allowed` with raw
message strings now calls `queue_sms_template_if_allowed`, which only queues
once the tenant has a DLT-approved template for that flow. These tests prove
two things per site: the free-text path is gone, and the templated path fires
once the integration is actually ready.
"""

from datetime import date

from sqlmodel import Session, select

from app.modules.notifications.models import NotificationEvent, NotificationProvider


def setup_notify_tenant(client, modules=None, providers=None):
    if modules is None:
        modules = ["whatsapp", "sms", "voice"]
    if providers is None:
        providers = ["whatsapp", "sms", "voice"]
    tenant = client.post("/api/v1/tenants", json={"name": "SMS P0 Clinic"}).json()
    branch = client.post(
        f"/api/v1/tenants/{tenant['id']}/branches",
        json={"name": "Main Branch", "code": "MAIN"},
    ).json()
    plan = client.post(
        "/api/v1/subscription-plans",
        json={
            "key": f"sms_p0_{'_'.join(modules)}",
            "name": "SMS P0 Plan",
            "monthly_patient_limit": 1000,
            # SMS is fail-closed by plan entitlement (Phase 5): a plan with no
            # segment allowance blocks every send, same as WhatsApp's
            # monthly_whatsapp_message_limit. Trigger tests need real headroom.
            "monthly_sms_segment_limit": 100_000,
            "included_branches": 2,
            "included_doctors": 5,
            "price_inr_monthly": 2999,
            "enabled_modules": [
                "patients",
                "appointments",
                "queue",
                "consultations",
                "billing_basic",
                "billing_advanced",
                *modules,
            ],
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
    client.put(
        "/api/v1/settings",
        headers={"X-Tenant-ID": tenant["id"]},
        json={
            "scope": "tenant",
            "module": "communication",
            "key": "communication.providers_enabled",
            "value": providers,
        },
    )
    return tenant, branch


def create_patient(client, tenant_id, name="SMS Patient", mobile="9876543210"):
    response = client.post(
        "/api/v1/patients",
        headers={"X-Tenant-ID": tenant_id},
        json={"full_name": name, "mobile": mobile},
    )
    assert response.status_code == 201
    return response.json()


def book_appointment(client, tenant_id, branch_id, patient_id):
    response = client.post(
        "/api/v1/appointments",
        headers={"X-Tenant-ID": tenant_id},
        json={
            "branch_id": branch_id,
            "patient_id": patient_id,
            "appointment_type": "op",
            "appointment_date": date.today().isoformat(),
            "department_id": "general",
            "practitioner_id": "doctor_demo",
        },
    )
    assert response.status_code == 201
    return response.json()


def _sms_flow(flow_key: str, **overrides) -> dict:
    flow = {
        "flow_key": flow_key,
        "enabled": True,
        "classification": "service_implicit",
        "consent_basis": "patient_transaction",
        "dlt_template_id": "1707160000000001",
        "registered_body": "Hello {#var#}, your update is ready.",
        "variable_keys": ["patient_name"],
        "approved_by_provider": True,
    }
    flow.update(overrides)
    return flow


def configure_ready_sms_integration(client, tenant_id, *, flows: list[dict]):
    payload = {
        "provider": "smscountry",
        "enabled": True,
        "sms_country_api_mode": "rest",
        "api_url": "https://restapi.smscountry.com/v0.1/Accounts/{auth_key}/SMSes/",
        "api_key": "auth-key-1234",
        "api_token": "auth-token-5678",
        "account_confirmed": True,
        "dpa_confirmed": True,
        "pricing_confirmed": True,
        "delivery_receipts_confirmed": True,
        "callback_contract_confirmed": True,
        "static_ip_allowlisting_confirmed": True,
        "dlt_entity_id": "1101000012345678901",
        "default_sender_id": "MEDHUB",
        "throughput_limit_per_minute": 1200,
        "retention_days": 180,
        "patient_notifications_enabled": True,
        "flows": flows,
    }
    response = client.put(
        "/api/v1/communications/sms/settings",
        headers={"X-Tenant-ID": tenant_id},
        json=payload,
    )
    assert response.status_code == 200, response.text
    return response.json()


def _sms_events(session: Session, tenant_id: str) -> list[NotificationEvent]:
    return session.exec(
        select(NotificationEvent).where(
            NotificationEvent.tenant_id == tenant_id,
            NotificationEvent.provider == NotificationProvider.SMS,
        )
    ).all()


# --------------------------------------------------------------------------
# The free-text path is gone
# --------------------------------------------------------------------------


def test_appointment_booking_never_queues_free_text_sms(client, test_engine):
    """Without a configured SMS integration, no SMS is queued at all."""
    tenant, branch = setup_notify_tenant(client, modules=["sms"], providers=["sms"])
    patient = create_patient(client, tenant["id"])

    book_appointment(client, tenant["id"], branch["id"], patient["id"])

    with Session(test_engine) as session:
        assert _sms_events(session, tenant["id"]) == []


# --------------------------------------------------------------------------
# The templated path fires once the integration is DLT-ready
# --------------------------------------------------------------------------


def test_patient_registration_queues_the_requested_template(client, test_engine):
    tenant, _branch = setup_notify_tenant(client, modules=["sms"], providers=["sms"])
    configure_ready_sms_integration(
        client,
        tenant["id"],
        flows=[
            _sms_flow(
                "patient_registered_patient",
                registered_body=(
                    "Dear {#var#}, your patient registration at MedizinHub has "
                    "been successfully completed. Your Patient ID is {#var#}. "
                    "Thank you."
                ),
                variable_keys=["patient_name", "patient_number"],
            )
        ],
    )

    patient = create_patient(client, tenant["id"], name="Rahul")

    with Session(test_engine) as session:
        events = _sms_events(session, tenant["id"])
        assert len(events) == 1
        event = events[0]
        assert event.template_key == "patient_registered_patient"
        import json

        values = json.loads(event.message)
        assert values["patient_name"] == "Rahul"
        assert values["patient_number"] == patient["patient_number"]
        assert values["full_name"] == "Rahul"
        assert values["id"] == patient["id"]


def test_appointment_booked_queues_a_templated_sms(client, test_engine):
    tenant, branch = setup_notify_tenant(client, modules=["sms"], providers=["sms"])
    configure_ready_sms_integration(
        client,
        tenant["id"],
        flows=[
            _sms_flow(
                "appointment_booked_patient",
                registered_body="Hello {#var#}, your token is {#var#}.",
                variable_keys=["patient_name", "token_number"],
            )
        ],
    )
    patient = create_patient(client, tenant["id"])

    booking = book_appointment(client, tenant["id"], branch["id"], patient["id"])

    with Session(test_engine) as session:
        events = _sms_events(session, tenant["id"])
        assert len(events) == 1
        event = events[0]
        assert event.template_key == "appointment_booked_patient"
        assert event.status.value == "queued"
        assert "token" not in event.message.lower() or "{" in event.message
        # The row carries structured variables, never a pre-rendered sentence.
        import json

        values = json.loads(event.message)
        assert values["patient_name"] == patient["full_name"]
        assert values["token_number"] == booking["queue_entry"]["token_number"]
        assert values["doctor_name"]
        assert values["consultation_type"]
        assert values["appointment_date"].count("-") == 2
        assert values["appointment_time"]
        assert values["appointment_id"] == booking["appointment"]["appointment_number"]


# --------------------------------------------------------------------------
# Send-time revalidation: a change after enqueue is still honoured
# --------------------------------------------------------------------------


def test_opted_out_patient_never_gets_a_queued_sms(client, test_engine):
    tenant, branch = setup_notify_tenant(client, modules=["sms"], providers=["sms"])
    configure_ready_sms_integration(
        client,
        tenant["id"],
        flows=[
            _sms_flow(
                "appointment_booked_patient",
                classification="service_explicit",
                consent_basis="explicit_consent",
            )
        ],
    )
    patient = create_patient(client, tenant["id"])
    client.put(
        f"/api/v1/patients/{patient['id']}",
        headers={"X-Tenant-ID": tenant["id"]},
        json={"sms_consent_status": "opted_out"},
    )

    book_appointment(client, tenant["id"], branch["id"], patient["id"])

    with Session(test_engine) as session:
        assert _sms_events(session, tenant["id"]) == []
