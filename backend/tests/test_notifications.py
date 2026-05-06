from datetime import date


def create_tenant_and_branch(client):
    tenant = client.post("/api/v1/tenants", json={"name": "Notify Clinic"}).json()
    branch = client.post(
        f"/api/v1/tenants/{tenant['id']}/branches",
        json={"name": "Main Branch", "code": "MAIN"},
    ).json()
    return tenant, branch


def create_plan_with_modules(client, modules):
    response = client.post(
        "/api/v1/subscription-plans",
        json={
            "key": f"notify_{'_'.join(modules)}",
            "name": "Notify Plan",
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
    )
    assert response.status_code == 201
    return response.json()


def upgrade(client, tenant_id, plan_id):
    response = client.post(
        "/api/v1/subscription-plans/tenant-subscriptions",
        headers={"X-Tenant-ID": tenant_id},
        json={
            "plan_id": plan_id,
            "starts_on": date.today().isoformat(),
            "is_trial": False,
        },
    )
    assert response.status_code == 201


def enable_providers(client, tenant_id, providers, branch_id=None):
    response = client.put(
        "/api/v1/settings",
        headers={"X-Tenant-ID": tenant_id},
        json={
            "scope": "branch" if branch_id else "tenant",
            "scope_id": branch_id,
            "module": "communication",
            "key": "communication.providers_enabled",
            "value": providers,
        },
    )
    assert response.status_code == 200


def test_free_trial_blocks_whatsapp_notification_by_module_entitlement(client):
    tenant, branch = create_tenant_and_branch(client)
    enable_providers(client, tenant["id"], ["whatsapp"])

    response = client.post(
        "/api/v1/notifications",
        headers={"X-Tenant-ID": tenant["id"]},
        json={
            "branch_id": branch["id"],
            "provider": "whatsapp",
            "event_type": "appointment_reminder",
            "recipient": "919876543210",
            "message": "Appointment reminder",
        },
    )

    assert response.status_code == 403
    assert response.json()["detail"] == "Module whatsapp is not enabled for plan Free Trial"


def test_enabled_module_still_requires_provider_setting(client):
    tenant, branch = create_tenant_and_branch(client)
    plan = create_plan_with_modules(client, ["whatsapp"])
    upgrade(client, tenant["id"], plan["id"])

    response = client.post(
        "/api/v1/notifications",
        headers={"X-Tenant-ID": tenant["id"]},
        json={
            "branch_id": branch["id"],
            "provider": "whatsapp",
            "event_type": "appointment_reminder",
            "recipient": "919876543210",
            "message": "Appointment reminder",
        },
    )

    assert response.status_code == 403
    assert response.json()["detail"] == "Communication provider whatsapp is not enabled in settings"


def test_queue_whatsapp_notification_when_module_and_provider_enabled(client):
    tenant, branch = create_tenant_and_branch(client)
    plan = create_plan_with_modules(client, ["whatsapp"])
    upgrade(client, tenant["id"], plan["id"])
    enable_providers(client, tenant["id"], ["whatsapp"])

    response = client.post(
        "/api/v1/notifications",
        headers={"X-Tenant-ID": tenant["id"]},
        json={
            "branch_id": branch["id"],
            "provider": "whatsapp",
            "event_type": "appointment_reminder",
            "recipient": "919876543210",
            "message": "Your appointment is confirmed.",
            "resource_type": "appointment",
            "resource_id": "appt_demo",
            "queued_by_user_id": "reception_user",
        },
    )
    listed = client.get("/api/v1/notifications", headers={"X-Tenant-ID": tenant["id"]})
    audit = client.get("/api/v1/audit-events", headers={"X-Tenant-ID": tenant["id"]}).json()

    assert response.status_code == 201
    assert response.json()["status"] == "queued"
    assert response.json()["provider"] == "whatsapp"
    assert listed.status_code == 200
    assert len(listed.json()) == 1
    assert "notification.queued" in [event["action"] for event in audit]


def test_voice_token_call_requires_voice_module_and_provider(client):
    tenant, branch = create_tenant_and_branch(client)
    plan = create_plan_with_modules(client, ["voice"])
    upgrade(client, tenant["id"], plan["id"])
    enable_providers(client, tenant["id"], ["voice"], branch_id=branch["id"])

    response = client.post(
        "/api/v1/notifications",
        headers={"X-Tenant-ID": tenant["id"]},
        json={
            "branch_id": branch["id"],
            "provider": "voice",
            "event_type": "queue_token_call",
            "recipient": "clinic-speaker-main",
            "message": "Token N-001, please proceed to room one.",
            "resource_type": "queue_entry",
            "resource_id": "queue_demo",
        },
    )

    assert response.status_code == 201
    assert response.json()["event_type"] == "queue_token_call"
    assert response.json()["provider"] == "voice"


def test_sms_notification_supported_when_enabled(client):
    tenant, _branch = create_tenant_and_branch(client)
    plan = create_plan_with_modules(client, ["sms"])
    upgrade(client, tenant["id"], plan["id"])
    enable_providers(client, tenant["id"], ["sms"])

    response = client.post(
        "/api/v1/notifications",
        headers={"X-Tenant-ID": tenant["id"]},
        json={
            "provider": "sms",
            "event_type": "payment_reminder",
            "recipient": "9876543210",
            "message": "Payment reminder",
            "resource_type": "invoice",
            "resource_id": "invoice_demo",
        },
    )

    assert response.status_code == 201
    assert response.json()["provider"] == "sms"


def test_notification_access_is_tenant_isolated(client):
    tenant, _branch = create_tenant_and_branch(client)
    plan = create_plan_with_modules(client, ["sms"])
    upgrade(client, tenant["id"], plan["id"])
    enable_providers(client, tenant["id"], ["sms"])
    client.post(
        "/api/v1/notifications",
        headers={"X-Tenant-ID": tenant["id"]},
        json={
            "provider": "sms",
            "event_type": "patient_message",
            "recipient": "9876543210",
            "message": "Hello",
        },
    )
    other = client.post("/api/v1/tenants", json={"name": "Other Notify Clinic"}).json()

    response = client.get("/api/v1/notifications", headers={"X-Tenant-ID": other["id"]})

    assert response.status_code == 200
    assert response.json() == []
