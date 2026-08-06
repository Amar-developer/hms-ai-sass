from datetime import date


def test_practitioner_list_batches_branch_and_department_links(monkeypatch):
    from app.modules.practitioners.models import Practitioner
    from app.modules.practitioners.services import practitioner_service

    practitioners = [
        Practitioner(id="doctor_one", tenant_id="tenant_one", full_name="Dr. One"),
        Practitioner(id="doctor_two", tenant_id="tenant_one", full_name="Dr. Two"),
        Practitioner(id="doctor_three", tenant_id="tenant_one", full_name="Dr. Three"),
    ]
    calls = {"branches": 0, "departments": 0}

    class FakePractitionerRepository:
        def __init__(self, _session):
            pass

        def list_for_tenant(self, **_kwargs):
            return practitioners

    class FakeLinkRepository:
        def __init__(self, _session):
            pass

        def active_branch_ids_by_practitioner(self, **_kwargs):
            calls["branches"] += 1
            return {
                "doctor_one": ["branch_one"],
                "doctor_two": ["branch_one"],
                "doctor_three": ["branch_two"],
            }

        def active_department_ids_by_practitioner(self, **_kwargs):
            calls["departments"] += 1
            return {
                "doctor_one": ["general"],
                "doctor_two": ["general"],
                "doctor_three": ["ped"],
            }

    monkeypatch.setattr(
        practitioner_service, "PractitionerRepository", FakePractitionerRepository
    )
    monkeypatch.setattr(
        practitioner_service, "PractitionerLinkRepository", FakeLinkRepository
    )

    rows = practitioner_service.list_practitioners(
        object(),
        tenant_id="tenant_one",
        branch_id=None,
        department_id=None,
        doctor_practitioner_id=None,
    )

    assert len(rows) == 3
    assert calls == {"branches": 1, "departments": 1}
    assert rows[0].branch_ids == ["branch_one"]
    assert rows[2].department_ids == ["ped"]


def setup_tenant_branch_departments_patient(client):
    tenant = client.post("/api/v1/tenants", json={"name": "Practitioner Clinic"}).json()
    branch = client.post(
        f"/api/v1/tenants/{tenant['id']}/branches",
        json={"name": "Main Branch", "code": "MAIN"},
    ).json()
    other_branch = client.post(
        f"/api/v1/tenants/{tenant['id']}/branches",
        json={"name": "Second Branch", "code": "SECOND"},
    ).json()
    patient = client.post(
        "/api/v1/patients",
        headers={"X-Tenant-ID": tenant["id"]},
        json={"full_name": "Mapping Patient"},
    ).json()
    return tenant, branch, other_branch, patient


def enable_interval_slots(client, tenant_id: str, branch_id: str) -> None:
    client.put(
        "/api/v1/settings",
        headers={"X-Tenant-ID": tenant_id},
        json={
            "scope": "branch",
            "scope_id": branch_id,
            "module": "appointments",
            "key": "appointment.slot_intervals_enabled",
            "value": True,
        },
    )


def test_create_practitioner_with_multiple_departments_and_filter(client):
    tenant, branch, _other_branch, _patient = setup_tenant_branch_departments_patient(
        client
    )

    created = client.post(
        "/api/v1/practitioners",
        headers={"X-Tenant-ID": tenant["id"]},
        json={
            "full_name": "Dr. Multi Specialty",
            "primary_specialty": "General / Pediatrics / Diabetology",
            "branch_ids": [branch["id"]],
            "department_ids": ["general", "ped", "diab"],
        },
    )
    filtered = client.get(
        f"/api/v1/practitioners?branch_id={branch['id']}&department_id=ped",
        headers={"X-Tenant-ID": tenant["id"]},
    )

    assert created.status_code == 201
    assert set(created.json()["department_ids"]) == {"general", "ped", "diab"}
    assert created.json()["branch_ids"] == [branch["id"]]
    assert filtered.status_code == 200
    assert [row["id"] for row in filtered.json()] == [created.json()["id"]]


def test_appointment_create_permission_can_read_doctors_and_calendar(client):
    tenant, branch, _other_branch, _patient = setup_tenant_branch_departments_patient(
        client
    )
    practitioner = client.post(
        "/api/v1/practitioners",
        headers={"X-Tenant-ID": tenant["id"]},
        json={
            "full_name": "Dr. Appointment Visible",
            "branch_ids": [branch["id"]],
            "department_ids": ["general"],
        },
    ).json()
    client.post(
        f"/api/v1/practitioners/{practitioner['id']}/schedules",
        headers={"X-Tenant-ID": tenant["id"]},
        json={
            "branch_id": branch["id"],
            "department_id": "general",
            "mode": "custom",
            "weekdays": [date(2026, 5, 4).weekday()],
            "start_time": "09:00:00",
            "end_time": "10:00:00",
            "slot_minutes": 15,
        },
    )
    role = client.post(
        "/api/v1/identity/roles",
        headers={"X-Tenant-ID": tenant["id"]},
        json={
            "name": "Appointment Creator",
            "key": "appointment_creator",
            "permission_keys": ["appointments.create"],
        },
    ).json()
    user = client.post(
        "/api/v1/identity/users",
        headers={"X-Tenant-ID": tenant["id"]},
        json={
            "name": "Staff Nurse Booking",
            "email": "staff.nurse.booking@test.local",
            "password": "NurseBook123",
            "user_type": "nurse",
            "role_keys": [role["key"]],
        },
    ).json()
    login = client.post(
        "/api/v1/auth/login",
        json={
            "email": user["email"],
            "password": "NurseBook123",
            "tenant_id": tenant["id"],
        },
    )
    headers = {
        "Authorization": f"Bearer {login.cookies['access_token']}",
        "X-Tenant-ID": tenant["id"],
    }

    doctors = client.get(
        f"/api/v1/practitioners?branch_id={branch['id']}&department_id=general",
        headers=headers,
    )
    calendar = client.get(
        f"/api/v1/practitioners/{practitioner['id']}/calendar"
        f"?branch_id={branch['id']}&department_id=general&start_date=2026-05-04&end_date=2026-05-04",
        headers=headers,
    )

    assert doctors.status_code == 200
    assert [row["id"] for row in doctors.json()] == [practitioner["id"]]
    assert calendar.status_code == 200
    assert calendar.json()["days"][0]["slots"]


def test_appointment_creator_can_read_doctor_when_department_code_is_sent(client):
    tenant, branch, _other_branch, _patient = setup_tenant_branch_departments_patient(
        client
    )
    department = client.post(
        f"/api/v1/tenants/{tenant['id']}/departments",
        headers={"X-Tenant-ID": tenant["id"]},
        json={"name": "General Medicine", "code": "GENERAL", "branch_id": branch["id"]},
    ).json()
    practitioner = client.post(
        "/api/v1/practitioners",
        headers={"X-Tenant-ID": tenant["id"]},
        json={
            "full_name": "Dr. Department Code",
            "branch_ids": [branch["id"]],
            "department_ids": [department["id"]],
        },
    ).json()
    client.post(
        f"/api/v1/practitioners/{practitioner['id']}/schedules",
        headers={"X-Tenant-ID": tenant["id"]},
        json={
            "branch_id": branch["id"],
            "department_id": department["id"],
            "mode": "custom",
            "weekdays": [date(2026, 5, 4).weekday()],
            "start_time": "09:00:00",
            "end_time": "10:00:00",
            "slot_minutes": 15,
        },
    )
    role = client.post(
        "/api/v1/identity/roles",
        headers={"X-Tenant-ID": tenant["id"]},
        json={
            "name": "Staff Nurse Code Booking",
            "key": "staff_nurse_code_booking",
            "permission_keys": ["appointments.create"],
        },
    ).json()
    user = client.post(
        "/api/v1/identity/users",
        headers={"X-Tenant-ID": tenant["id"]},
        json={
            "name": "Staff Nurse Code",
            "email": "staff.nurse.code@test.local",
            "password": "NurseCode123",
            "user_type": "nurse",
            "role_keys": [role["key"]],
        },
    ).json()
    login = client.post(
        "/api/v1/auth/login",
        json={
            "email": user["email"],
            "password": "NurseCode123",
            "tenant_id": tenant["id"],
        },
    )
    headers = {
        "Authorization": f"Bearer {login.cookies['access_token']}",
        "X-Tenant-ID": tenant["id"],
    }

    doctors = client.get(
        f"/api/v1/practitioners?branch_id={branch['id']}&department_id=GENERAL",
        headers=headers,
    )
    calendar = client.get(
        f"/api/v1/practitioners/{practitioner['id']}/calendar"
        f"?branch_id={branch['id']}&department_id=GENERAL&start_date=2026-05-04&end_date=2026-05-04",
        headers=headers,
    )

    assert doctors.status_code == 200
    assert [row["id"] for row in doctors.json()] == [practitioner["id"]]
    assert calendar.status_code == 200
    assert calendar.json()["department_id"] == department["id"]
    assert calendar.json()["days"][0]["slots"]


def test_appointment_create_permission_can_read_tenant_reference_data_for_booking(
    client,
):
    tenant, branch, _other_branch, _patient = setup_tenant_branch_departments_patient(
        client
    )
    for name, code in [
        ("General Medicine", "general"),
        ("Pediatrics", "ped"),
        ("Diabetology", "diab"),
    ]:
        client.post(
            f"/api/v1/tenants/{tenant['id']}/departments",
            headers={"X-Tenant-ID": tenant["id"]},
            json={"name": name, "code": code, "branch_id": branch["id"]},
        )
    role = client.post(
        "/api/v1/identity/roles",
        headers={"X-Tenant-ID": tenant["id"]},
        json={
            "name": "Staff Nurse Booking References",
            "key": "staff_nurse_booking_refs",
            "permission_keys": ["appointments.create"],
        },
    ).json()
    user = client.post(
        "/api/v1/identity/users",
        headers={"X-Tenant-ID": tenant["id"]},
        json={
            "name": "Staff Nurse References",
            "email": "staff.nurse.references@test.local",
            "password": "NurseRefs123",
            "user_type": "nurse",
            "role_keys": [role["key"]],
        },
    ).json()
    login = client.post(
        "/api/v1/auth/login",
        json={
            "email": user["email"],
            "password": "NurseRefs123",
            "tenant_id": tenant["id"],
        },
    )
    headers = {
        "Authorization": f"Bearer {login.cookies['access_token']}",
        "X-Tenant-ID": tenant["id"],
    }

    branches = client.get(f"/api/v1/tenants/{tenant['id']}/branches", headers=headers)
    departments = client.get(
        f"/api/v1/tenants/{tenant['id']}/departments", headers=headers
    )
    cross_tenant = client.get("/api/v1/tenants/other-tenant/branches", headers=headers)

    assert branches.status_code == 200
    assert branch["id"] in [row["id"] for row in branches.json()]
    assert departments.status_code == 200
    assert {"general", "ped", "diab"}.issubset(
        {row["code"] for row in departments.json()}
    )
    assert cross_tenant.status_code == 403


def test_scheduling_crud_permissions_can_manage_doctor_time_slots(client):
    tenant, branch, _other_branch, _patient = setup_tenant_branch_departments_patient(
        client
    )
    practitioner = client.post(
        "/api/v1/practitioners",
        headers={"X-Tenant-ID": tenant["id"]},
        json={
            "full_name": "Dr. Schedule Permission",
            "branch_ids": [branch["id"]],
            "department_ids": ["general"],
        },
    ).json()
    role = client.post(
        "/api/v1/identity/roles",
        headers={"X-Tenant-ID": tenant["id"]},
        json={
            "name": "Schedule Manager",
            "key": "schedule_manager",
            "permission_keys": [
                "scheduling.create",
                "scheduling.read",
                "scheduling.edit",
                "scheduling.delete",
            ],
        },
    ).json()
    user = client.post(
        "/api/v1/identity/users",
        headers={"X-Tenant-ID": tenant["id"]},
        json={
            "name": "Schedule Staff",
            "email": "schedule.staff@test.local",
            "password": "Schedule123",
            "user_type": "staff",
            "role_keys": [role["key"]],
        },
    ).json()
    login = client.post(
        "/api/v1/auth/login",
        json={
            "email": user["email"],
            "password": "Schedule123",
            "tenant_id": tenant["id"],
        },
    )
    headers = {
        "Authorization": f"Bearer {login.cookies['access_token']}",
        "X-Tenant-ID": tenant["id"],
    }

    doctors = client.get("/api/v1/practitioners", headers=headers)
    created = client.post(
        f"/api/v1/practitioners/{practitioner['id']}/schedules",
        headers=headers,
        json={
            "branch_id": branch["id"],
            "department_id": "general",
            "mode": "custom",
            "weekdays": [1],
            "start_time": "09:00:00",
            "end_time": "11:00:00",
            "slot_minutes": 10,
        },
    )
    listed = client.get("/api/v1/practitioners/schedules", headers=headers)
    updated = client.patch(
        f"/api/v1/practitioners/schedules/{created.json()['id']}",
        headers=headers,
        json={
            "branch_id": branch["id"],
            "department_id": "general",
            "mode": "custom",
            "weekdays": [1],
            "start_time": "10:00:00",
            "end_time": "12:00:00",
            "slot_minutes": 15,
        },
    )
    deleted = client.delete(
        f"/api/v1/practitioners/schedules/{created.json()['id']}", headers=headers
    )

    assert doctors.status_code == 200
    assert doctors.json()[0]["id"] == practitioner["id"]
    assert created.status_code == 201
    assert listed.status_code == 200
    assert listed.json()[0]["id"] == created.json()["id"]
    assert updated.status_code == 200
    assert str(updated.json()["start_time"]).startswith("10:00")
    assert deleted.status_code == 200


def test_scheduling_read_permission_cannot_create_doctor_time_slots(client):
    tenant, branch, _other_branch, _patient = setup_tenant_branch_departments_patient(
        client
    )
    practitioner = client.post(
        "/api/v1/practitioners",
        headers={"X-Tenant-ID": tenant["id"]},
        json={
            "full_name": "Dr. Schedule Reader",
            "branch_ids": [branch["id"]],
            "department_ids": ["general"],
        },
    ).json()
    role = client.post(
        "/api/v1/identity/roles",
        headers={"X-Tenant-ID": tenant["id"]},
        json={
            "name": "Schedule Reader",
            "key": "schedule_reader",
            "permission_keys": ["scheduling.read"],
        },
    ).json()
    user = client.post(
        "/api/v1/identity/users",
        headers={"X-Tenant-ID": tenant["id"]},
        json={
            "name": "Schedule Read Only",
            "email": "schedule.readonly@test.local",
            "password": "Schedule123",
            "user_type": "staff",
            "role_keys": [role["key"]],
        },
    ).json()
    login = client.post(
        "/api/v1/auth/login",
        json={
            "email": user["email"],
            "password": "Schedule123",
            "tenant_id": tenant["id"],
        },
    )
    headers = {
        "Authorization": f"Bearer {login.cookies['access_token']}",
        "X-Tenant-ID": tenant["id"],
    }

    listed_doctors = client.get("/api/v1/practitioners", headers=headers)
    listed_schedules = client.get("/api/v1/practitioners/schedules", headers=headers)
    created = client.post(
        f"/api/v1/practitioners/{practitioner['id']}/schedules",
        headers=headers,
        json={
            "branch_id": branch["id"],
            "department_id": "general",
            "mode": "custom",
            "weekdays": [1],
            "start_time": "09:00:00",
            "end_time": "11:00:00",
            "slot_minutes": 10,
        },
    )

    assert listed_doctors.status_code == 200
    assert listed_schedules.status_code == 200
    assert created.status_code == 403


def test_update_and_delete_practitioner_management(client):
    tenant, branch, other_branch, _patient = setup_tenant_branch_departments_patient(
        client
    )
    practitioner = client.post(
        "/api/v1/practitioners",
        headers={"X-Tenant-ID": tenant["id"]},
        json={
            "full_name": "Dr. Editable",
            "branch_ids": [branch["id"]],
            "department_ids": ["general"],
        },
    ).json()

    updated = client.patch(
        f"/api/v1/practitioners/{practitioner['id']}",
        headers={"X-Tenant-ID": tenant["id"]},
        json={
            "full_name": "Dr. Editable Updated",
            "primary_specialty": "Pediatrics",
            "branch_ids": [other_branch["id"]],
            "department_ids": ["ped"],
            "status": "active",
        },
    )
    deleted = client.delete(
        f"/api/v1/practitioners/{practitioner['id']}",
        headers={"X-Tenant-ID": tenant["id"]},
    )
    fetched = client.get(
        f"/api/v1/practitioners/{practitioner['id']}",
        headers={"X-Tenant-ID": tenant["id"]},
    )

    assert updated.status_code == 200
    assert updated.json()["full_name"] == "Dr. Editable Updated"
    assert updated.json()["branch_ids"] == [other_branch["id"]]
    assert updated.json()["department_ids"] == ["ped"]
    assert deleted.status_code == 200
    assert deleted.json()["deleted"] is True
    assert fetched.json()["status"] == "inactive"


def test_schedule_management_list_update_and_delete(client):
    tenant, branch, other_branch, _patient = setup_tenant_branch_departments_patient(
        client
    )
    practitioner = client.post(
        "/api/v1/practitioners",
        headers={"X-Tenant-ID": tenant["id"]},
        json={
            "full_name": "Dr. Schedule Manager",
            "branch_ids": [branch["id"], other_branch["id"]],
            "department_ids": ["general"],
        },
    ).json()
    schedule = client.post(
        f"/api/v1/practitioners/{practitioner['id']}/schedules",
        headers={"X-Tenant-ID": tenant["id"]},
        json={
            "branch_id": branch["id"],
            "department_id": "general",
            "mode": "custom",
            "weekdays": [1],
            "start_time": "09:00:00",
            "end_time": "12:00:00",
            "slot_minutes": 15,
        },
    ).json()

    listed = client.get(
        "/api/v1/practitioners/schedules", headers={"X-Tenant-ID": tenant["id"]}
    )
    updated = client.patch(
        f"/api/v1/practitioners/schedules/{schedule['id']}",
        headers={"X-Tenant-ID": tenant["id"]},
        json={
            "branch_id": other_branch["id"],
            "mode": "custom",
            "weekdays": [2],
            "start_time": "10:00:00",
            "end_time": "13:00:00",
            "slot_minutes": 20,
        },
    )
    deleted = client.delete(
        f"/api/v1/practitioners/schedules/{schedule['id']}",
        headers={"X-Tenant-ID": tenant["id"]},
    )
    inactive_list = client.get(
        "/api/v1/practitioners/schedules?is_active=false",
        headers={"X-Tenant-ID": tenant["id"]},
    )

    assert listed.status_code == 200
    assert [row["id"] for row in listed.json()] == [schedule["id"]]
    assert updated.status_code == 200
    assert updated.json()["branch_id"] == other_branch["id"]
    assert updated.json()["weekdays"] == [2]
    assert updated.json()["slot_minutes"] == 20
    assert deleted.status_code == 200
    assert inactive_list.status_code == 200
    assert inactive_list.json()[0]["is_active"] is False


def test_schedule_rejects_department_not_mapped_to_practitioner(client):
    tenant, branch, _other_branch, _patient = setup_tenant_branch_departments_patient(
        client
    )
    practitioner = client.post(
        "/api/v1/practitioners",
        headers={"X-Tenant-ID": tenant["id"]},
        json={
            "full_name": "Dr. General Only",
            "branch_ids": [branch["id"]],
            "department_ids": ["general"],
        },
    ).json()

    response = client.post(
        f"/api/v1/practitioners/{practitioner['id']}/schedules",
        headers={"X-Tenant-ID": tenant["id"]},
        json={
            "branch_id": branch["id"],
            "department_id": "orthopaedics",
            "mode": "custom",
            "weekdays": [1],
            "start_time": "09:00:00",
            "end_time": "12:00:00",
            "slot_minutes": 15,
        },
    )

    assert response.status_code == 400
    assert (
        response.json()["detail"]
        == "Practitioner is not assigned to this branch and department"
    )


def test_schedule_allows_same_timing_as_separate_department_records(client):
    tenant, branch, _other_branch, _patient = setup_tenant_branch_departments_patient(
        client
    )
    practitioner = client.post(
        "/api/v1/practitioners",
        headers={"X-Tenant-ID": tenant["id"]},
        json={
            "full_name": "Dr. Shared Timing",
            "branch_ids": [branch["id"]],
            "department_ids": ["general", "ped"],
        },
    ).json()
    payload = {
        "branch_id": branch["id"],
        "mode": "custom",
        "weekdays": [1],
        "start_time": "09:00:00",
        "end_time": "13:00:00",
        "slot_minutes": 15,
    }

    general = client.post(
        f"/api/v1/practitioners/{practitioner['id']}/schedules",
        headers={"X-Tenant-ID": tenant["id"]},
        json={**payload, "department_id": "general"},
    )
    pediatrics = client.post(
        f"/api/v1/practitioners/{practitioner['id']}/schedules",
        headers={"X-Tenant-ID": tenant["id"]},
        json={**payload, "department_id": "ped"},
    )
    schedules = client.get(
        f"/api/v1/practitioners/schedules?practitioner_id={practitioner['id']}",
        headers={"X-Tenant-ID": tenant["id"]},
    )

    assert general.status_code == 201
    assert pediatrics.status_code == 201
    assert {row["department_id"] for row in schedules.json()} == {"general", "ped"}
    assert len({row["id"] for row in schedules.json()}) == 2


def test_appointment_rejects_practitioner_not_assigned_to_department(client):
    tenant, branch, _other_branch, patient = setup_tenant_branch_departments_patient(
        client
    )
    practitioner = client.post(
        "/api/v1/practitioners",
        headers={"X-Tenant-ID": tenant["id"]},
        json={
            "full_name": "Dr. General Only",
            "branch_ids": [branch["id"]],
            "department_ids": ["general"],
        },
    ).json()

    response = client.post(
        "/api/v1/appointments",
        headers={"X-Tenant-ID": tenant["id"]},
        json={
            "branch_id": branch["id"],
            "patient_id": patient["id"],
            "department_id": "ped",
            "practitioner_id": practitioner["id"],
            "appointment_type": "op",
            "appointment_date": date.today().isoformat(),
        },
    )

    assert response.status_code == 400
    assert (
        response.json()["detail"]
        == "Practitioner is not assigned to this branch and department"
    )


def test_appointment_accepts_practitioner_assigned_to_branch_and_department(client):
    tenant, branch, _other_branch, patient = setup_tenant_branch_departments_patient(
        client
    )
    practitioner = client.post(
        "/api/v1/practitioners",
        headers={"X-Tenant-ID": tenant["id"]},
        json={
            "full_name": "Dr. Pediatrics",
            "branch_ids": [branch["id"]],
            "department_ids": ["general", "ped"],
        },
    ).json()
    client.post(
        f"/api/v1/practitioners/{practitioner['id']}/schedules",
        headers={"X-Tenant-ID": tenant["id"]},
        json={
            "branch_id": branch["id"],
            "department_id": "ped",
            "mode": "custom",
            "weekdays": [date.today().weekday()],
            "start_time": "09:00:00",
            "end_time": "12:00:00",
            "slot_minutes": 15,
        },
    )

    response = client.post(
        "/api/v1/appointments",
        headers={"X-Tenant-ID": tenant["id"]},
        json={
            "branch_id": branch["id"],
            "patient_id": patient["id"],
            "department_id": "ped",
            "practitioner_id": practitioner["id"],
            "appointment_type": "op",
            "appointment_date": date.today().isoformat(),
        },
    )

    assert response.status_code == 201
    assert response.json()["appointment"]["practitioner_id"] == practitioner["id"]
    assert response.json()["appointment"]["department_id"] == "ped"


def test_date_only_appointment_requires_practitioner_scheduled_weekday(client):
    tenant, branch, _other_branch, patient = setup_tenant_branch_departments_patient(
        client
    )
    practitioner = client.post(
        "/api/v1/practitioners",
        headers={"X-Tenant-ID": tenant["id"]},
        json={
            "full_name": "Dr. Date Guard",
            "branch_ids": [branch["id"]],
            "department_ids": ["general"],
        },
    ).json()
    client.post(
        f"/api/v1/practitioners/{practitioner['id']}/schedules",
        headers={"X-Tenant-ID": tenant["id"]},
        json={
            "branch_id": branch["id"],
            "department_id": "general",
            "mode": "custom",
            "weekdays": [1],
            "start_time": "09:00:00",
            "end_time": "12:00:00",
            "slot_minutes": 15,
        },
    )

    response = client.post(
        "/api/v1/appointments",
        headers={"X-Tenant-ID": tenant["id"]},
        json={
            "branch_id": branch["id"],
            "patient_id": patient["id"],
            "department_id": "general",
            "practitioner_id": practitioner["id"],
            "appointment_type": "op",
            "appointment_date": "2026-05-21",
        },
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "Practitioner is not scheduled on this date"


def test_backend_auto_assigns_next_available_exact_slots(client):
    tenant, branch, _other_branch, patient = setup_tenant_branch_departments_patient(
        client
    )
    second_patient = client.post(
        "/api/v1/patients",
        headers={"X-Tenant-ID": tenant["id"]},
        json={
            "branch_id": branch["id"],
            "full_name": "Early Token Patient",
            "mobile": "9000000022",
        },
    ).json()
    practitioner = client.post(
        "/api/v1/practitioners",
        headers={"X-Tenant-ID": tenant["id"]},
        json={
            "full_name": "Dr. Session Token",
            "branch_ids": [branch["id"]],
            "department_ids": ["general"],
        },
    ).json()
    client.post(
        f"/api/v1/practitioners/{practitioner['id']}/schedules",
        headers={"X-Tenant-ID": tenant["id"]},
        json={
            "branch_id": branch["id"],
            "department_id": "general",
            "mode": "custom",
            "weekdays": [1],
            "start_time": "10:00:00",
            "end_time": "13:00:00",
            "slot_minutes": 15,
        },
    )

    first = client.post(
        "/api/v1/appointments",
        headers={"X-Tenant-ID": tenant["id"]},
        json={
            "branch_id": branch["id"],
            "patient_id": patient["id"],
            "department_id": "general",
            "practitioner_id": practitioner["id"],
            "appointment_type": "op",
            "appointment_date": "2026-05-19",
        },
    )
    second = client.post(
        "/api/v1/appointments",
        headers={"X-Tenant-ID": tenant["id"]},
        json={
            "branch_id": branch["id"],
            "patient_id": second_patient["id"],
            "department_id": "general",
            "practitioner_id": practitioner["id"],
            "appointment_type": "op",
            "appointment_date": "2026-05-19",
        },
    )

    assert first.status_code == 201
    assert second.status_code == 201
    assert first.json()["appointment"]["appointment_time"] == "10:00:00"
    assert second.json()["appointment"]["appointment_time"] == "10:15:00"
    assert first.json()["queue_entry"]["token_number"] == "N-001"
    assert second.json()["queue_entry"]["token_number"] == "N-002"


def test_timed_appointment_requires_active_practitioner_schedule(client):
    tenant, branch, _other_branch, patient = setup_tenant_branch_departments_patient(
        client
    )
    enable_interval_slots(client, tenant["id"], branch["id"])
    practitioner = client.post(
        "/api/v1/practitioners",
        headers={"X-Tenant-ID": tenant["id"]},
        json={
            "full_name": "Dr. Schedule Required",
            "branch_ids": [branch["id"]],
            "department_ids": ["general"],
        },
    ).json()

    response = client.post(
        "/api/v1/appointments",
        headers={"X-Tenant-ID": tenant["id"]},
        json={
            "branch_id": branch["id"],
            "patient_id": patient["id"],
            "department_id": "general",
            "practitioner_id": practitioner["id"],
            "appointment_type": "op",
            "appointment_date": "2026-05-04",
            "appointment_time": "09:00:00",
        },
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "Practitioner is not scheduled at this time"


def test_schedule_availability_allows_booking_and_prevents_double_booking(client):
    tenant, branch, _other_branch, patient = setup_tenant_branch_departments_patient(
        client
    )
    practitioner = client.post(
        "/api/v1/practitioners",
        headers={"X-Tenant-ID": tenant["id"]},
        json={
            "full_name": "Dr. Available",
            "branch_ids": [branch["id"]],
            "department_ids": ["general"],
        },
    ).json()
    schedule = client.post(
        f"/api/v1/practitioners/{practitioner['id']}/schedules",
        headers={"X-Tenant-ID": tenant["id"]},
        json={
            "branch_id": branch["id"],
            "department_id": "general",
            "mode": "custom",
            "weekdays": [0],
            "start_time": "09:00:00",
            "end_time": "12:00:00",
            "slot_minutes": 15,
        },
    )
    availability = client.get(
        f"/api/v1/practitioners/{practitioner['id']}/availability",
        headers={"X-Tenant-ID": tenant["id"]},
        params={
            "branch_id": branch["id"],
            "department_id": "general",
            "appointment_date": "2026-05-04",
            "appointment_time": "09:15:00",
        },
    )
    booked = client.post(
        "/api/v1/appointments",
        headers={"X-Tenant-ID": tenant["id"]},
        json={
            "branch_id": branch["id"],
            "patient_id": patient["id"],
            "department_id": "general",
            "practitioner_id": practitioner["id"],
            "appointment_type": "op",
            "appointment_date": "2026-05-04",
            "appointment_time": "09:15:00",
        },
    )
    duplicate = client.post(
        "/api/v1/appointments",
        headers={"X-Tenant-ID": tenant["id"]},
        json={
            "branch_id": branch["id"],
            "patient_id": patient["id"],
            "department_id": "general",
            "practitioner_id": practitioner["id"],
            "appointment_type": "op",
            "appointment_date": "2026-05-04",
            "appointment_time": "09:15:00",
        },
    )

    assert schedule.status_code == 201
    assert availability.status_code == 200
    assert availability.json()["available"] is True
    assert availability.json()["schedule_id"] == schedule.json()["id"]
    # Room tracking on the schedule was dropped (no business requirement);
    # only an explicit PractitionerRoomAssignment resolves a room now.
    assert availability.json()["room_name"] is None
    assert booked.status_code == 201
    assert duplicate.status_code == 409
    assert (
        duplicate.json()["detail"]
        == "Patient already has an active appointment at this time"
    )


def test_same_patient_cannot_book_same_doctor_twice_in_same_timing_session(client):
    tenant, branch, _other_branch, patient = setup_tenant_branch_departments_patient(
        client
    )
    practitioner = client.post(
        "/api/v1/practitioners",
        headers={"X-Tenant-ID": tenant["id"]},
        json={
            "full_name": "Dr. Session Guard",
            "branch_ids": [branch["id"]],
            "department_ids": ["general"],
        },
    ).json()
    for start_time, end_time in [("09:00:00", "12:00:00"), ("18:00:00", "21:00:00")]:
        client.post(
            f"/api/v1/practitioners/{practitioner['id']}/schedules",
            headers={"X-Tenant-ID": tenant["id"]},
            json={
                "branch_id": branch["id"],
                "department_id": "general",
                "mode": "custom",
                "weekdays": [0],
                "start_time": start_time,
                "end_time": end_time,
                "slot_minutes": 15,
            },
        )
    first = client.post(
        "/api/v1/appointments",
        headers={"X-Tenant-ID": tenant["id"]},
        json={
            "branch_id": branch["id"],
            "patient_id": patient["id"],
            "department_id": "general",
            "practitioner_id": practitioner["id"],
            "appointment_type": "op",
            "appointment_date": "2026-05-04",
            "appointment_time": "09:15:00",
        },
    )
    same_session = client.post(
        "/api/v1/appointments",
        headers={"X-Tenant-ID": tenant["id"]},
        json={
            "branch_id": branch["id"],
            "patient_id": patient["id"],
            "department_id": "general",
            "practitioner_id": practitioner["id"],
            "appointment_type": "op",
            "appointment_date": "2026-05-04",
            "appointment_time": "09:30:00",
        },
    )
    evening_session = client.post(
        "/api/v1/appointments",
        headers={"X-Tenant-ID": tenant["id"]},
        json={
            "branch_id": branch["id"],
            "patient_id": patient["id"],
            "department_id": "general",
            "practitioner_id": practitioner["id"],
            "appointment_type": "op",
            "appointment_date": "2026-05-04",
            "appointment_time": "18:00:00",
        },
    )

    assert first.status_code == 201
    assert same_session.status_code == 409
    assert (
        same_session.json()["detail"]
        == "Patient already has an active appointment with this doctor in the selected timing session"
    )
    assert evening_session.status_code == 201


def test_same_patient_cannot_book_two_doctors_at_same_exact_time(client):
    tenant, branch, _other_branch, patient = setup_tenant_branch_departments_patient(
        client
    )
    doctors = []
    for name in ["Dr. First Time", "Dr. Second Time"]:
        doctor = client.post(
            "/api/v1/practitioners",
            headers={"X-Tenant-ID": tenant["id"]},
            json={
                "full_name": name,
                "branch_ids": [branch["id"]],
                "department_ids": ["general"],
            },
        ).json()
        doctors.append(doctor)
        client.post(
            f"/api/v1/practitioners/{doctor['id']}/schedules",
            headers={"X-Tenant-ID": tenant["id"]},
            json={
                "branch_id": branch["id"],
                "department_id": "general",
                "mode": "custom",
                "weekdays": [0],
                "start_time": "09:00:00",
                "end_time": "12:00:00",
                "slot_minutes": 15,
            },
        )
    first = client.post(
        "/api/v1/appointments",
        headers={"X-Tenant-ID": tenant["id"]},
        json={
            "branch_id": branch["id"],
            "patient_id": patient["id"],
            "department_id": "general",
            "practitioner_id": doctors[0]["id"],
            "appointment_type": "op",
            "appointment_date": "2026-05-04",
            "appointment_time": "09:15:00",
        },
    )
    second = client.post(
        "/api/v1/appointments",
        headers={"X-Tenant-ID": tenant["id"]},
        json={
            "branch_id": branch["id"],
            "patient_id": patient["id"],
            "department_id": "general",
            "practitioner_id": doctors[1]["id"],
            "appointment_type": "op",
            "appointment_date": "2026-05-04",
            "appointment_time": "09:15:00",
        },
    )

    assert first.status_code == 201
    assert second.status_code == 409
    assert (
        second.json()["detail"]
        == "Patient already has an active appointment at this time"
    )


def test_same_doctor_cannot_book_two_patients_across_departments_at_same_time(client):
    tenant, branch, _other_branch, first_patient = (
        setup_tenant_branch_departments_patient(client)
    )
    second_patient = client.post(
        "/api/v1/patients",
        headers={"X-Tenant-ID": tenant["id"]},
        json={"full_name": "Second Department Patient"},
    ).json()
    practitioner = client.post(
        "/api/v1/practitioners",
        headers={"X-Tenant-ID": tenant["id"]},
        json={
            "full_name": "Dr. Cross Department",
            "branch_ids": [branch["id"]],
            "department_ids": ["general", "ped"],
        },
    ).json()
    for department_id in ("general", "ped"):
        schedule = client.post(
            f"/api/v1/practitioners/{practitioner['id']}/schedules",
            headers={"X-Tenant-ID": tenant["id"]},
            json={
                "branch_id": branch["id"],
                "department_id": department_id,
                "mode": "custom",
                "weekdays": [0],
                "start_time": "09:00:00",
                "end_time": "12:00:00",
                "slot_minutes": 15,
            },
        )
        assert schedule.status_code == 201

    first = client.post(
        "/api/v1/appointments",
        headers={"X-Tenant-ID": tenant["id"]},
        json={
            "branch_id": branch["id"],
            "patient_id": first_patient["id"],
            "department_id": "general",
            "practitioner_id": practitioner["id"],
            "appointment_type": "op",
            "appointment_date": "2026-05-04",
            "appointment_time": "09:15:00",
        },
    )
    orthopaedic_calendar = client.get(
        f"/api/v1/practitioners/{practitioner['id']}/calendar",
        headers={"X-Tenant-ID": tenant["id"]},
        params={
            "branch_id": branch["id"],
            "department_id": "ped",
            "start_date": "2026-05-04",
            "end_date": "2026-05-04",
        },
    )
    second = client.post(
        "/api/v1/appointments",
        headers={"X-Tenant-ID": tenant["id"]},
        json={
            "branch_id": branch["id"],
            "patient_id": second_patient["id"],
            "department_id": "ped",
            "practitioner_id": practitioner["id"],
            "appointment_type": "op",
            "appointment_date": "2026-05-04",
            "appointment_time": "09:15:00",
        },
    )

    blocked_slot = next(
        slot
        for slot in orthopaedic_calendar.json()["days"][0]["slots"]
        if slot["start_time"] == "09:15:00"
    )
    assert first.status_code == 201
    assert orthopaedic_calendar.status_code == 200
    assert blocked_slot["available"] is False
    assert blocked_slot["status"] == "booked"
    assert second.status_code == 409
    assert (
        second.json()["detail"]
        == "Doctor already has an active appointment at this time"
    )


def test_practitioner_leave_blocks_timed_appointment(client):
    tenant, branch, _other_branch, patient = setup_tenant_branch_departments_patient(
        client
    )
    enable_interval_slots(client, tenant["id"], branch["id"])
    practitioner = client.post(
        "/api/v1/practitioners",
        headers={"X-Tenant-ID": tenant["id"]},
        json={
            "full_name": "Dr. Leave",
            "branch_ids": [branch["id"]],
            "department_ids": ["general"],
        },
    ).json()
    client.post(
        f"/api/v1/practitioners/{practitioner['id']}/schedules",
        headers={"X-Tenant-ID": tenant["id"]},
        json={
            "branch_id": branch["id"],
            "mode": "custom",
            "weekdays": [0],
            "start_time": "09:00:00",
            "end_time": "12:00:00",
            "slot_minutes": 15,
        },
    )
    leave = client.post(
        f"/api/v1/practitioners/{practitioner['id']}/leaves",
        headers={"X-Tenant-ID": tenant["id"]},
        json={
            "branch_id": branch["id"],
            "start_date": "2026-05-04",
            "end_date": "2026-05-04",
            "start_time": "09:00:00",
            "end_time": "10:00:00",
            "reason": "Conference",
        },
    )
    response = client.post(
        "/api/v1/appointments",
        headers={"X-Tenant-ID": tenant["id"]},
        json={
            "branch_id": branch["id"],
            "patient_id": patient["id"],
            "department_id": "general",
            "practitioner_id": practitioner["id"],
            "appointment_type": "op",
            "appointment_date": "2026-05-04",
            "appointment_time": "09:30:00",
        },
    )

    assert leave.status_code == 201
    assert response.status_code == 400
    assert response.json()["detail"] == "Practitioner is on leave at this time"


def test_room_assignment_rejects_overlapping_room_use(client):
    tenant, branch, _other_branch, _patient = setup_tenant_branch_departments_patient(
        client
    )
    first = client.post(
        "/api/v1/practitioners",
        headers={"X-Tenant-ID": tenant["id"]},
        json={
            "full_name": "Dr. Room One",
            "branch_ids": [branch["id"]],
            "department_ids": ["general"],
        },
    ).json()
    second = client.post(
        "/api/v1/practitioners",
        headers={"X-Tenant-ID": tenant["id"]},
        json={
            "full_name": "Dr. Room Two",
            "branch_ids": [branch["id"]],
            "department_ids": ["general"],
        },
    ).json()

    first_assignment = client.post(
        f"/api/v1/practitioners/{first['id']}/room-assignments",
        headers={"X-Tenant-ID": tenant["id"]},
        json={
            "branch_id": branch["id"],
            "room_name": "Room 2",
            "weekday": 0,
            "start_time": "09:00:00",
            "end_time": "11:00:00",
        },
    )
    conflict = client.post(
        f"/api/v1/practitioners/{second['id']}/room-assignments",
        headers={"X-Tenant-ID": tenant["id"]},
        json={
            "branch_id": branch["id"],
            "room_name": "Room 2",
            "weekday": 0,
            "start_time": "10:00:00",
            "end_time": "12:00:00",
        },
    )

    assert first_assignment.status_code == 201
    assert conflict.status_code == 400
    assert conflict.json()["detail"] == "Room is already assigned during this time"


def test_practitioner_calendar_generates_available_booked_and_leave_slots(client):
    tenant, branch, _other_branch, patient = setup_tenant_branch_departments_patient(
        client
    )
    practitioner = client.post(
        "/api/v1/practitioners",
        headers={"X-Tenant-ID": tenant["id"]},
        json={
            "full_name": "Dr. Calendar",
            "branch_ids": [branch["id"]],
            "department_ids": ["general"],
        },
    ).json()
    client.post(
        f"/api/v1/practitioners/{practitioner['id']}/schedules",
        headers={"X-Tenant-ID": tenant["id"]},
        json={
            "branch_id": branch["id"],
            "department_id": "general",
            "mode": "custom",
            "weekdays": [0],
            "start_time": "09:00:00",
            "end_time": "10:00:00",
            "slot_minutes": 30,
        },
    )
    client.post(
        f"/api/v1/practitioners/{practitioner['id']}/leaves",
        headers={"X-Tenant-ID": tenant["id"]},
        json={
            "branch_id": branch["id"],
            "start_date": "2026-05-04",
            "end_date": "2026-05-04",
            "start_time": "09:30:00",
            "end_time": "10:00:00",
        },
    )
    booked = client.post(
        "/api/v1/appointments",
        headers={"X-Tenant-ID": tenant["id"]},
        json={
            "branch_id": branch["id"],
            "patient_id": patient["id"],
            "department_id": "general",
            "practitioner_id": practitioner["id"],
            "appointment_type": "op",
            "appointment_date": "2026-05-04",
            "appointment_time": "09:00:00",
        },
    )
    calendar = client.get(
        f"/api/v1/practitioners/{practitioner['id']}/calendar",
        headers={"X-Tenant-ID": tenant["id"]},
        params={
            "branch_id": branch["id"],
            "department_id": "general",
            "start_date": "2026-05-04",
            "end_date": "2026-05-04",
        },
    )

    assert booked.status_code == 201
    assert calendar.status_code == 200
    day = calendar.json()["days"][0]
    assert day["total_slots"] == 2
    assert day["available_slots"] == 0
    assert [slot["status"] for slot in day["slots"]] == ["booked", "leave"]
    # Room tracking on the schedule was dropped; no assignment exists here.
    assert day["slots"][0]["room_name"] is None


def test_practitioner_calendar_rejects_large_date_range(client):
    tenant, branch, _other_branch, _patient = setup_tenant_branch_departments_patient(
        client
    )
    practitioner = client.post(
        "/api/v1/practitioners",
        headers={"X-Tenant-ID": tenant["id"]},
        json={
            "full_name": "Dr. Range",
            "branch_ids": [branch["id"]],
            "department_ids": ["general"],
        },
    ).json()

    response = client.get(
        f"/api/v1/practitioners/{practitioner['id']}/calendar",
        headers={"X-Tenant-ID": tenant["id"]},
        params={
            "branch_id": branch["id"],
            "start_date": "2026-05-01",
            "end_date": "2026-08-01",
        },
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "Calendar range cannot exceed 62 days"


def _schedule_doctor(client, tenant, branch):
    return client.post(
        "/api/v1/practitioners",
        headers={"X-Tenant-ID": tenant["id"]},
        json={
            "full_name": "Dr. Date Schedule",
            "branch_ids": [branch["id"]],
            "department_ids": ["general"],
        },
    ).json()


def test_doctor_can_hold_split_sessions_but_not_overlapping_ones(client):
    tenant, branch, _other_branch, _patient = setup_tenant_branch_departments_patient(
        client
    )
    practitioner = _schedule_doctor(client, tenant, branch)
    headers = {"X-Tenant-ID": tenant["id"]}

    def create(start_time, end_time):
        return client.post(
            f"/api/v1/practitioners/{practitioner['id']}/schedules",
            headers=headers,
            json={
                "branch_id": branch["id"],
                "department_id": "general",
                "mode": "custom",
                "weekdays": [0],
                "start_time": start_time,
                "end_time": end_time,
                "slot_minutes": 15,
            },
        )

    morning = create("09:00:00", "12:00:00")
    evening = create("18:00:00", "21:00:00")
    overlapping = create("11:00:00", "13:00:00")
    other_weekday = client.post(
        f"/api/v1/practitioners/{practitioner['id']}/schedules",
        headers=headers,
        json={
            "branch_id": branch["id"],
            "department_id": "general",
            "mode": "custom",
            "weekdays": [1],
            "start_time": "09:00:00",
            "end_time": "12:00:00",
            "slot_minutes": 15,
        },
    )

    assert morning.status_code == 201
    # Separate sessions in one department are legitimate (morning + evening).
    assert evening.status_code == 201
    # A window that overlaps an existing one is still a duplicate.
    assert overlapping.status_code == 400
    assert "overlapping" in overlapping.json()["detail"]
    # The same window on a different weekday is a different slot entirely.
    assert other_weekday.status_code == 201


def test_daily_and_mon_saturday_modes_resolve_weekdays_server_side(client):
    """A schedule is one row now, so a client only sends `mode` (plus
    `weekdays` for custom); daily/mon_saturday are always resolved by the
    server, not trusted from the client."""
    tenant, branch, _other_branch, _patient = setup_tenant_branch_departments_patient(
        client
    )
    practitioner = _schedule_doctor(client, tenant, branch)
    headers = {"X-Tenant-ID": tenant["id"]}

    daily = client.post(
        f"/api/v1/practitioners/{practitioner['id']}/schedules",
        headers=headers,
        json={
            "branch_id": branch["id"],
            "department_id": "general",
            "mode": "daily",
            "start_time": "09:00:00",
            "end_time": "12:00:00",
            "slot_minutes": 15,
        },
    )
    assert daily.status_code == 201
    assert daily.json()["weekdays"] == [0, 1, 2, 3, 4, 5, 6]

    mon_sat = client.post(
        f"/api/v1/practitioners/{practitioner['id']}/schedules",
        headers=headers,
        json={
            "branch_id": branch["id"],
            "department_id": "general",
            "mode": "mon_saturday",
            "start_time": "18:00:00",
            "end_time": "20:00:00",
            "slot_minutes": 15,
        },
    )
    assert mon_sat.status_code == 201
    assert mon_sat.json()["weekdays"] == [0, 1, 2, 3, 4, 5]

    flat = client.get("/api/v1/practitioners/schedules", headers=headers)
    assert flat.status_code == 200
    assert len(flat.json()) == 2


def test_custom_schedule_covers_only_its_selected_weekdays(client):
    tenant, branch, _other_branch, _patient = setup_tenant_branch_departments_patient(
        client
    )
    practitioner = _schedule_doctor(client, tenant, branch)
    headers = {"X-Tenant-ID": tenant["id"]}

    response = client.post(
        f"/api/v1/practitioners/{practitioner['id']}/schedules",
        headers=headers,
        json={
            "branch_id": branch["id"],
            "department_id": "general",
            "mode": "custom",
            "weekdays": [0, 2, 4],
            "start_time": "09:00:00",
            "end_time": "12:00:00",
            "slot_minutes": 15,
        },
    )
    assert response.status_code == 201
    assert response.json()["weekdays"] == [0, 2, 4]
    assert response.json()["mode"] == "custom"


def test_custom_schedule_without_weekdays_is_rejected(client):
    tenant, branch, _other_branch, _patient = setup_tenant_branch_departments_patient(
        client
    )
    practitioner = _schedule_doctor(client, tenant, branch)
    headers = {"X-Tenant-ID": tenant["id"]}

    response = client.post(
        f"/api/v1/practitioners/{practitioner['id']}/schedules",
        headers=headers,
        json={
            "branch_id": branch["id"],
            "department_id": "general",
            "mode": "custom",
            "start_time": "09:00:00",
            "end_time": "12:00:00",
            "slot_minutes": 15,
        },
    )
    assert response.status_code == 422
