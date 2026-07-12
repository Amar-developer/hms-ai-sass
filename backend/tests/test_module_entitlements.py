from datetime import date


def create_signed_consultation_on_trial(client):
    tenant = client.post(
        "/api/v1/tenants", json={"name": "Trial Billing Clinic"}
    ).json()
    branch = client.post(
        f"/api/v1/tenants/{tenant['id']}/branches",
        json={"name": "Main Branch", "code": "MAIN"},
    ).json()
    patient = client.post(
        "/api/v1/patients",
        headers={"X-Tenant-ID": tenant["id"]},
        json={"full_name": "Trial Patient"},
    ).json()
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
    return tenant, signed


def test_entitlements_include_enabled_modules_for_free_trial(client):
    tenant = client.post("/api/v1/tenants", json={"name": "Module Clinic"}).json()

    response = client.get(
        "/api/v1/subscription-plans/entitlements",
        headers={"X-Tenant-ID": tenant["id"]},
    )

    assert response.status_code == 200
    modules = set(response.json()["enabled_modules"])
    assert "patients" in modules
    assert "billing_basic" in modules
    assert "billing_advanced" not in modules
    assert "lab" not in modules
    assert "pharmacy" not in modules
    assert "whatsapp" not in modules
    assert "voice" not in modules
    assert "ai" not in modules
    assert "ip" not in modules


def test_free_trial_blocks_advanced_billing_invoice_generation(client):
    tenant, consultation = create_signed_consultation_on_trial(client)

    response = client.post(
        "/api/v1/billing/invoices/from-consultation",
        headers={"X-Tenant-ID": tenant["id"]},
        json={"consultation_id": consultation["id"]},
    )

    assert response.status_code == 403
    assert (
        response.json()["detail"]
        == "Module billing_advanced is not enabled for plan Free Trial"
    )


def test_starter_entitlements_enable_advanced_billing(client):
    tenant, consultation = create_signed_consultation_on_trial(client)
    starter = next(
        plan
        for plan in client.get("/api/v1/subscription-plans").json()
        if plan["key"] == "starter"
    )
    client.post(
        "/api/v1/subscription-plans/tenant-subscriptions",
        headers={"X-Tenant-ID": tenant["id"]},
        json={
            "plan_id": starter["id"],
            "starts_on": date.today().isoformat(),
            "is_trial": False,
        },
    )

    entitlements = client.get(
        "/api/v1/subscription-plans/entitlements",
        headers={"X-Tenant-ID": tenant["id"]},
    )
    invoice = client.post(
        "/api/v1/billing/invoices/from-consultation",
        headers={"X-Tenant-ID": tenant["id"]},
        json={"consultation_id": consultation["id"]},
    )

    assert "billing_advanced" in entitlements.json()["enabled_modules"]
    assert invoice.status_code == 201


def test_custom_plan_can_enable_growth_modules(client):
    tenant = client.post(
        "/api/v1/tenants", json={"name": "Growth Module Clinic"}
    ).json()
    plan = client.post(
        "/api/v1/subscription-plans",
        json={
            "key": "growth_modules",
            "name": "Growth Modules",
            "monthly_patient_limit": 1000,
            "included_branches": 2,
            "included_doctors": 5,
            "price_inr_monthly": 2499,
            "enabled_modules": [
                "patients",
                "appointments",
                "queue",
                "consultations",
                "billing_basic",
                "billing_advanced",
                "lab",
                "pharmacy",
                "whatsapp",
                "sms",
                "voice",
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

    entitlements = client.get(
        "/api/v1/subscription-plans/entitlements",
        headers={"X-Tenant-ID": tenant["id"]},
    )

    modules = set(entitlements.json()["enabled_modules"])
    assert {"lab", "pharmacy", "whatsapp", "sms", "voice", "billing_advanced"}.issubset(
        modules
    )
    assert "ai" not in modules
    assert "ip" not in modules
