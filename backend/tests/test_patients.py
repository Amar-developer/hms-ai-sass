import json
from datetime import date, timedelta

from fastapi.testclient import TestClient
from sqlmodel import Session

from app.modules.patient_subscriptions.models import (
    PatientSubscriptionEnrollment,
    PatientSubscriptionPlan,
)
from app.modules.identity.models import User
from app.modules.patients.models import Patient
from app.modules.patients.repositories import PatientRepository
from app.modules.tenants.models import Branch, Tenant


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
        "patient. Use Secondary Mobile Number only when this is the patient's own "
        "secondary contact number."
    )
    assert shared_alternate.status_code == 201
    assert shared_alternate.json()["mobile"] is None
    assert shared_alternate.json()["alternate_mobile"] == first["mobile"]


def test_guardian_mobile_can_be_contact_path_without_blocking_later_primary(
    client: TestClient,
):
    tenant = create_tenant(client)
    child = create_patient(
        client,
        tenant["id"],
        full_name="Child Without Phone",
        mobile=None,
        alternate_mobile=None,
        guardian_name="Parent Patient",
        guardian_mobile="9000000044",
    )

    father = create_patient(
        client,
        tenant["id"],
        full_name="Parent Patient",
        mobile=child["guardian_mobile"],
        guardian_name=None,
        guardian_mobile=None,
    )

    assert child["mobile"] is None
    assert child["alternate_mobile"] is None
    assert child["guardian_mobile"] == "9000000044"
    assert father["mobile"] == "9000000044"


def test_patient_requires_primary_secondary_or_guardian_mobile(client: TestClient):
    tenant = create_tenant(client)

    response = client.post(
        "/api/v1/patients",
        headers={"X-Tenant-ID": tenant["id"]},
        json={
            "full_name": "No Contact Patient",
            "mobile": None,
            "alternate_mobile": None,
            "guardian_mobile": None,
        },
    )

    assert response.status_code == 422
    assert response.json()["detail"] == (
        "At least one contact number is required: primary mobile, secondary "
        "mobile, or guardian mobile."
    )


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
        "Primary mobile number and secondary mobile number must be different."
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


def test_patient_search_matches_name_mobile_secondary_and_area(client: TestClient):
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
    by_legacy_guardian = client.get(
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
    assert by_legacy_guardian.status_code == 200
    assert by_legacy_guardian.json() == []
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


def test_patient_page_applies_dynamic_filters_before_pagination(client: TestClient):
    tenant = create_tenant(client)
    create_patient(
        client,
        tenant["id"],
        full_name="Alpha Match",
        mobile="9000000011",
        area="Adyar",
    )
    create_patient(
        client,
        tenant["id"],
        full_name="Beta Match",
        mobile="9000000012",
        area="Adyar",
    )
    create_patient(
        client,
        tenant["id"],
        full_name="Outside Area",
        mobile="9000000013",
        area="Velachery",
    )
    filters = json.dumps([{"field": "area", "operator": "equals", "value": "Adyar"}])

    response = client.get(
        "/api/v1/patients/page",
        params={
            "active_only": "false",
            "limit": "1",
            "offset": "0",
            "filters": filters,
        },
        headers={"X-Tenant-ID": tenant["id"]},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 2
    assert len(body["items"]) == 1
    assert body["items"][0]["area"] == "Adyar"


def test_patient_page_applies_dynamic_sort_before_pagination(client: TestClient):
    tenant = create_tenant(client)
    create_patient(client, tenant["id"], full_name="Charlie", mobile="9000000021")
    create_patient(client, tenant["id"], full_name="Asha", mobile="9000000022")
    sort = json.dumps({"key": "full_name", "dir": "asc"})

    response = client.get(
        "/api/v1/patients/page",
        params={
            "active_only": "false",
            "limit": "1",
            "offset": "0",
            "sort": sort,
        },
        headers={"X-Tenant-ID": tenant["id"]},
    )

    assert response.status_code == 200
    assert response.json()["items"][0]["full_name"] == "Asha"


def test_patient_page_rejects_unsupported_dynamic_filter_field(
    client: TestClient,
):
    tenant = create_tenant(client)
    filters = json.dumps(
        [{"field": "password_hash", "operator": "like", "value": "secret"}]
    )

    response = client.get(
        "/api/v1/patients/page",
        params={"active_only": "false", "filters": filters},
        headers={"X-Tenant-ID": tenant["id"]},
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "Unsupported filter field: password_hash"


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


def test_patient_page_filters_by_subscription_plan_name(
    client: TestClient,
    test_engine,
):
    tenant = create_tenant(client)
    branch = client.post(
        f"/api/v1/tenants/{tenant['id']}/branches",
        headers={"X-Tenant-ID": tenant["id"]},
        json={"name": "Main Branch", "code": "MAIN"},
    ).json()
    gold_patient = create_patient(
        client,
        tenant["id"],
        branch_id=branch["id"],
        full_name="Gold Patient",
        mobile="9000000031",
    )
    create_patient(
        client,
        tenant["id"],
        branch_id=branch["id"],
        full_name="No Plan Patient",
        mobile="9000000032",
    )
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
                patient_id=gold_patient["id"],
                plan_id=plan.id,
                starts_on=date.today(),
                ends_on=date.today(),
            )
        )
        session.commit()
    filters = json.dumps(
        [
            {
                "field": "subscription_plan_name",
                "operator": "equals",
                "value": "Gold Care",
            }
        ]
    )

    response = client.get(
        "/api/v1/patients/page",
        params={"active_only": "false", "filters": filters},
        headers={"X-Tenant-ID": tenant["id"]},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 1
    assert body["items"][0]["full_name"] == "Gold Patient"


def test_patient_filter_options_are_data_backed_and_branch_scoped(test_engine):
    with Session(test_engine) as session:
        tenant = Tenant(name="Patient Options Clinic")
        session.add(tenant)
        session.commit()
        session.refresh(tenant)
        main_branch = Branch(tenant_id=tenant.id, name="Main Branch", code="MAIN")
        side_branch = Branch(tenant_id=tenant.id, name="Side Branch", code="SIDE")
        session.add(main_branch)
        session.add(side_branch)
        session.commit()
        session.refresh(main_branch)
        session.refresh(side_branch)
        creator = User(
            tenant_id=tenant.id,
            branch_id=main_branch.id,
            name="Reception User",
            email="reception@example.test",
        )
        session.add(creator)
        session.commit()
        session.refresh(creator)
        creator_id = creator.id
        main_patient = Patient(
            tenant_id=tenant.id,
            branch_id=main_branch.id,
            patient_number="PAT-OPT-1",
            full_name="Main Patient",
            mobile="9000000201",
            gender="female",
            created_by_user_id=creator_id,
        )
        side_patient = Patient(
            tenant_id=tenant.id,
            branch_id=side_branch.id,
            patient_number="PAT-OPT-2",
            full_name="Side Patient",
            mobile="9000000202",
            gender="male",
        )
        session.add(main_patient)
        session.add(side_patient)
        session.commit()
        session.refresh(main_patient)
        plan = PatientSubscriptionPlan(
            tenant_id=tenant.id,
            name="Gold Care",
            price_amount=500,
            duration_days=30,
        )
        session.add(plan)
        session.commit()
        session.refresh(plan)
        session.add(
            PatientSubscriptionEnrollment(
                tenant_id=tenant.id,
                branch_id=main_branch.id,
                patient_id=main_patient.id,
                plan_id=plan.id,
                starts_on=date.today(),
                ends_on=date.today(),
            )
        )
        session.commit()

        options = PatientRepository(session).filter_options(
            tenant_id=tenant.id,
            branch_id=main_branch.id,
        )

    assert [row.model_dump() for row in options["branch_id"]] == [
        {"value": main_branch.id, "label": "Main Branch"}
    ]
    assert [row.value for row in options["gender"]] == ["female"]
    assert [row.value for row in options["subscription_plan_name"]] == ["Gold Care"]
    assert [row.model_dump() for row in options["created_by_user_id"]] == [
        {"value": creator_id, "label": "Reception User"}
    ]


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


def test_patient_contact_uses_only_patient_owned_numbers_for_display():
    from types import SimpleNamespace

    from app.modules.patients.contact import (
        patient_contact_mobile,
        patient_contact_numbers,
        patient_whatsapp_numbers,
    )

    def patient(mobile="", alternate="", guardian=""):
        return SimpleNamespace(
            mobile=mobile,
            alternate_mobile=alternate,
            guardian_mobile=guardian,
        )

    assert patient_contact_mobile(patient(mobile="111")) == "111"
    # No primary: fall through to the secondary/alternate patient number.
    assert patient_contact_mobile(patient(alternate="222")) == "222"
    assert patient_contact_mobile(patient(alternate="222", guardian="333")) == "222"
    # Guardian is legacy-only and must not become the display/contact number.
    assert patient_contact_mobile(patient(guardian="333")) is None
    # Blank strings must not count as a usable number.
    assert patient_contact_mobile(patient(mobile="   ", alternate="222")) == "222"
    assert patient_contact_mobile(patient()) is None
    assert patient_contact_mobile(None) is None

    assert patient_contact_numbers(patient(mobile="111", alternate="222")) == [
        "111",
        "222",
    ]
    assert patient_contact_numbers(patient(mobile="111", alternate="111")) == ["111"]
    # WhatsApp still has a legacy guardian fallback after primary/secondary.
    assert patient_whatsapp_numbers(
        patient(mobile="111", alternate="222", guardian="333")
    ) == ["111", "222", "333"]


def test_whatsapp_destination_uses_one_number_per_patient():
    from types import SimpleNamespace

    from app.modules.integrations.whatsapp_consent import (
        patient_notification_destination,
    )

    def patient(mobile="", alternate="", guardian=""):
        return SimpleNamespace(
            mobile=mobile,
            alternate_mobile=alternate,
            guardian_mobile=guardian,
        )

    # Exactly one destination is returned even when several numbers exist,
    # so an invoice or reminder is delivered a single time.
    assert (
        patient_notification_destination(
            patient(mobile="9876500040", alternate="9876500041"), "+91"
        )
        == "+919876500040"
    )
    # Guardian is legacy fallback when it is the only number on file.
    assert (
        patient_notification_destination(patient(guardian="9876500042"), "+91")
        == "+919876500042"
    )
    # An unusable primary must not block a valid fallback.
    assert (
        patient_notification_destination(
            patient(mobile="abc", alternate="9876500043"), "+91"
        )
        == "+919876500043"
    )
    assert patient_notification_destination(patient(), "+91") is None
