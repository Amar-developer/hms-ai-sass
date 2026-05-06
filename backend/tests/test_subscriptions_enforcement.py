from datetime import date, timedelta

from sqlmodel import select

from app.core.database import get_session
from app.api.v1.subscriptions import _plan_read
from app.modules.subscriptions.models import SubscriptionPlan, TenantSubscription


def create_tenant(client, name: str = "Trial Clinic"):
    response = client.post("/api/v1/tenants", json={"name": name})
    assert response.status_code == 201
    return response.json()


def create_patient(client, tenant_id: str, name: str):
    return client.post(
        "/api/v1/patients",
        headers={"X-Tenant-ID": tenant_id},
        json={"full_name": name},
    )


def test_default_plans_are_seeded(client):
    response = client.get("/api/v1/subscription-plans")

    assert response.status_code == 200
    keys = {plan["key"] for plan in response.json()}
    assert {"free_trial", "starter"}.issubset(keys)


def test_subscription_plan_read_tolerates_legacy_null_updated_at():
    plan = SubscriptionPlan.model_construct(
        id="plan_legacy",
        key="legacy",
        name="Legacy",
        monthly_patient_limit=10,
        included_branches=1,
        included_doctors=1,
        price_inr_monthly=0,
        enabled_modules_json="[]",
        is_active=True,
        created_at=None,
        updated_at=None,
    )

    read = _plan_read(plan)

    assert read.created_at is not None
    assert read.updated_at is not None


def test_new_tenant_gets_free_trial_subscription(client):
    tenant = create_tenant(client)

    subscription = client.get(
        "/api/v1/subscription-plans/tenant-subscriptions/active",
        headers={"X-Tenant-ID": tenant["id"]},
    )
    entitlements = client.get(
        "/api/v1/subscription-plans/entitlements",
        headers={"X-Tenant-ID": tenant["id"]},
    )

    assert subscription.status_code == 200
    assert subscription.json()["is_trial"] is True
    assert entitlements.status_code == 200
    assert entitlements.json()["plan_key"] == "free_trial"
    assert entitlements.json()["monthly_patient_limit"] == 50
    assert entitlements.json()["remaining_patient_count"] == 50


def test_free_trial_patient_limit_is_enforced(client):
    tenant = create_tenant(client)

    for index in range(50):
        response = create_patient(client, tenant["id"], f"Patient {index}")
        assert response.status_code == 201
    blocked = create_patient(client, tenant["id"], "Patient 51")
    entitlements = client.get(
        "/api/v1/subscription-plans/entitlements",
        headers={"X-Tenant-ID": tenant["id"]},
    )

    assert blocked.status_code == 402
    assert blocked.json()["detail"] == "Patient limit reached for plan Free Trial"
    assert entitlements.json()["current_patient_count"] == 50
    assert entitlements.json()["remaining_patient_count"] == 0


def test_upgrade_to_starter_allows_more_than_trial_limit(client):
    tenant = create_tenant(client)
    plans = client.get("/api/v1/subscription-plans").json()
    starter = next(plan for plan in plans if plan["key"] == "starter")

    upgrade = client.post(
        "/api/v1/subscription-plans/tenant-subscriptions",
        headers={"X-Tenant-ID": tenant["id"]},
        json={
            "plan_id": starter["id"],
            "starts_on": date.today().isoformat(),
            "ends_on": None,
            "is_trial": False,
        },
    )
    for index in range(55):
        response = create_patient(client, tenant["id"], f"Starter Patient {index}")
        assert response.status_code == 201
    entitlements = client.get(
        "/api/v1/subscription-plans/entitlements",
        headers={"X-Tenant-ID": tenant["id"]},
    )

    assert upgrade.status_code == 201
    assert entitlements.json()["plan_key"] == "starter"
    assert entitlements.json()["monthly_patient_limit"] == 300
    assert entitlements.json()["current_patient_count"] == 55
    assert entitlements.json()["remaining_patient_count"] == 245


def test_expired_trial_blocks_patient_creation(client):
    tenant = create_tenant(client)

    with next(client.app.dependency_overrides[get_session]()) as session:
        subscription = session.exec(
            select(TenantSubscription).where(TenantSubscription.tenant_id == tenant["id"])
        ).first()
        subscription.ends_on = date.today() - timedelta(days=1)
        session.add(subscription)
        session.commit()

    response = create_patient(client, tenant["id"], "Blocked Patient")

    assert response.status_code == 402
    assert response.json()["detail"] == "Subscription has expired"


def test_custom_small_plan_limit_is_enforced(client):
    tenant = create_tenant(client)
    plan_response = client.post(
        "/api/v1/subscription-plans",
        json={
            "key": "tiny_test",
            "name": "Tiny Test",
            "monthly_patient_limit": 2,
            "included_branches": 1,
            "included_doctors": 1,
            "price_inr_monthly": 1,
        },
    )
    plan = plan_response.json()
    client.post(
        "/api/v1/subscription-plans/tenant-subscriptions",
        headers={"X-Tenant-ID": tenant["id"]},
        json={
            "plan_id": plan["id"],
            "starts_on": date.today().isoformat(),
            "is_trial": False,
        },
    )

    assert create_patient(client, tenant["id"], "One").status_code == 201
    assert create_patient(client, tenant["id"], "Two").status_code == 201
    blocked = create_patient(client, tenant["id"], "Three")

    assert blocked.status_code == 402
    assert blocked.json()["detail"] == "Patient limit reached for plan Tiny Test"


def test_subscription_plan_can_be_edited_and_deactivated(client):
    plan = client.post(
        "/api/v1/subscription-plans",
        json={
            "key": "editable_growth",
            "name": "Editable Growth",
            "monthly_patient_limit": 500,
            "included_branches": 2,
            "included_doctors": 5,
            "price_inr_monthly": 2499,
            "enabled_modules": ["patients", "appointments"],
        },
    ).json()

    updated = client.patch(
        f"/api/v1/subscription-plans/{plan['id']}",
        json={"monthly_patient_limit": 750, "price_inr_monthly": 2999, "enabled_modules": ["patients", "appointments", "lab"]},
    )
    inactive = client.post(f"/api/v1/subscription-plans/{plan['id']}/status", json={"is_active": False})

    assert updated.status_code == 200
    assert updated.json()["monthly_patient_limit"] == 750
    assert "lab" in updated.json()["enabled_modules"]
    assert inactive.status_code == 200
    assert inactive.json()["is_active"] is False


def test_future_subscription_is_scheduled_then_auto_activates_when_due(client):
    tenant = create_tenant(client)
    starter = next(plan for plan in client.get("/api/v1/subscription-plans").json() if plan["key"] == "starter")

    scheduled = client.post(
        "/api/v1/subscription-plans/tenant-subscriptions",
        headers={"X-Tenant-ID": tenant["id"]},
        json={
            "plan_id": starter["id"],
            "starts_on": (date.today() + timedelta(days=1)).isoformat(),
            "billing_amount": 999,
        },
    )
    active_now = client.get(
        "/api/v1/subscription-plans/tenant-subscriptions/active",
        headers={"X-Tenant-ID": tenant["id"]},
    )

    assert scheduled.status_code == 201
    assert scheduled.json()["status"] == "scheduled"
    assert scheduled.json()["is_active"] is False
    assert active_now.json()["plan_id"] != starter["id"]

    with next(client.app.dependency_overrides[get_session]()) as session:
        subscription = session.get(TenantSubscription, scheduled.json()["id"])
        subscription.starts_on = date.today()
        session.add(subscription)
        session.commit()

    active_due = client.get(
        "/api/v1/subscription-plans/tenant-subscriptions/active",
        headers={"X-Tenant-ID": tenant["id"]},
    )

    assert active_due.status_code == 200
    assert active_due.json()["id"] == scheduled.json()["id"]
    assert active_due.json()["status"] == "active"


def test_additional_patient_credits_extend_limit_and_create_invoice(client):
    tenant = create_tenant(client)
    plan = client.post(
        "/api/v1/subscription-plans",
        json={
            "key": "tiny_credit_test",
            "name": "Tiny Credit Test",
            "monthly_patient_limit": 1,
            "price_inr_monthly": 100,
        },
    ).json()
    client.post(
        "/api/v1/subscription-plans/tenant-subscriptions",
        headers={"X-Tenant-ID": tenant["id"]},
        json={"plan_id": plan["id"], "starts_on": date.today().isoformat(), "billing_amount": 100},
    )
    assert create_patient(client, tenant["id"], "One").status_code == 201

    blocked = create_patient(client, tenant["id"], "Two")
    credit = client.post(
        "/api/v1/subscription-plans/credits",
        headers={"X-Tenant-ID": tenant["id"]},
        json={"credit_type": "patients", "quantity": 2, "amount": 50, "reason": "Top-up"},
    )
    allowed = create_patient(client, tenant["id"], "Two")
    usage = client.get("/api/v1/subscription-plans/usage", headers={"X-Tenant-ID": tenant["id"]})
    invoices = client.get("/api/v1/subscription-plans/invoices", headers={"X-Tenant-ID": tenant["id"]})

    assert blocked.status_code == 402
    assert credit.status_code == 201
    assert allowed.status_code == 201
    assert usage.json()["effective_patient_limit"] == 3
    assert any(invoice["credit_id"] == credit.json()["id"] for invoice in invoices.json())


def test_subscription_usage_announcements_and_revenue_summary(client):
    tenant = create_tenant(client)
    with next(client.app.dependency_overrides[get_session]()) as session:
        subscription = session.exec(
            select(TenantSubscription).where(TenantSubscription.tenant_id == tenant["id"], TenantSubscription.is_active == True)  # noqa: E712
        ).first()
        subscription.ends_on = date.today() + timedelta(days=2)
        session.add(subscription)
        session.commit()

    announcements = client.get("/api/v1/subscription-plans/announcements", headers={"X-Tenant-ID": tenant["id"]})
    revenue = client.get("/api/v1/subscription-plans/platform/revenue-summary")

    assert announcements.status_code == 200
    assert any("expires" in item["message"] for item in announcements.json())
    assert revenue.status_code == 200
    assert revenue.json()["total_active_subscriptions"] >= 1


def test_subscription_invoice_settlement_failure_revenue_report_and_exports(client):
    tenant = create_tenant(client)
    starter = next(plan for plan in client.get("/api/v1/subscription-plans").json() if plan["key"] == "starter")
    subscription = client.post(
        "/api/v1/subscription-plans/tenant-subscriptions",
        headers={"X-Tenant-ID": tenant["id"]},
        json={
            "plan_id": starter["id"],
            "starts_on": date.today().isoformat(),
            "billing_amount": 1200,
        },
    )
    invoices = client.get("/api/v1/subscription-plans/invoices", headers={"X-Tenant-ID": tenant["id"]}).json()
    invoice = next(row for row in invoices if row["subscription_id"] == subscription.json()["id"])

    failed = client.post(
        f"/api/v1/subscription-plans/invoices/{invoice['id']}/payment-failed",
        headers={"X-Tenant-ID": tenant["id"]},
        json={"failed_reason": "Gateway timeout", "gateway_transaction_id": "gw_001"},
    )
    settled = client.post(
        f"/api/v1/subscription-plans/invoices/{invoice['id']}/settle",
        headers={"X-Tenant-ID": tenant["id"]},
        json={"amount": 1200, "payment_method": "upi", "payment_reference": "UPI123", "gateway_transaction_id": "gw_002"},
    )
    report = client.get("/api/v1/subscription-plans/reports/revenue", headers={"X-Tenant-ID": tenant["id"]})
    csv_export = client.get("/api/v1/subscription-plans/reports/revenue?export=csv", headers={"X-Tenant-ID": tenant["id"]})
    pdf_export = client.get("/api/v1/subscription-plans/reports/revenue?export=pdf", headers={"X-Tenant-ID": tenant["id"]})

    assert failed.status_code == 200
    assert failed.json()["gateway_status"] == "failed"
    assert settled.status_code == 200
    assert settled.json()["status"] == "paid"
    assert settled.json()["balance_amount"] == 0
    assert report.status_code == 200
    assert report.json()["total_paid_amount"] >= 1200
    assert report.json()["mrr_by_plan"][0]["mrr"] >= 1200
    assert csv_export.status_code == 200
    assert "invoice_number" in csv_export.text
    assert pdf_export.status_code == 200
    assert pdf_export.headers["content-type"] == "application/pdf"
