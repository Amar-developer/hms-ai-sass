from fastapi.testclient import TestClient


def create_tenant(client: TestClient, name: str = "Care Clinic") -> dict:
    response = client.post("/api/v1/tenants", json={"name": name})
    assert response.status_code == 201
    return response.json()


def create_patient(client: TestClient, tenant_id: str, **overrides) -> dict:
    payload = {
        "full_name": "Ravi Kumar",
        "mobile": "9876543210",
        "gender": "male",
        "age_years": 42,
        "guardian_name": "Lakshmi",
        "guardian_mobile": "9876500000",
        "area": "Adyar",
        "blood_group": "B+",
    }
    payload.update(overrides)
    response = client.post(
        "/api/v1/patients",
        headers={"X-Tenant-ID": tenant_id},
        json=payload,
    )
    assert response.status_code == 201
    return response.json()


def test_activity_feed_shows_creation_and_field_changes_with_actor_identity(
    client: TestClient,
):
    tenant = create_tenant(client)
    patient = create_patient(client, tenant["id"])

    update = client.patch(
        f"/api/v1/patients/{patient['id']}",
        headers={"X-Tenant-ID": tenant["id"]},
        json={"area": "Nungambakkam"},
    )
    assert update.status_code == 200

    feed = client.get(
        f"/api/v1/activity/patient/{patient['id']}",
        headers={"X-Tenant-ID": tenant["id"]},
    )
    assert feed.status_code == 200
    body = feed.json()

    created_events = [e for e in body["events"] if e["action"] == "patient.created"]
    assert len(created_events) == 1
    assert created_events[0]["actor_name"] == "Test Super Admin"
    assert created_events[0]["actor_email"] == "test.superadmin@medizinhub.local"

    updated_events = [e for e in body["events"] if e["action"] == "patient.updated"]
    assert len(updated_events) == 1
    import json

    changes = json.loads(updated_events[0]["metadata_json"])["changes"]
    area_change = next(c for c in changes if c["field"] == "area")
    assert area_change["old"] == "Adyar"
    assert area_change["new"] == "Nungambakkam"

    assert body["comments"] == []


def test_comment_can_be_posted_and_appears_with_author_identity(client: TestClient):
    tenant = create_tenant(client)
    patient = create_patient(client, tenant["id"])

    posted = client.post(
        f"/api/v1/activity/patient/{patient['id']}/comments",
        headers={"X-Tenant-ID": tenant["id"]},
        json={"body": "Called the patient to confirm the appointment."},
    )
    assert posted.status_code == 201
    assert posted.json()["author_name"] == "Test Super Admin"

    feed = client.get(
        f"/api/v1/activity/patient/{patient['id']}",
        headers={"X-Tenant-ID": tenant["id"]},
    )
    comments = feed.json()["comments"]
    assert len(comments) == 1
    assert comments[0]["body"] == "Called the patient to confirm the appointment."
    assert comments[0]["author_email"] == "test.superadmin@medizinhub.local"


def test_activity_feed_is_tenant_isolated(client: TestClient):
    tenant_a = create_tenant(client, "Clinic A")
    tenant_b = create_tenant(client, "Clinic B")
    patient = create_patient(client, tenant_a["id"])

    cross_tenant_feed = client.get(
        f"/api/v1/activity/patient/{patient['id']}",
        headers={"X-Tenant-ID": tenant_b["id"]},
    )
    assert cross_tenant_feed.status_code == 200
    assert cross_tenant_feed.json() == {"events": [], "comments": []}
