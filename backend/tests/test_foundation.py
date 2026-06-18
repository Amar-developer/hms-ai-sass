from fastapi.testclient import TestClient


def create_tenant(client: TestClient, name: str = "Sunrise Clinic") -> dict:
    response = client.post("/api/v1/tenants", json={"name": name})
    assert response.status_code == 201
    return response.json()


def test_create_tenant_also_writes_audit_event(client: TestClient):
    tenant = create_tenant(client)

    audit_response = client.get(
        "/api/v1/audit-events",
        headers={"X-Tenant-ID": tenant["id"]},
    )

    assert audit_response.status_code == 200
    events = audit_response.json()
    assert len(events) == 1
    assert events[0]["action"] == "tenant.created"
    assert events[0]["resource_id"] == tenant["id"]


def test_create_and_list_branch_with_tenant_scope(client: TestClient):
    tenant = create_tenant(client)

    create_response = client.post(
        f"/api/v1/tenants/{tenant['id']}/branches",
        json={"name": "Main Branch", "code": "MAIN", "city": "Chennai"},
    )
    assert create_response.status_code == 201

    list_response = client.get(
        f"/api/v1/tenants/{tenant['id']}/branches",
        headers={"X-Tenant-ID": tenant["id"]},
    )

    assert list_response.status_code == 200
    branches = list_response.json()
    assert len(branches) == 1
    assert branches[0]["tenant_id"] == tenant["id"]
    assert branches[0]["name"] == "Main Branch"


def test_cross_tenant_branch_access_is_blocked(client: TestClient):
    first = create_tenant(client, "First Clinic")
    second = create_tenant(client, "Second Clinic")

    response = client.get(
        f"/api/v1/tenants/{first['id']}/branches",
        headers={"X-Tenant-ID": second["id"]},
    )

    assert response.status_code == 403
    assert response.json()["detail"] == "Cross-tenant branch access is not allowed"


def test_branch_list_requires_tenant_header(client: TestClient):
    tenant = create_tenant(client)

    response = client.get(f"/api/v1/tenants/{tenant['id']}/branches")

    assert response.status_code == 400
    assert response.json()["detail"] == "X-Tenant-ID header is required"


def test_subscription_plan_creation_and_duplicate_key_guard(client: TestClient):
    payload = {
        "key": "custom_starter",
        "name": "Custom Starter Clinic",
        "monthly_patient_limit": 300,
        "included_branches": 1,
        "included_doctors": 1,
        "price_inr_monthly": 999,
    }

    first = client.post("/api/v1/subscription-plans", json=payload)
    duplicate = client.post("/api/v1/subscription-plans", json=payload)
    list_response = client.get("/api/v1/subscription-plans")

    assert first.status_code == 201
    assert duplicate.status_code == 409
    assert duplicate.json()["detail"] == "Subscription plan key already exists"
    assert list_response.status_code == 200
    created = next(
        plan for plan in list_response.json() if plan["key"] == "custom_starter"
    )
    assert created["monthly_patient_limit"] == 300


def test_audit_events_are_tenant_isolated(client: TestClient):
    first = create_tenant(client, "First Clinic")
    second = create_tenant(client, "Second Clinic")

    response = client.post(
        "/api/v1/audit-events",
        headers={"X-Tenant-ID": first["id"]},
        json={
            "action": "patient.record.viewed",
            "resource_type": "patient",
            "resource_id": "patient_demo",
            "purpose": "treatment",
        },
    )
    assert response.status_code == 201

    first_events = client.get(
        "/api/v1/audit-events", headers={"X-Tenant-ID": first["id"]}
    )
    second_events = client.get(
        "/api/v1/audit-events", headers={"X-Tenant-ID": second["id"]}
    )

    assert len(first_events.json()) == 2
    assert len(second_events.json()) == 1
    assert {event["tenant_id"] for event in first_events.json()} == {first["id"]}
    assert {event["tenant_id"] for event in second_events.json()} == {second["id"]}
