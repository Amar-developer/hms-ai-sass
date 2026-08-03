from datetime import date, timedelta

from fastapi.testclient import TestClient
from sqlmodel import Session

from app.modules.patient_subscriptions.models import (
    PatientSubscriptionEnrollment,
    PatientSubscriptionPlan,
)


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


def test_create_patient_generates_patient_number_and_audit(client: TestClient):
    tenant = create_tenant(client)

    patient = create_patient(client, tenant["id"])
    audit = client.get(
        "/api/v1/audit-events", headers={"X-Tenant-ID": tenant["id"]}
    ).json()

    assert patient["tenant_id"] == tenant["id"]
    assert patient["patient_number"] == "PAT-000001"
    assert any(event["action"] == "patient.created" for event in audit)


def test_patient_count_supports_created_date_range(client: TestClient):
    tenant = create_tenant(client)
    create_patient(client, tenant["id"])
    today = date.today().isoformat()
    tomorrow = (date.today() + timedelta(days=1)).isoformat()

    today_count = client.get(
        f"/api/v1/patients/count?from_date={today}&to_date={today}",
        headers={"X-Tenant-ID": tenant["id"]},
    )
    future_count = client.get(
        f"/api/v1/patients/count?from_date={tomorrow}&to_date={tomorrow}",
        headers={"X-Tenant-ID": tenant["id"]},
    )

    assert today_count.status_code == 200
    assert today_count.json() == {"total": 1}
    assert future_count.status_code == 200
    assert future_count.json() == {"total": 0}


def test_create_patient_rejects_future_date_of_birth(client: TestClient):
    tenant = create_tenant(client)

    response = client.post(
        "/api/v1/patients",
        headers={"X-Tenant-ID": tenant["id"]},
        json={
            "full_name": "Future DOB Patient",
            "date_of_birth": (date.today() + timedelta(days=1)).isoformat(),
        },
    )

    assert response.status_code == 422
    assert "Date of birth cannot be in the future" in str(response.json())


def test_primary_mobile_is_unique_but_can_be_reused_as_alternate(
    client: TestClient,
):
    tenant = create_tenant(client)
    first = create_patient(client, tenant["id"], full_name="Family Member One")

    duplicate_primary = client.post(
        "/api/v1/patients",
        headers={"X-Tenant-ID": tenant["id"]},
        json={
            "full_name": "Family Member Two",
            "mobile": "98765 43210",
        },
    )
    shared_alternate = client.post(
        "/api/v1/patients",
        headers={"X-Tenant-ID": tenant["id"]},
        json={
            "full_name": "Family Member Two",
            "alternate_mobile": first["mobile"],
        },
    )

    assert duplicate_primary.status_code == 409
    assert duplicate_primary.json()["detail"] == (
        "Mobile number is already used as the primary mobile number for another "
        "patient. Use Alternate Phone Number for a shared family contact."
    )
    assert shared_alternate.status_code == 201
    assert shared_alternate.json()["mobile"] is None
    assert shared_alternate.json()["alternate_mobile"] == first["mobile"]


def test_patient_cannot_use_same_primary_and_alternate_number(client: TestClient):
    tenant = create_tenant(client)

    response = client.post(
        "/api/v1/patients",
        headers={"X-Tenant-ID": tenant["id"]},
        json={
            "full_name": "Same Contact Patient",
            "mobile": "90000-00001",
            "alternate_mobile": "9000000001",
        },
    )

    assert response.status_code == 422
    assert response.json()["detail"] == (
        "Primary mobile number and alternate phone number must be different."
    )


def test_patient_update_enforces_primary_mobile_rules(client: TestClient):
    tenant = create_tenant(client)
    first = create_patient(client, tenant["id"], full_name="First Patient")
    second = create_patient(
        client,
        tenant["id"],
        full_name="Second Patient",
        mobile="9000000002",
        alternate_mobile="9000000003",
    )

    duplicate_primary = client.patch(
        f"/api/v1/patients/{second['id']}",
        headers={"X-Tenant-ID": tenant["id"]},
        json={"mobile": first["mobile"]},
    )
    same_own_numbers = client.patch(
        f"/api/v1/patients/{second['id']}",
        headers={"X-Tenant-ID": tenant["id"]},
        json={"mobile": second["alternate_mobile"]},
    )
    unchanged_primary = client.patch(
        f"/api/v1/patients/{first['id']}",
        headers={"X-Tenant-ID": tenant["id"]},
        json={"full_name": "First Patient Updated"},
    )

    assert duplicate_primary.status_code == 409
    assert same_own_numbers.status_code == 422
    assert unchanged_primary.status_code == 200


def test_patient_search_matches_name_mobile_guardian_and_area(client: TestClient):
    tenant = create_tenant(client)
    create_patient(client, tenant["id"], full_name="Ravi Kumar", area="Adyar")
    create_patient(
        client,
        tenant["id"],
        full_name="Meena Sharma",
        mobile="9123456780",
        alternate_mobile="9111122222",
        guardian_name="Suresh",
        area="Velachery",
        address="Lake View Street",
    )

    by_area = client.get(
        "/api/v1/patients?q=adyar",
        headers={"X-Tenant-ID": tenant["id"]},
    )
    by_guardian = client.get(
        "/api/v1/patients?q=suresh",
        headers={"X-Tenant-ID": tenant["id"]},
    )
    by_alternate_mobile = client.get(
        "/api/v1/patients?q=11112222",
        headers={"X-Tenant-ID": tenant["id"]},
    )
    by_address = client.get(
        "/api/v1/patients?q=lake view",
        headers={"X-Tenant-ID": tenant["id"]},
    )

    assert by_area.status_code == 200
    assert [row["full_name"] for row in by_area.json()] == ["Ravi Kumar"]
    assert by_guardian.status_code == 200
    assert [row["full_name"] for row in by_guardian.json()] == ["Meena Sharma"]
    assert by_alternate_mobile.status_code == 200
    assert [row["full_name"] for row in by_alternate_mobile.json()] == ["Meena Sharma"]
    assert by_address.status_code == 200
    assert [row["full_name"] for row in by_address.json()] == ["Meena Sharma"]


def test_patient_search_is_tenant_isolated(client: TestClient):
    first = create_tenant(client, "First Clinic")
    second = create_tenant(client, "Second Clinic")
    create_patient(client, first["id"], full_name="Tenant One Patient")
    create_patient(client, second["id"], full_name="Tenant Two Patient")

    response = client.get(
        "/api/v1/patients?q=patient",
        headers={"X-Tenant-ID": first["id"]},
    )

    assert response.status_code == 200
    assert [row["full_name"] for row in response.json()] == ["Tenant One Patient"]


def test_patient_page_returns_database_total_and_applies_filters(client: TestClient):
    tenant = create_tenant(client)
    create_patient(
        client,
        tenant["id"],
        full_name="Active Female",
        gender="female",
        mobile="9000000001",
    )
    inactive = create_patient(
        client,
        tenant["id"],
        full_name="Inactive Female",
        gender="female",
        mobile="9000000002",
    )
    client.patch(
        f"/api/v1/patients/{inactive['id']}",
        headers={"X-Tenant-ID": tenant["id"]},
        json={"status": "inactive"},
    )
    create_patient(
        client,
        tenant["id"],
        full_name="Active Male",
        gender="male",
        mobile="9000000003",
    )

    first_page = client.get(
        "/api/v1/patients/page?active_only=false&limit=1&offset=0&gender=female",
        headers={"X-Tenant-ID": tenant["id"]},
    )
    inactive_page = client.get(
        "/api/v1/patients/page?status=inactive&limit=10",
        headers={"X-Tenant-ID": tenant["id"]},
    )

    assert first_page.status_code == 200
    assert first_page.json()["total"] == 2
    assert len(first_page.json()["items"]) == 1
    assert first_page.json()["limit"] == 1
    assert first_page.json()["offset"] == 0
    assert inactive_page.status_code == 200
    assert inactive_page.json()["total"] == 1
    assert inactive_page.json()["items"][0]["full_name"] == "Inactive Female"


def test_patient_search_includes_subscription_plan_name_and_status(
    client: TestClient,
    test_engine,
):
    tenant = create_tenant(client)
    branch = client.post(
        f"/api/v1/tenants/{tenant['id']}/branches",
        headers={"X-Tenant-ID": tenant["id"]},
        json={"name": "Main Branch", "code": "MAIN"},
    ).json()
    patient = create_patient(client, tenant["id"], branch_id=branch["id"])
    with Session(test_engine) as session:
        plan = PatientSubscriptionPlan(
            tenant_id=tenant["id"],
            name="Gold Care",
            price_amount=500,
            duration_days=30,
        )
        session.add(plan)
        session.commit()
        session.refresh(plan)
        session.add(
            PatientSubscriptionEnrollment(
                tenant_id=tenant["id"],
                branch_id=branch["id"],
                patient_id=patient["id"],
                plan_id=plan.id,
                starts_on=date.today(),
                ends_on=date.today(),
            )
        )
        session.commit()

    response = client.get(
        "/api/v1/patients",
        headers={"X-Tenant-ID": tenant["id"]},
    )

    assert response.status_code == 200
    row = response.json()[0]
    assert row["subscription_plan_name"] == "Gold Care"
    assert row["subscription_status"] == "active"


def test_patient_view_blocks_cross_tenant_access(client: TestClient):
    first = create_tenant(client, "First Clinic")
    second = create_tenant(client, "Second Clinic")
    patient = create_patient(client, first["id"])

    response = client.get(
        f"/api/v1/patients/{patient['id']}",
        headers={"X-Tenant-ID": second["id"]},
    )

    assert response.status_code == 404
    assert response.json()["detail"] == "Patient not found"


def test_patient_detail_preserves_all_edit_form_fields(client: TestClient):
    tenant = create_tenant(client)
    patient = create_patient(
        client,
        tenant["id"],
        date_of_birth="1991-04-09",
        email="ravi.patient@example.test",
        alternate_mobile="9000011111",
        address="12 Lake View Road",
    )

    search_row = client.get(
        "/api/v1/patients",
        headers={"X-Tenant-ID": tenant["id"]},
    ).json()[0]
    detail = client.get(
        f"/api/v1/patients/{patient['id']}",
        headers={"X-Tenant-ID": tenant["id"]},
    )

    assert "date_of_birth" not in search_row
    assert "email" not in search_row
    assert detail.status_code == 200
    assert detail.json()["date_of_birth"] == "1991-04-09"
    assert detail.json()["email"] == "ravi.patient@example.test"
    assert detail.json()["alternate_mobile"] == "9000011111"
    assert detail.json()["address"] == "12 Lake View Road"
    assert detail.json()["blood_group"] == "B+"


def test_update_and_delete_patient_management(client: TestClient):
    tenant = create_tenant(client)
    patient = create_patient(client, tenant["id"], full_name="Before Update")

    updated = client.patch(
        f"/api/v1/patients/{patient['id']}",
        headers={"X-Tenant-ID": tenant["id"]},
        json={
            "full_name": "After Update",
            "mobile": "9000000001",
            "area": "T Nagar",
            "status": "active",
        },
    )
    deleted = client.delete(
        f"/api/v1/patients/{patient['id']}",
        headers={"X-Tenant-ID": tenant["id"]},
    )
    fetched = client.get(
        f"/api/v1/patients/{patient['id']}",
        headers={"X-Tenant-ID": tenant["id"]},
    )
    audit = client.get(
        "/api/v1/audit-events", headers={"X-Tenant-ID": tenant["id"]}
    ).json()
    actions = [event["action"] for event in audit]

    assert updated.status_code == 200
    assert updated.json()["full_name"] == "After Update"
    assert updated.json()["mobile"] == "9000000001"
    assert deleted.status_code == 200
    assert deleted.json()["deleted"] is True
    assert fetched.json()["status"] == "inactive"
    assert "patient.updated" in actions
    assert "patient.deleted" in actions


def test_patient_alerts_and_summary_group_clinical_safety_data(client: TestClient):
    tenant = create_tenant(client)
    patient = create_patient(client, tenant["id"])

    allergy = client.post(
        f"/api/v1/patients/{patient['id']}/alerts",
        headers={"X-Tenant-ID": tenant["id"]},
        json={
            "alert_type": "allergy",
            "title": "Penicillin allergy",
            "severity": "critical",
            "description": "Avoid penicillin family medicines",
        },
    )
    chronic = client.post(
        f"/api/v1/patients/{patient['id']}/alerts",
        headers={"X-Tenant-ID": tenant["id"]},
        json={
            "alert_type": "chronic_condition",
            "title": "Diabetes",
            "severity": "high",
        },
    )
    summary = client.get(
        f"/api/v1/patients/{patient['id']}/summary",
        headers={"X-Tenant-ID": tenant["id"]},
    )

    assert allergy.status_code == 201
    assert chronic.status_code == 201
    assert summary.status_code == 200
    body = summary.json()
    assert body["patient"]["id"] == patient["id"]
    assert [item["title"] for item in body["allergies"]] == ["Penicillin allergy"]
    assert [item["title"] for item in body["critical_alerts"]] == ["Penicillin allergy"]
    assert [item["title"] for item in body["chronic_conditions"]] == ["Diabetes"]
    assert body["timeline"][0]["type"] == "registration"


def test_patient_view_and_summary_write_audit_events(client: TestClient):
    tenant = create_tenant(client)
    patient = create_patient(client, tenant["id"])

    client.get(
        f"/api/v1/patients/{patient['id']}", headers={"X-Tenant-ID": tenant["id"]}
    )
    client.get(
        f"/api/v1/patients/{patient['id']}/summary",
        headers={"X-Tenant-ID": tenant["id"]},
    )

    audit = client.get(
        "/api/v1/audit-events", headers={"X-Tenant-ID": tenant["id"]}
    ).json()
    actions = [event["action"] for event in audit]

    assert "patient.record.viewed" in actions
    assert "patient.summary.viewed" in actions
