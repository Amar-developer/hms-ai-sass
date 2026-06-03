from datetime import date

from fastapi.testclient import TestClient


def test_super_admin_onboards_tenant_with_branch_subscription_and_admin(client: TestClient):
    starter = next(plan for plan in client.get("/api/v1/subscription-plans").json() if plan["key"] == "starter")

    response = client.post(
        "/api/v1/tenants/onboard",
        json={
            "tenant": {
                "name": "Fresh SaaS Clinic",
                "email": "owner@fresh.test",
                "tenant_type": "clinic",
                "status": "active",
            },
            "branches": [{"name": "Main Branch", "code": "MAIN", "city": "Chennai"}],
            "subscription_plan_id": starter["id"],
            "subscription_starts_on": date.today().isoformat(),
            "admin_user": {
                "name": "Fresh Tenant Admin",
                "email": "admin@fresh.test",
                "password": "TenantPass123",
            },
        },
    )

    assert response.status_code == 201
    body = response.json()
    tenant_id = body["tenant"]["id"]
    assert body["tenant"]["name"] == "Fresh SaaS Clinic"
    assert body["branches"][0]["tenant_id"] == tenant_id
    assert body["subscription_plan_id"] == starter["id"]
    assert body["admin_user_id"] is not None
    assert body["role_count"] == 1

    login = client.post(
        "/api/v1/auth/login",
        json={"email": "admin@fresh.test", "password": "TenantPass123", "tenant_id": tenant_id},
    )

    assert login.status_code == 200
    assert "tenant_admin" in login.json()["user"]["roles"]


def test_patient_membership_enrollment_resolves_missing_branch(client: TestClient):
    tenant = client.post("/api/v1/tenants", json={"name": "Membership Branch Fallback Clinic"}).json()
    starter = next(plan for plan in client.get("/api/v1/subscription-plans").json() if plan["key"] == "starter")
    client.post(
        "/api/v1/subscription-plans/tenant-subscriptions",
        headers={"X-Tenant-ID": tenant["id"]},
        json={"plan_id": starter["id"], "starts_on": date.today().isoformat(), "is_trial": False},
    )
    branch = client.post(
        f"/api/v1/tenants/{tenant['id']}/branches",
        headers={"X-Tenant-ID": tenant["id"]},
        json={"name": "Main Branch", "code": "MAIN"},
    ).json()
    patient = client.post(
        "/api/v1/patients",
        headers={"X-Tenant-ID": tenant["id"]},
        json={"full_name": "Membership Patient"},
    ).json()
    plan = client.post(
        "/api/v1/patient-subscriptions/plans",
        headers={"X-Tenant-ID": tenant["id"]},
        json={"name": "Family Membership", "price_amount": 500, "duration_days": 30},
    ).json()

    enrollment = client.post(
        "/api/v1/patient-subscriptions/enrollments",
        headers={"X-Tenant-ID": tenant["id"]},
        json={
            "patient_id": patient["id"],
            "plan_id": plan["id"],
            "starts_on": date.today().isoformat(),
        },
    )

    assert enrollment.status_code == 201
    body = enrollment.json()
    assert body["branch_id"] == branch["id"]
    assert body["purchase_invoice_id"] is not None
