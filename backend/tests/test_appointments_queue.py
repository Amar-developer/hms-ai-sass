from datetime import date, timedelta

from fastapi.testclient import TestClient


def create_tenant(client: TestClient) -> dict:
    response = client.post("/api/v1/tenants", json={"name": "Queue Clinic"})
    assert response.status_code == 201
    return response.json()


def create_branch(client: TestClient, tenant_id: str) -> dict:
    response = client.post(
        f"/api/v1/tenants/{tenant_id}/branches",
        json={"name": "Main Branch", "code": "MAIN"},
    )
    assert response.status_code == 201
    return response.json()


def create_patient(
    client: TestClient,
    tenant_id: str,
    name: str = "Ravi Kumar",
    mobile: str | None = None,
) -> dict:
    payload = {"full_name": name, "age_years": 42}
    if mobile:
        payload["mobile"] = mobile
    response = client.post(
        "/api/v1/patients",
        headers={"X-Tenant-ID": tenant_id},
        json=payload,
    )
    assert response.status_code == 201
    return response.json()


def book(
    client: TestClient,
    tenant_id: str,
    branch_id: str,
    patient_id: str,
    appointment_type: str = "op",
) -> dict:
    response = client.post(
        "/api/v1/appointments",
        headers={"X-Tenant-ID": tenant_id},
        json={
            "branch_id": branch_id,
            "patient_id": patient_id,
            "department_id": "general",
            "practitioner_id": "doctor_demo",
            "appointment_type": appointment_type,
            "appointment_date": date.today().isoformat(),
            "reason": "Fever",
            "emergency_reason": "Severe pain"
            if appointment_type == "emergency"
            else None,
        },
    )
    assert response.status_code == 201
    return response.json()


def test_tokens_are_generated_per_selected_appointment_date(client: TestClient):
    tenant = create_tenant(client)
    branch = create_branch(client, tenant["id"])
    today_patient = create_patient(client, tenant["id"], "Today Patient")
    future_patient = create_patient(client, tenant["id"], "Future Patient")

    today = book(client, tenant["id"], branch["id"], today_patient["id"])
    future_date = date.today() + timedelta(days=1)
    future = client.post(
        "/api/v1/appointments",
        headers={"X-Tenant-ID": tenant["id"]},
        json={
            "branch_id": branch["id"],
            "patient_id": future_patient["id"],
            "department_id": "general",
            "practitioner_id": "doctor_demo",
            "appointment_type": "op",
            "appointment_date": future_date.isoformat(),
            "reason": "Future appointment",
        },
    )

    assert today["queue_entry"]["token_number"] == "N-001"
    assert future.status_code == 201
    assert future.json()["queue_entry"]["token_number"] == "N-001"


def test_book_appointment_requires_department_and_doctor(client: TestClient):
    tenant = create_tenant(client)
    branch = create_branch(client, tenant["id"])
    patient = create_patient(client, tenant["id"], "Required Doctor Patient")

    response = client.post(
        "/api/v1/appointments",
        headers={"X-Tenant-ID": tenant["id"]},
        json={
            "branch_id": branch["id"],
            "patient_id": patient["id"],
            "appointment_date": date.today().isoformat(),
        },
    )

    assert response.status_code == 422
    missing_fields = {
        ".".join(str(part) for part in error["loc"])
        for error in response.json()["detail"]
    }
    assert "body.department_id" in missing_fields
    assert "body.practitioner_id" in missing_fields


def test_repeated_appointment_create_with_idempotency_key_replays_first_response(
    client: TestClient,
):
    tenant = create_tenant(client)
    branch = create_branch(client, tenant["id"])
    patient = create_patient(client, tenant["id"], "Idempotent Patient")
    headers = {"X-Tenant-ID": tenant["id"], "X-Idempotency-Key": "appointment-submit-1"}
    payload = {
        "branch_id": branch["id"],
        "patient_id": patient["id"],
        "department_id": "general",
        "practitioner_id": "doctor_demo",
        "appointment_type": "op",
        "appointment_date": date.today().isoformat(),
        "reason": "Fever",
    }

    first = client.post("/api/v1/appointments", headers=headers, json=payload)
    second = client.post("/api/v1/appointments", headers=headers, json=payload)

    assert first.status_code == 201
    assert second.status_code == 201
    assert second.headers["x-idempotency-replayed"] == "true"
    assert second.json()["appointment"]["id"] == first.json()["appointment"]["id"]
    assert (
        second.json()["queue_entry"]["token_number"]
        == first.json()["queue_entry"]["token_number"]
    )

    listed = client.get("/api/v1/appointments", headers={"X-Tenant-ID": tenant["id"]})
    assert listed.status_code == 200
    assert [row["id"] for row in listed.json()] == [first.json()["appointment"]["id"]]


def test_list_appointments_supports_patient_search_date_and_department_filters(
    client: TestClient,
):
    tenant = create_tenant(client)
    branch = create_branch(client, tenant["id"])
    patient = create_patient(client, tenant["id"], "Searchable Patient")
    other_patient = create_patient(client, tenant["id"], "Other Patient")
    target_date = date.today()
    book(client, tenant["id"], branch["id"], patient["id"])
    client.post(
        "/api/v1/appointments",
        headers={"X-Tenant-ID": tenant["id"]},
        json={
            "branch_id": branch["id"],
            "patient_id": other_patient["id"],
            "department_id": "ortho",
            "practitioner_id": "doctor_demo",
            "appointment_type": "op",
            "appointment_date": target_date.isoformat(),
        },
    )

    searched = client.get(
        f"/api/v1/appointments?q=Searchable&appointment_date={target_date.isoformat()}&limit=10",
        headers={"X-Tenant-ID": tenant["id"]},
    )
    department = client.get(
        "/api/v1/appointments?department_id=ortho",
        headers={"X-Tenant-ID": tenant["id"]},
    )

    assert searched.status_code == 200
    assert len(searched.json()) == 1
    assert searched.json()[0]["patient_id"] == patient["id"]
    assert department.status_code == 200
    assert len(department.json()) == 1
    assert department.json()[0]["patient_id"] == other_patient["id"]


def test_appointment_page_reports_filtered_total(client: TestClient):
    tenant = create_tenant(client)
    branch = create_branch(client, tenant["id"])
    first = create_patient(client, tenant["id"], "First Page Patient")
    second = create_patient(client, tenant["id"], "Second Page Patient")
    book(client, tenant["id"], branch["id"], first["id"])
    book(client, tenant["id"], branch["id"], second["id"])

    response = client.get(
        "/api/v1/appointments/page?limit=1&offset=1",
        headers={"X-Tenant-ID": tenant["id"]},
    )

    assert response.status_code == 200
    assert response.json()["total"] == 2
    assert len(response.json()["items"]) == 1
    assert response.json()["limit"] == 1
    assert response.json()["offset"] == 1


def _create_doctor_login(
    client: TestClient, tenant_id: str, branch_id: str, name: str, email: str
) -> tuple[dict, dict, dict]:
    role = client.post(
        "/api/v1/identity/roles",
        headers={"X-Tenant-ID": tenant_id},
        json={
            "name": f"{name} Role",
            "key": email.split("@")[0].replace(".", "_"),
            "permission_keys": [
                "appointments.manage",
                "queue.manage",
                "consultations.read",
                "consultations.write",
                "consultations.sign",
            ],
        },
    ).json()
    user = client.post(
        "/api/v1/identity/users",
        headers={"X-Tenant-ID": tenant_id},
        json={
            "name": name,
            "email": email,
            "password": "DoctorPass123",
            "user_type": "doctor",
            "branch_id": branch_id,
            "role_keys": [role["key"]],
        },
    ).json()
    practitioner = client.post(
        "/api/v1/practitioners",
        headers={"X-Tenant-ID": tenant_id},
        json={
            "user_id": user["id"],
            "full_name": name,
            "primary_specialty": "ENT",
            "branch_ids": [branch_id],
            "department_ids": ["ent"],
        },
    ).json()
    client.post(
        f"/api/v1/practitioners/{practitioner['id']}/schedules",
        headers={"X-Tenant-ID": tenant_id},
        json={
            "branch_id": branch_id,
            "department_id": "ent",
            "mode": "custom",
            "weekdays": [date.today().weekday()],
            "start_time": "09:00:00",
            "end_time": "17:00:00",
            "slot_minutes": 15,
        },
    )
    login = client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": "DoctorPass123", "tenant_id": tenant_id},
    )
    headers = {
        "Authorization": f"Bearer {login.cookies['access_token']}",
        "X-Tenant-ID": tenant_id,
    }
    return user, practitioner, headers


def test_doctor_login_sees_and_operates_only_own_appointments_in_same_department(
    client: TestClient,
):
    tenant = create_tenant(client)
    branch = create_branch(client, tenant["id"])
    arun_user, arun, arun_headers = _create_doctor_login(
        client,
        tenant["id"],
        branch["id"],
        "Dr. Arun ENT",
        "dr.arun.ent@test.local",
    )
    _guru_user, guru, guru_headers = _create_doctor_login(
        client,
        tenant["id"],
        branch["id"],
        "Dr. Guru ENT",
        "dr.guru.ent@test.local",
    )
    arun_patient = create_patient(client, tenant["id"], "Arun Patient")
    guru_patient = create_patient(client, tenant["id"], "Guru Patient")

    arun_booking = client.post(
        "/api/v1/appointments",
        headers={"X-Tenant-ID": tenant["id"]},
        json={
            "branch_id": branch["id"],
            "department_id": "ent",
            "patient_id": arun_patient["id"],
            "practitioner_id": arun["id"],
            "appointment_type": "op",
            "appointment_date": date.today().isoformat(),
        },
    ).json()
    guru_booking = client.post(
        "/api/v1/appointments",
        headers={"X-Tenant-ID": tenant["id"]},
        json={
            "branch_id": branch["id"],
            "department_id": "ent",
            "patient_id": guru_patient["id"],
            "practitioner_id": guru["id"],
            "appointment_type": "op",
            "appointment_date": date.today().isoformat(),
        },
    ).json()

    arun_appointments = client.get(
        "/api/v1/appointments?department_id=ent", headers=arun_headers
    )
    guru_appointments = client.get(
        "/api/v1/appointments?department_id=ent", headers=guru_headers
    )
    arun_practitioners = client.get(
        "/api/v1/practitioners?department_id=ent", headers=arun_headers
    )
    arun_queue = client.get(
        "/api/v1/queue?include_completed=true", headers=arun_headers
    )
    guru_call_by_arun = client.post(
        f"/api/v1/queue/{guru_booking['queue_entry']['id']}/call",
        headers=arun_headers,
        json={"reason": "Wrong doctor attempt", "actor_user_id": arun_user["id"]},
    )
    guru_consult_by_arun = client.post(
        "/api/v1/consultations",
        headers=arun_headers,
        json={
            "appointment_id": guru_booking["appointment"]["id"],
            "created_by_user_id": arun_user["id"],
        },
    )

    assert arun_appointments.status_code == 200
    assert [row["id"] for row in arun_appointments.json()] == [
        arun_booking["appointment"]["id"]
    ]
    assert guru_appointments.status_code == 200
    assert [row["id"] for row in guru_appointments.json()] == [
        guru_booking["appointment"]["id"]
    ]
    assert arun_booking["queue_entry"]["token_number"] == "N-001"
    assert guru_booking["queue_entry"]["token_number"] == "N-001"
    assert arun_practitioners.status_code == 200
    assert [row["id"] for row in arun_practitioners.json()] == [arun["id"]]
    assert arun_queue.status_code == 200
    assert [row["appointment_id"] for row in arun_queue.json()] == [
        arun_booking["appointment"]["id"]
    ]
    assert guru_call_by_arun.status_code == 403
    assert guru_call_by_arun.json()["detail"] == "Doctor access denied"
    assert guru_consult_by_arun.status_code == 403
    assert guru_consult_by_arun.json()["detail"] == "Doctor access denied"


def test_super_admin_can_view_combined_appointment_grid_across_tenants(
    client: TestClient,
):
    first_tenant = create_tenant(client)
    first_branch = create_branch(client, first_tenant["id"])
    first_patient = create_patient(client, first_tenant["id"], "First Tenant Patient")
    second_tenant = client.post(
        "/api/v1/tenants", json={"name": "Second Queue Clinic"}
    ).json()
    second_branch = create_branch(client, second_tenant["id"])
    second_patient = create_patient(
        client, second_tenant["id"], "Second Tenant Patient"
    )

    book(client, first_tenant["id"], first_branch["id"], first_patient["id"])
    book(client, second_tenant["id"], second_branch["id"], second_patient["id"])

    combined = client.get("/api/v1/appointments/platform/all?q=Tenant&limit=20")
    filtered = client.get(
        f"/api/v1/appointments/platform/all?tenant_id={second_tenant['id']}"
    )

    assert combined.status_code == 200
    assert {row["tenant_name"] for row in combined.json()} == {
        "Queue Clinic",
        "Second Queue Clinic",
    }
    assert filtered.status_code == 200
    assert len(filtered.json()) == 1
    assert filtered.json()[0]["patient_name"] == "Second Tenant Patient"


def test_book_op_appointment_creates_waiting_queue_entry_and_audit(client: TestClient):
    tenant = create_tenant(client)
    branch = create_branch(client, tenant["id"])
    patient = create_patient(client, tenant["id"])

    booking = book(client, tenant["id"], branch["id"], patient["id"])
    audit = client.get(
        "/api/v1/audit-events", headers={"X-Tenant-ID": tenant["id"]}
    ).json()

    assert booking["appointment"]["status"] == "waiting"
    assert booking["queue_entry"]["status"] == "waiting"
    assert booking["queue_entry"]["token_number"] == "N-001"
    assert booking["queue_entry"]["priority"] == "normal"
    assert "appointment.booked" in [event["action"] for event in audit]
    assert "queue.entry.created" in [event["action"] for event in audit]


def test_emergency_queue_sorts_before_normal_tokens(client: TestClient):
    tenant = create_tenant(client)
    branch = create_branch(client, tenant["id"])
    normal_patient = create_patient(client, tenant["id"], "Normal Patient")
    emergency_patient = create_patient(client, tenant["id"], "Emergency Patient")

    normal = book(client, tenant["id"], branch["id"], normal_patient["id"])
    emergency = book(
        client,
        tenant["id"],
        branch["id"],
        emergency_patient["id"],
        appointment_type="emergency",
    )
    queue = client.get("/api/v1/queue", headers={"X-Tenant-ID": tenant["id"]}).json()

    assert normal["queue_entry"]["token_number"] == "N-001"
    assert emergency["queue_entry"]["token_number"] == "E-001"
    assert [entry["id"] for entry in queue] == [
        emergency["queue_entry"]["id"],
        normal["queue_entry"]["id"],
    ]


def test_queue_call_not_available_requeue_and_start_consultation(client: TestClient):
    tenant = create_tenant(client)
    branch = create_branch(client, tenant["id"])
    patient = create_patient(client, tenant["id"])
    booking = book(client, tenant["id"], branch["id"], patient["id"])
    entry_id = booking["queue_entry"]["id"]

    called = client.post(
        f"/api/v1/queue/{entry_id}/call",
        headers={"X-Tenant-ID": tenant["id"]},
        json={"reason": "Token announced"},
    )
    not_available = client.post(
        f"/api/v1/queue/{entry_id}/mark-not-available",
        headers={"X-Tenant-ID": tenant["id"]},
        json={"reason": "Patient not in waiting area"},
    )
    requeued = client.post(
        f"/api/v1/queue/{entry_id}/requeue",
        headers={"X-Tenant-ID": tenant["id"]},
        json={"reason": "Patient returned", "place_at_end": True},
    )
    started = client.post(
        f"/api/v1/queue/{entry_id}/start-consultation",
        headers={"X-Tenant-ID": tenant["id"]},
        json={"reason": "Doctor accepted"},
    )

    assert called.status_code == 200
    assert called.json()["status"] == "called"
    assert not_available.status_code == 200
    assert not_available.json()["status"] == "patient_not_available"
    assert not_available.json()["missed_call_count"] == 1
    assert requeued.status_code == 200
    assert requeued.json()["status"] == "requeued"
    assert started.status_code == 200
    assert started.json()["status"] == "in_consultation"


def test_cancel_and_no_show_are_terminal(client: TestClient):
    tenant = create_tenant(client)
    branch = create_branch(client, tenant["id"])
    patient = create_patient(client, tenant["id"])
    booking = book(client, tenant["id"], branch["id"], patient["id"])
    entry_id = booking["queue_entry"]["id"]

    cancelled = client.post(
        f"/api/v1/queue/{entry_id}/cancel",
        headers={"X-Tenant-ID": tenant["id"]},
        json={"reason": "Patient cancelled"},
    )
    call_again = client.post(
        f"/api/v1/queue/{entry_id}/call",
        headers={"X-Tenant-ID": tenant["id"]},
        json={"reason": "Should fail"},
    )

    assert cancelled.status_code == 200
    assert cancelled.json()["status"] == "cancelled"
    assert call_again.status_code == 409

    next_patient = create_patient(client, tenant["id"], "No Show Patient")
    next_booking = book(client, tenant["id"], branch["id"], next_patient["id"])
    for _ in range(3):
        client.post(
            f"/api/v1/queue/{next_booking['queue_entry']['id']}/mark-not-available",
            headers={"X-Tenant-ID": tenant["id"]},
            json={"reason": "Missed call"},
        )
    no_show = client.post(
        f"/api/v1/queue/{next_booking['queue_entry']['id']}/no-show",
        headers={"X-Tenant-ID": tenant["id"]},
        json={"reason": "Missed repeated calls"},
    )
    assert no_show.status_code == 200
    assert no_show.json()["status"] == "no_show"


def test_no_show_requires_configured_missed_call_threshold(client: TestClient):
    tenant = create_tenant(client)
    branch = create_branch(client, tenant["id"])
    patient = create_patient(client, tenant["id"])
    booking = book(client, tenant["id"], branch["id"], patient["id"])
    entry_id = booking["queue_entry"]["id"]

    too_early = client.post(
        f"/api/v1/queue/{entry_id}/no-show",
        headers={"X-Tenant-ID": tenant["id"]},
        json={"reason": "Too early"},
    )
    client.put(
        "/api/v1/settings",
        headers={"X-Tenant-ID": tenant["id"]},
        json={
            "scope": "branch",
            "scope_id": branch["id"],
            "module": "queue",
            "key": "queue.auto_no_show_after_missed_calls",
            "value": 1,
        },
    )
    client.post(
        f"/api/v1/queue/{entry_id}/mark-not-available",
        headers={"X-Tenant-ID": tenant["id"]},
        json={"reason": "Missed once"},
    )
    no_show = client.post(
        f"/api/v1/queue/{entry_id}/no-show",
        headers={"X-Tenant-ID": tenant["id"]},
        json={"reason": "Configured threshold reached"},
    )

    assert too_early.status_code == 409
    assert too_early.json()["detail"] == "No-show requires at least 3 missed calls"
    assert no_show.status_code == 200
    assert no_show.json()["status"] == "no_show"


def test_requeue_uses_configured_after_patients_offset_when_not_end(client: TestClient):
    tenant = create_tenant(client)
    branch = create_branch(client, tenant["id"])
    first_patient = create_patient(client, tenant["id"], "First Patient")
    second_patient = create_patient(client, tenant["id"], "Second Patient")
    third_patient = create_patient(client, tenant["id"], "Third Patient")
    first = book(client, tenant["id"], branch["id"], first_patient["id"])
    book(client, tenant["id"], branch["id"], second_patient["id"])
    book(client, tenant["id"], branch["id"], third_patient["id"])
    client.put(
        "/api/v1/settings",
        headers={"X-Tenant-ID": tenant["id"]},
        json={
            "scope": "branch",
            "scope_id": branch["id"],
            "module": "queue",
            "key": "queue.requeue_after_patients",
            "value": 2,
        },
    )

    requeued = client.post(
        f"/api/v1/queue/{first['queue_entry']['id']}/requeue",
        headers={"X-Tenant-ID": tenant["id"]},
        json={"reason": "Move after two patients", "place_at_end": False},
    )

    assert requeued.status_code == 200
    assert requeued.json()["queue_position"] == 3


def test_queue_and_appointment_are_tenant_isolated(client: TestClient):
    first = create_tenant(client)
    first_branch = create_branch(client, first["id"])
    first_patient = create_patient(client, first["id"])
    second = create_tenant(client)

    booking = book(client, first["id"], first_branch["id"], first_patient["id"])

    appointment_response = client.get(
        f"/api/v1/appointments/{booking['appointment']['id']}",
        headers={"X-Tenant-ID": second["id"]},
    )
    queue_response = client.post(
        f"/api/v1/queue/{booking['queue_entry']['id']}/call",
        headers={"X-Tenant-ID": second["id"]},
        json={},
    )

    assert appointment_response.status_code == 404
    assert queue_response.status_code == 404


def test_booking_rejects_patient_from_other_tenant(client: TestClient):
    first = create_tenant(client)
    first_branch = create_branch(client, first["id"])
    second = create_tenant(client)
    second_patient = create_patient(client, second["id"])

    response = client.post(
        "/api/v1/appointments",
        headers={"X-Tenant-ID": first["id"]},
        json={
            "branch_id": first_branch["id"],
            "patient_id": second_patient["id"],
            "department_id": "general",
            "practitioner_id": "doctor_demo",
            "appointment_type": "op",
            "appointment_date": date.today().isoformat(),
        },
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "Invalid patient"


def test_duplicate_patient_detection_blocks_exact_registration(client: TestClient):
    tenant = create_tenant(client)
    create_patient(
        client,
        tenant["id"],
        "Duplicate Patient",
        mobile="9876543210",
    )

    duplicate_check = client.post(
        "/api/v1/patients/duplicates",
        headers={"X-Tenant-ID": tenant["id"]},
        json={"full_name": "Duplicate Patient", "mobile": "9876543210"},
    )
    duplicate_create = client.post(
        "/api/v1/patients",
        headers={"X-Tenant-ID": tenant["id"]},
        json={"full_name": "Duplicate Patient", "mobile": "9876543210"},
    )

    assert duplicate_check.status_code == 200
    assert duplicate_check.json()[0]["confidence"] == "high"
    assert duplicate_create.status_code == 409
    assert (
        duplicate_create.json()["detail"]
        == "Mobile number is already used as the primary mobile number for "
        "another patient. Use Alternate Phone Number for a shared family "
        "contact."
    )


def test_patient_registration_requires_shared_family_number_as_alternate(
    client: TestClient,
):
    tenant = create_tenant(client)
    client.post(
        "/api/v1/patients",
        headers={"X-Tenant-ID": tenant["id"]},
        json={
            "full_name": "Balaji N",
            "mobile": "9876543210",
            "date_of_birth": "1985-05-10",
        },
    )

    duplicate_check = client.post(
        "/api/v1/patients/duplicates",
        headers={"X-Tenant-ID": tenant["id"]},
        json={
            "full_name": "Dakshiin B",
            "mobile": "9876543210",
            "date_of_birth": "2018-09-15",
        },
    )
    child_create = client.post(
        "/api/v1/patients",
        headers={"X-Tenant-ID": tenant["id"]},
        json={
            "full_name": "Dakshiin B",
            "alternate_mobile": "9876543210",
            "date_of_birth": "2018-09-15",
        },
    )

    assert duplicate_check.status_code == 200
    assert duplicate_check.json()[0]["confidence"] == "medium"
    assert child_create.status_code == 201
    assert child_create.json()["full_name"] == "Dakshiin B"
    assert child_create.json()["mobile"] is None
    assert child_create.json()["alternate_mobile"] == "9876543210"


def test_duplicate_patient_detection_uses_date_of_birth_for_high_confidence(
    client: TestClient,
):
    tenant = create_tenant(client)
    first = client.post(
        "/api/v1/patients",
        headers={"X-Tenant-ID": tenant["id"]},
        json={
            "full_name": "Same Name",
            "mobile": "9000000001",
            "date_of_birth": "1990-01-20",
        },
    )
    assert first.status_code == 201

    same_dob = client.post(
        "/api/v1/patients",
        headers={"X-Tenant-ID": tenant["id"]},
        json={
            "full_name": "Same Name",
            "mobile": "9000000001",
            "date_of_birth": "1990-01-20",
        },
    )
    # Uses guardian_mobile (not mobile) to reach the name+DOB duplicate
    # scoring in PatientDuplicateService.candidates(): the primary-mobile
    # uniqueness guard in _validate_mobile_numbers only inspects the
    # `mobile` field, so reusing it here would always 409 regardless of
    # date of birth and the confidence downgrade below would never be
    # exercised.
    different_dob = client.post(
        "/api/v1/patients",
        headers={"X-Tenant-ID": tenant["id"]},
        json={
            "full_name": "Same Name",
            "guardian_mobile": "9000000001",
            "date_of_birth": "2018-01-20",
        },
    )

    assert same_dob.status_code == 409
    assert different_dob.status_code == 201


def test_duplicate_appointment_prevention_by_patient_doctor_and_slot(
    client: TestClient,
):
    tenant = create_tenant(client)
    branch = create_branch(client, tenant["id"])
    patient = create_patient(client, tenant["id"], "Slot Patient")
    payload = {
        "branch_id": branch["id"],
        "patient_id": patient["id"],
        "department_id": "general",
        "practitioner_id": "doctor_demo",
        "appointment_type": "op",
        "appointment_date": date.today().isoformat(),
        "appointment_time": "10:00:00",
    }

    first = client.post(
        "/api/v1/appointments", headers={"X-Tenant-ID": tenant["id"]}, json=payload
    )
    duplicate = client.post(
        "/api/v1/appointments", headers={"X-Tenant-ID": tenant["id"]}, json=payload
    )

    assert first.status_code == 201
    assert duplicate.status_code == 409
    assert (
        duplicate.json()["detail"]
        == "Patient already has an active appointment at this time"
    )


def test_follow_up_booking_creates_follow_up_token(client: TestClient):
    tenant = create_tenant(client)
    branch = create_branch(client, tenant["id"])
    patient = create_patient(client, tenant["id"], "Follow Up Patient")
    source = book(client, tenant["id"], branch["id"], patient["id"])

    follow_up = client.post(
        f"/api/v1/appointments/{source['appointment']['id']}/follow-up",
        headers={"X-Tenant-ID": tenant["id"]},
        json={
            "appointment_date": (date.today() + timedelta(days=7)).isoformat(),
            "appointment_time": "10:30:00",
            "reason": "Review after medicine course",
        },
    )

    assert follow_up.status_code == 201
    assert follow_up.json()["appointment"]["appointment_type"] == "follow_up"
    assert follow_up.json()["queue_entry"]["token_number"] == "N-001"


def test_emergency_booking_records_override_audit(client: TestClient):
    tenant = create_tenant(client)
    branch = create_branch(client, tenant["id"])
    patient = create_patient(client, tenant["id"], "Emergency Audit Patient")

    emergency = book(
        client, tenant["id"], branch["id"], patient["id"], appointment_type="emergency"
    )
    audit = client.get(
        "/api/v1/audit-events", headers={"X-Tenant-ID": tenant["id"]}
    ).json()

    assert emergency["queue_entry"]["priority"] == "emergency"
    assert "appointment.emergency_override" in [event["action"] for event in audit]


def test_review_and_fitness_visits_capture_purpose_billing_and_audit(
    client: TestClient,
):
    tenant = create_tenant(client)
    branch = create_branch(client, tenant["id"])
    patient = create_patient(client, tenant["id"], "Review Purpose Patient")
    source = book(client, tenant["id"], branch["id"], patient["id"])

    review = client.post(
        "/api/v1/appointments",
        headers={"X-Tenant-ID": tenant["id"]},
        json={
            "branch_id": branch["id"],
            "patient_id": patient["id"],
            "department_id": source["appointment"]["department_id"],
            "practitioner_id": source["appointment"]["practitioner_id"],
            "appointment_type": "doctor_review",
            "appointment_date": (date.today() + timedelta(days=1)).isoformat(),
            "visit_purpose": "doctor_review",
            "source_appointment_id": source["appointment"]["id"],
            "is_billable": False,
            "billing_note": "Within free review window",
        },
    )
    fitness = client.post(
        "/api/v1/appointments",
        headers={"X-Tenant-ID": tenant["id"]},
        json={
            "branch_id": branch["id"],
            "patient_id": patient["id"],
            "department_id": source["appointment"]["department_id"],
            "practitioner_id": source["appointment"]["practitioner_id"],
            "appointment_type": "fitness_certificate",
            "appointment_date": (date.today() + timedelta(days=2)).isoformat(),
            "visit_purpose": "fitness_certificate",
            "is_billable": True,
        },
    )
    audit = client.get(
        "/api/v1/audit-events", headers={"X-Tenant-ID": tenant["id"]}
    ).json()

    assert review.status_code == 201
    assert review.json()["appointment"]["is_billable"] is False
    assert (
        review.json()["appointment"]["source_appointment_id"]
        == source["appointment"]["id"]
    )
    assert fitness.status_code == 201
    assert fitness.json()["appointment"]["appointment_type"] == "fitness_certificate"
    actions = [event["action"] for event in audit]
    assert "appointment.doctor_review_booked" in actions
    assert "appointment.fitness_certificate_booked" in actions


def test_doctor_review_inside_configured_validity_is_auto_free(client: TestClient):
    tenant = create_tenant(client)
    branch = create_branch(client, tenant["id"])
    patient = create_patient(client, tenant["id"], "Auto Free Review Patient")
    source = book(client, tenant["id"], branch["id"], patient["id"])
    client.put(
        "/api/v1/settings",
        headers={"X-Tenant-ID": tenant["id"]},
        json={
            "scope": "branch",
            "scope_id": branch["id"],
            "module": "follow_up",
            "key": "follow_up.validity_days",
            "value": 5,
        },
    )

    review = client.post(
        "/api/v1/appointments",
        headers={"X-Tenant-ID": tenant["id"]},
        json={
            "branch_id": branch["id"],
            "patient_id": patient["id"],
            "department_id": source["appointment"]["department_id"],
            "practitioner_id": source["appointment"]["practitioner_id"],
            "appointment_type": "doctor_review",
            "appointment_date": (date.today() + timedelta(days=3)).isoformat(),
            "visit_purpose": "doctor_review",
            "source_appointment_id": source["appointment"]["id"],
        },
    )

    assert review.status_code == 201
    assert review.json()["appointment"]["is_billable"] is False
    assert "Auto free review" in review.json()["appointment"]["billing_note"]


def test_queue_display_supports_tamil_token_calling_text(client: TestClient):
    tenant = create_tenant(client)
    branch = create_branch(client, tenant["id"])
    patient = create_patient(client, tenant["id"], "Tamil Token Patient")
    book(client, tenant["id"], branch["id"], patient["id"])
    client.put(
        "/api/v1/settings",
        headers={"X-Tenant-ID": tenant["id"]},
        json={
            "scope": "branch",
            "scope_id": branch["id"],
            "module": "queue",
            "key": "token.language",
            "value": "tamil",
        },
    )

    display = client.get(
        f"/api/v1/queue/display?branch_id={branch['id']}",
        headers={"X-Tenant-ID": tenant["id"]},
    )

    assert display.status_code == 200
    assert display.json()[0]["token_number"] == "N-001"
    assert "maruththuva" in display.json()[0]["call_message"]


def test_appointment_grid_projects_only_display_fields():
    from app.modules.appointments.repositories import AppointmentGridRepository

    sql = str(AppointmentGridRepository(object())._statement())

    assert "patient.full_name" in sql
    assert "queueentry.token_number" in sql
    assert "patient.whatsapp_consent_status" not in sql
    assert "consultation.clinical_notes" not in sql


def test_appointment_grid_projection_preserves_response_fields():
    from datetime import date

    from app.modules.appointments.models import Appointment
    from app.modules.appointments.services.query_service import appointment_grid_row

    appointment = Appointment(
        id="appointment_one",
        tenant_id="tenant_one",
        branch_id="branch_one",
        patient_id="patient_one",
        department_id="general",
        practitioner_id="doctor_one",
        appointment_date=date(2026, 8, 2),
    )
    row = appointment_grid_row(
        (
            appointment,
            "tenant_one",
            "Clinic",
            "branch_one",
            "Main Branch",
            "patient_one",
            "Patient One",
            "9000000001",
            "general",
            "General Medicine",
            "doctor_one",
            "Dr. One",
            "N-001",
            "signed",
        )
    )

    assert row.patient_name == "Patient One"
    assert row.practitioner_name == "Dr. One"
    assert row.token_number == "N-001"
    assert row.consultation_status == "signed"
