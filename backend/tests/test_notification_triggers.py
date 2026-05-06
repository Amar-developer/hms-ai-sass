from datetime import date


def setup_notify_tenant(client, modules=None, providers=None):
    if modules is None:
        modules = ["whatsapp", "sms", "voice", "billing_advanced"]
    if providers is None:
        providers = ["whatsapp", "sms", "voice"]
    tenant = client.post("/api/v1/tenants", json={"name": "Trigger Clinic"}).json()
    branch = client.post(
        f"/api/v1/tenants/{tenant['id']}/branches",
        json={"name": "Main Branch", "code": "MAIN"},
    ).json()
    plan = client.post(
        "/api/v1/subscription-plans",
        json={
            "key": f"trigger_{'_'.join(modules)}",
            "name": "Trigger Plan",
            "monthly_patient_limit": 1000,
            "included_branches": 2,
            "included_doctors": 5,
            "price_inr_monthly": 2999,
            "enabled_modules": [
                "patients",
                "appointments",
                "queue",
                "consultations",
                "billing_basic",
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


def create_patient(client, tenant_id, name="Notify Patient"):
    response = client.post(
        "/api/v1/patients",
        headers={"X-Tenant-ID": tenant_id},
        json={"full_name": name, "mobile": "9876543210"},
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
            "practitioner_id": "doctor_demo",
        },
    )
    assert response.status_code == 201
    return response.json()


def test_appointment_booked_auto_queues_whatsapp_and_sms(client):
    tenant, branch = setup_notify_tenant(client, modules=["whatsapp", "sms"], providers=["whatsapp", "sms"])
    patient = create_patient(client, tenant["id"])

    booking = book_appointment(client, tenant["id"], branch["id"], patient["id"])
    notifications = client.get("/api/v1/notifications", headers={"X-Tenant-ID": tenant["id"]}).json()

    assert booking["queue_entry"]["token_number"] == "N-001"
    assert [event["event_type"] for event in notifications] == [
        "appointment_reminder",
        "appointment_reminder",
    ]
    assert {event["provider"] for event in notifications} == {"whatsapp", "sms"}


def test_appointment_trigger_skips_when_provider_not_configured(client):
    tenant, branch = setup_notify_tenant(client, modules=["whatsapp"], providers=[])
    patient = create_patient(client, tenant["id"])

    book_appointment(client, tenant["id"], branch["id"], patient["id"])
    notifications = client.get("/api/v1/notifications", headers={"X-Tenant-ID": tenant["id"]}).json()

    assert notifications == []


def test_token_called_auto_queues_voice_notification(client):
    tenant, branch = setup_notify_tenant(client, modules=["voice"], providers=["voice"])
    patient = create_patient(client, tenant["id"])
    booking = book_appointment(client, tenant["id"], branch["id"], patient["id"])

    call = client.post(
        f"/api/v1/queue/{booking['queue_entry']['id']}/call",
        headers={"X-Tenant-ID": tenant["id"]},
        json={"reason": "Call token"},
    )
    notifications = client.get("/api/v1/notifications", headers={"X-Tenant-ID": tenant["id"]}).json()

    assert call.status_code == 200
    assert len(notifications) == 1
    assert notifications[0]["provider"] == "voice"
    assert notifications[0]["event_type"] == "queue_token_call"
    assert notifications[0]["recipient"] == f"branch:{branch['id']}:speaker"


def test_invoice_generation_and_partial_payment_auto_queue_payment_pending(client):
    tenant, branch = setup_notify_tenant(
        client,
        modules=["whatsapp", "sms", "billing_advanced"],
        providers=["whatsapp", "sms"],
    )
    patient = create_patient(client, tenant["id"])
    booking = book_appointment(client, tenant["id"], branch["id"], patient["id"])
    consultation = client.post(
        "/api/v1/consultations",
        headers={"X-Tenant-ID": tenant["id"]},
        json={"appointment_id": booking["appointment"]["id"]},
    ).json()
    signed = client.post(
        f"/api/v1/consultations/{consultation['id']}/sign",
        headers={"X-Tenant-ID": tenant["id"]},
        json={"signed_by_user_id": "doctor_demo"},
    ).json()
    client.post(
        "/api/v1/billing/doctor-fee-rules",
        headers={"X-Tenant-ID": tenant["id"]},
        json={"appointment_type": "op", "fee_amount": 1000, "doctor_share_percentage": 60},
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
    notifications = client.get("/api/v1/notifications", headers={"X-Tenant-ID": tenant["id"]}).json()
    payment_events = [event for event in notifications if event["event_type"] == "payment_reminder"]

    assert len(payment_events) == 4
    assert {event["provider"] for event in payment_events} == {"whatsapp", "sms"}


def test_sign_consultation_auto_queues_follow_up_due_when_advice_present(client):
    tenant, branch = setup_notify_tenant(client, modules=["whatsapp"], providers=["whatsapp"])
    patient = create_patient(client, tenant["id"])
    booking = book_appointment(client, tenant["id"], branch["id"], patient["id"])
    consultation = client.post(
        "/api/v1/consultations",
        headers={"X-Tenant-ID": tenant["id"]},
        json={
            "appointment_id": booking["appointment"]["id"],
            "follow_up_advice": "Please come for follow-up after 7 days.",
        },
    ).json()

    client.post(
        f"/api/v1/consultations/{consultation['id']}/sign",
        headers={"X-Tenant-ID": tenant["id"]},
        json={"signed_by_user_id": "doctor_demo"},
    )
    notifications = client.get("/api/v1/notifications", headers={"X-Tenant-ID": tenant["id"]}).json()
    followups = [event for event in notifications if event["event_type"] == "follow_up_reminder"]

    assert len(followups) == 1
    assert followups[0]["provider"] == "whatsapp"
    assert followups[0]["message"] == "Please come for follow-up after 7 days."
