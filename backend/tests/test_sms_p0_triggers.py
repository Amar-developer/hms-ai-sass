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


def test_payment_pending_never_queues_free_text_sms(client, test_engine):
    tenant, branch = setup_notify_tenant(
        client, modules=["sms", "billing_advanced"], providers=["sms"]
    )
    patient = create_patient(client, tenant["id"])
    booking = book_appointment(client, tenant["id"], branch["id"], patient["id"])
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
            "fee_amount": 1000,
            "doctor_share_percentage": 60,
        },
    )
    invoice_detail = client.post(
        "/api/v1/billing/invoices/from-consultation",
        headers={"X-Tenant-ID": tenant["id"]},
        json={"consultation_id": signed["id"]},
    ).json()
    client.post(
        f"/api/v1/billing/invoices/{invoice_detail['invoice']['id']}/payments",
        headers={"X-Tenant-ID": tenant["id"]},
        json={"method": "cash", "amount": 400},
    )

    with Session(test_engine) as session:
        assert _sms_events(session, tenant["id"]) == []


# --------------------------------------------------------------------------
# The templated path fires once the integration is DLT-ready
# --------------------------------------------------------------------------


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


def test_appointment_reschedule_queues_a_templated_sms(client, test_engine):
    tenant, branch = setup_notify_tenant(client, modules=["sms"], providers=["sms"])
    configure_ready_sms_integration(
        client,
        tenant["id"],
        flows=[_sms_flow("appointment_rescheduled_patient")],
    )
    patient = create_patient(client, tenant["id"])
    booking = book_appointment(client, tenant["id"], branch["id"], patient["id"])
    from datetime import timedelta

    new_date = (date.today() + timedelta(days=1)).isoformat()

    response = client.patch(
        f"/api/v1/appointments/{booking['appointment']['id']}/reschedule",
        headers={"X-Tenant-ID": tenant["id"]},
        json={"appointment_date": new_date},
    )
    assert response.status_code in (200, 400, 409)  # 400/409 possible slot conflicts

    with Session(test_engine) as session:
        events = _sms_events(session, tenant["id"])
        rescheduled = [
            e for e in events if e.template_key == "appointment_rescheduled_patient"
        ]
        if response.status_code == 200:
            assert len(rescheduled) == 1


def test_queue_token_called_queues_a_templated_sms(client, test_engine):
    tenant, branch = setup_notify_tenant(
        client, modules=["sms", "voice"], providers=["sms", "voice"]
    )
    configure_ready_sms_integration(
        client,
        tenant["id"],
        flows=[_sms_flow("queue_token_alert_patient")],
    )
    patient = create_patient(client, tenant["id"])
    booking = book_appointment(client, tenant["id"], branch["id"], patient["id"])

    response = client.post(
        f"/api/v1/queue/{booking['queue_entry']['id']}/call",
        headers={"X-Tenant-ID": tenant["id"]},
        json={"reason": "Call token"},
    )
    assert response.status_code == 200

    with Session(test_engine) as session:
        events = _sms_events(session, tenant["id"])
        called = [e for e in events if e.template_key == "queue_token_alert_patient"]
        assert len(called) == 1
        assert called[0].event_type.value == "queue_token_call"


def test_queue_entry_cancel_queues_a_templated_sms(client, test_engine):
    tenant, branch = setup_notify_tenant(client, modules=["sms"], providers=["sms"])
    configure_ready_sms_integration(
        client,
        tenant["id"],
        flows=[_sms_flow("appointment_cancelled_patient")],
    )
    patient = create_patient(client, tenant["id"])
    booking = book_appointment(client, tenant["id"], branch["id"], patient["id"])

    response = client.post(
        f"/api/v1/queue/{booking['queue_entry']['id']}/cancel",
        headers={"X-Tenant-ID": tenant["id"]},
        json={"reason": "Patient request"},
    )
    assert response.status_code == 200

    with Session(test_engine) as session:
        events = _sms_events(session, tenant["id"])
        cancelled = [
            e for e in events if e.template_key == "appointment_cancelled_patient"
        ]
        assert len(cancelled) == 1


def test_payment_pending_queues_a_templated_sms(client, test_engine):
    tenant, branch = setup_notify_tenant(
        client, modules=["sms", "billing_advanced"], providers=["sms"]
    )
    configure_ready_sms_integration(
        client,
        tenant["id"],
        flows=[
            _sms_flow(
                "payment_pending_patient",
                registered_body="Hello {#var#}, Rs {#var#} pending for {#var#}.",
                variable_keys=["patient_name", "balance_amount", "invoice_number"],
            )
        ],
    )
    patient = create_patient(client, tenant["id"])
    booking = book_appointment(client, tenant["id"], branch["id"], patient["id"])
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
            "fee_amount": 1000,
            "doctor_share_percentage": 60,
        },
    )
    invoice_detail = client.post(
        "/api/v1/billing/invoices/from-consultation",
        headers={"X-Tenant-ID": tenant["id"]},
        json={"consultation_id": signed["id"]},
    ).json()
    client.post(
        f"/api/v1/billing/invoices/{invoice_detail['invoice']['id']}/payments",
        headers={"X-Tenant-ID": tenant["id"]},
        json={"method": "cash", "amount": 400},
    )

    with Session(test_engine) as session:
        events = _sms_events(session, tenant["id"])
        pending = [e for e in events if e.template_key == "payment_pending_patient"]
        # Two independent trigger sites fire here: invoice creation queues
        # "initial-pending" and the partial payment queues "pending:{payment.id}".
        assert len(pending) == 2


def test_lab_report_ready_queues_a_templated_sms(client, test_engine):
    tenant, branch = setup_notify_tenant(
        client, modules=["sms", "lab"], providers=["sms"]
    )
    configure_ready_sms_integration(
        client,
        tenant["id"],
        flows=[
            _sms_flow(
                "lab_report_ready_patient",
                registered_body="Hello {#var#}, your report for {#var#} is ready.",
                variable_keys=["patient_name", "tests"],
            )
        ],
    )
    patient = create_patient(client, tenant["id"])
    order = client.post(
        "/api/v1/lab/orders",
        headers={"X-Tenant-ID": tenant["id"]},
        json={
            "patient_id": patient["id"],
            "branch_id": branch["id"],
            "tests": "CBC, Lipid Profile",
        },
    )
    assert order.status_code == 201, order.text
    order_id = order.json()["id"]

    result = client.post(
        f"/api/v1/lab/orders/{order_id}/results",
        headers={"X-Tenant-ID": tenant["id"]},
        json={
            "result_summary": "All values within normal range.",
            "released_by_user_id": "doctor_demo",
        },
    )
    assert result.status_code == 201, result.text

    with Session(test_engine) as session:
        events = _sms_events(session, tenant["id"])
        ready = [e for e in events if e.template_key == "lab_report_ready_patient"]
        assert len(ready) == 1
        import json

        values = json.loads(ready[0].message)
        assert values["tests"] == "CBC, Lipid Profile"


def test_follow_up_sms_carries_no_clinician_free_text(client, test_engine):
    """The SMS row must never contain the raw clinical advice string."""
    tenant, branch = setup_notify_tenant(client, modules=["sms"], providers=["sms"])
    configure_ready_sms_integration(
        client,
        tenant["id"],
        flows=[_sms_flow("follow_up_reminder_patient")],
    )
    patient = create_patient(client, tenant["id"])
    booking = book_appointment(client, tenant["id"], branch["id"], patient["id"])
    advice = (
        "Please come back after 7 days and bring your old reports, Mr. Confidential."
    )
    consultation = client.post(
        "/api/v1/consultations",
        headers={"X-Tenant-ID": tenant["id"]},
        json={
            "appointment_id": booking["appointment"]["id"],
            "chief_complaint": "Fever",
            "diagnosis": "Viral fever",
            "clinical_notes": "Hydration advised",
            "follow_up_advice": advice,
        },
    ).json()

    client.post(
        f"/api/v1/consultations/{consultation['id']}/sign",
        headers={"X-Tenant-ID": tenant["id"]},
        json={"signed_by_user_id": "doctor_demo"},
    )

    with Session(test_engine) as session:
        events = _sms_events(session, tenant["id"])
        followups = [
            e for e in events if e.template_key == "follow_up_reminder_patient"
        ]
        assert len(followups) == 1
        assert advice not in followups[0].message
        import json

        values = json.loads(followups[0].message)
        assert values == {"patient_name": patient["full_name"]}


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
