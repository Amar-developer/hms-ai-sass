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


def test_tenant_onboarding_rejects_invalid_references_before_creating_tenant(client: TestClient):
    invalid_plan = client.post(
        "/api/v1/tenants/onboard",
        json={
            "tenant": {"name": "Invalid Plan Clinic", "email": "invalid-plan@test.local"},
            "branches": [{"name": "Main Branch", "code": "MAIN"}],
            "subscription_plan_id": "plan_missing",
            "admin_user": {
                "name": "Tenant Admin",
                "email": "admin@invalid-plan.test",
                "password": "TenantPass123",
            },
        },
    )

    assert invalid_plan.status_code == 400
    assert not any(tenant["name"] == "Invalid Plan Clinic" for tenant in client.get("/api/v1/tenants").json())

    duplicate_branches = client.post(
        "/api/v1/tenants/onboard",
        json={
            "tenant": {"name": "Duplicate Branch Clinic", "email": "duplicate-branch@test.local"},
            "branches": [
                {"name": "First Main Branch", "code": "MAIN"},
                {"name": "Second Main Branch", "code": "main"},
            ],
            "admin_user": {
                "name": "Tenant Admin",
                "email": "admin@duplicate-branch.test",
                "password": "TenantPass123",
            },
        },
    )

    assert duplicate_branches.status_code == 400
    assert not any(tenant["name"] == "Duplicate Branch Clinic" for tenant in client.get("/api/v1/tenants").json())


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
    assert body["paid_amount"] == 0
    invoices = client.get(
        f"/api/v1/billing/invoices?patient_id={patient['id']}",
        headers={"X-Tenant-ID": tenant["id"]},
    ).json()
    purchase_invoice = next(invoice for invoice in invoices if invoice["id"] == body["purchase_invoice_id"])
    assert purchase_invoice["total_amount"] == 500
    assert purchase_invoice["paid_amount"] == 0
    assert purchase_invoice["balance_amount"] == 500

    before_payment = client.post(
        "/api/v1/patient-subscriptions/benefits/preview",
        headers={"X-Tenant-ID": tenant["id"]},
        json={
            "patient_id": patient["id"],
            "branch_id": branch["id"],
            "service_type": "consultation",
            "subtotal_amount": 500,
        },
    ).json()
    assert before_payment["has_active_subscription"] is False

    paid = client.post(
        f"/api/v1/billing/invoices/{purchase_invoice['id']}/payments",
        headers={"X-Tenant-ID": tenant["id"]},
        json={"method": "cash", "amount": 500},
    )
    assert paid.status_code == 201
    assert paid.json()["invoice"]["paid_amount"] == 500
    assert paid.json()["invoice"]["balance_amount"] == 0

    synced = client.get(
        f"/api/v1/patient-subscriptions/enrollments?patient_id={patient['id']}",
        headers={"X-Tenant-ID": tenant["id"]},
    ).json()[0]
    assert synced["paid_amount"] == 500
    after_payment = client.post(
        "/api/v1/patient-subscriptions/benefits/preview",
        headers={"X-Tenant-ID": tenant["id"]},
        json={
            "patient_id": patient["id"],
            "branch_id": branch["id"],
            "service_type": "consultation",
            "subtotal_amount": 500,
        },
    ).json()
    assert after_payment["has_active_subscription"] is True

    paid_patient = client.post(
        "/api/v1/patients",
        headers={"X-Tenant-ID": tenant["id"]},
        json={"full_name": "Paid Membership Patient", "branch_id": branch["id"]},
    ).json()
    paid_enrollment = client.post(
        "/api/v1/patient-subscriptions/enrollments",
        headers={"X-Tenant-ID": tenant["id"]},
        json={
            "patient_id": paid_patient["id"],
            "plan_id": plan["id"],
            "branch_id": branch["id"],
            "starts_on": date.today().isoformat(),
            "paid_amount": 500,
            "payment_method": "cash",
        },
    )

    assert paid_enrollment.status_code == 201
    paid_body = paid_enrollment.json()
    assert paid_body["paid_amount"] == 500
    paid_invoices = client.get(
        f"/api/v1/billing/invoices?patient_id={paid_patient['id']}",
        headers={"X-Tenant-ID": tenant["id"]},
    ).json()
    paid_purchase_invoice = next(
        invoice for invoice in paid_invoices if invoice["id"] == paid_body["purchase_invoice_id"]
    )
    assert paid_purchase_invoice["total_amount"] == 500
    assert paid_purchase_invoice["paid_amount"] == 500
    assert paid_purchase_invoice["balance_amount"] == 0
