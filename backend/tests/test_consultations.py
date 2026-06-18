from datetime import date

from fastapi.testclient import TestClient


def setup_booking(client: TestClient) -> dict:
    tenant = client.post("/api/v1/tenants", json={"name": "Doctor Clinic"}).json()
    branch = client.post(
        f"/api/v1/tenants/{tenant['id']}/branches",
        json={"name": "Main Branch", "code": "MAIN"},
    ).json()
    patient = client.post(
        "/api/v1/patients",
        headers={"X-Tenant-ID": tenant["id"]},
        json={"full_name": "Ravi Kumar", "mobile": "9876543210", "age_years": 42},
    ).json()
    booking_response = client.post(
        "/api/v1/appointments",
        headers={"X-Tenant-ID": tenant["id"]},
        json={
            "branch_id": branch["id"],
            "patient_id": patient["id"],
            "appointment_type": "op",
            "appointment_date": date.today().isoformat(),
            "reason": "Fever",
            "practitioner_id": "doctor_demo",
        },
    )
    assert booking_response.status_code == 201
    return {
        "tenant": tenant,
        "branch": branch,
        "patient": patient,
        "booking": booking_response.json(),
    }


def create_consultation(
    client: TestClient, tenant_id: str, appointment_id: str
) -> dict:
    response = client.post(
        "/api/v1/consultations",
        headers={"X-Tenant-ID": tenant_id},
        json={
            "appointment_id": appointment_id,
            "chief_complaint": "Fever and body pain",
            "created_by_user_id": "doctor_demo",
        },
    )
    assert response.status_code == 201
    return response.json()


def test_create_and_update_draft_consultation(client: TestClient):
    data = setup_booking(client)
    tenant_id = data["tenant"]["id"]
    appointment_id = data["booking"]["appointment"]["id"]

    consultation = create_consultation(client, tenant_id, appointment_id)
    updated = client.patch(
        f"/api/v1/consultations/{consultation['id']}",
        headers={"X-Tenant-ID": tenant_id},
        json={
            "diagnosis": "Viral fever",
            "clinical_notes": "Hydration advised",
            "prescription_text": "Paracetamol 500mg twice daily for 3 days",
            "lab_referral_text": "CBC if fever persists",
            "scan_referral_text": "No scan required",
            "follow_up_advice": "Review after 3 days",
        },
    )

    assert consultation["status"] == "draft"
    assert updated.status_code == 200
    assert updated.json()["status"] == "in_progress"
    assert updated.json()["diagnosis"] == "Viral fever"


def test_structured_consultation_rows_templates_and_signed_immutability(
    client: TestClient,
):
    data = setup_booking(client)
    tenant_id = data["tenant"]["id"]
    appointment_id = data["booking"]["appointment"]["id"]
    consultation = client.post(
        "/api/v1/consultations",
        headers={"X-Tenant-ID": tenant_id},
        json={
            "appointment_id": appointment_id,
            "vitals": [{"name": "BP", "value": "120/80", "unit": "mmHg"}],
            "complaints": [
                {"complaint": "Fever", "duration": "2 days", "severity": "medium"}
            ],
            "diagnoses": [{"diagnosis": "Viral fever", "diagnosis_type": "primary"}],
            "medicines": [
                {
                    "medicine_name": "Paracetamol",
                    "dosage": "500mg",
                    "frequency": "1-0-1",
                    "duration": "3 days",
                }
            ],
            "referrals": [
                {"referral_type": "lab", "item_name": "CBC", "priority": "routine"}
            ],
        },
    )
    template = client.post(
        "/api/v1/consultations/clinical-templates",
        headers={"X-Tenant-ID": tenant_id},
        json={
            "department_id": "general",
            "name": "Fever Template",
            "content": {"complaints": ["Fever"], "diagnoses": ["Viral fever"]},
        },
    )
    detail = client.get(
        f"/api/v1/consultations/{consultation.json()['id']}",
        headers={"X-Tenant-ID": tenant_id},
    )
    signed = client.post(
        f"/api/v1/consultations/{consultation.json()['id']}/sign",
        headers={"X-Tenant-ID": tenant_id},
        json={"signed_by_user_id": "doctor_demo"},
    )
    locked_update = client.patch(
        f"/api/v1/consultations/{consultation.json()['id']}",
        headers={"X-Tenant-ID": tenant_id},
        json={"vitals": [{"name": "Pulse", "value": "80"}]},
    )

    assert consultation.status_code == 201
    assert detail.json()["vitals"][0]["name"] == "BP"
    assert detail.json()["complaints"][0]["complaint"] == "Fever"
    assert detail.json()["medicines"][0]["medicine_name"] == "Paracetamol"
    assert template.status_code == 201
    assert template.json()["content"]["diagnoses"] == ["Viral fever"]
    assert signed.json()["status"] == "signed"
    assert locked_update.status_code == 409


def test_sign_locks_consultation_and_marks_queue_completed(client: TestClient):
    data = setup_booking(client)
    tenant_id = data["tenant"]["id"]
    appointment_id = data["booking"]["appointment"]["id"]
    entry_id = data["booking"]["queue_entry"]["id"]
    consultation = create_consultation(client, tenant_id, appointment_id)

    signed = client.post(
        f"/api/v1/consultations/{consultation['id']}/sign",
        headers={"X-Tenant-ID": tenant_id},
        json={"signed_by_user_id": "doctor_demo"},
    )
    edit_after_sign = client.patch(
        f"/api/v1/consultations/{consultation['id']}",
        headers={"X-Tenant-ID": tenant_id},
        json={"diagnosis": "Should not save"},
    )
    queue = client.get(
        "/api/v1/queue?include_completed=true",
        headers={"X-Tenant-ID": tenant_id},
    ).json()
    appointment = client.get(
        f"/api/v1/appointments/{appointment_id}",
        headers={"X-Tenant-ID": tenant_id},
    ).json()

    assert signed.status_code == 200
    assert signed.json()["status"] == "signed"
    assert signed.json()["signed_at"] is not None
    assert edit_after_sign.status_code == 409
    assert (
        edit_after_sign.json()["detail"] == "Signed consultation records are immutable"
    )
    assert appointment["status"] == "consultation_completed"
    assert [row for row in queue if row["id"] == entry_id][0][
        "status"
    ] == "consultation_completed"


def test_addendum_allowed_only_after_signing(client: TestClient):
    data = setup_booking(client)
    tenant_id = data["tenant"]["id"]
    appointment_id = data["booking"]["appointment"]["id"]
    consultation = create_consultation(client, tenant_id, appointment_id)

    too_early = client.post(
        f"/api/v1/consultations/{consultation['id']}/addendums",
        headers={"X-Tenant-ID": tenant_id},
        json={"note": "Correction before sign"},
    )
    client.post(
        f"/api/v1/consultations/{consultation['id']}/sign",
        headers={"X-Tenant-ID": tenant_id},
        json={"signed_by_user_id": "doctor_demo"},
    )
    addendum = client.post(
        f"/api/v1/consultations/{consultation['id']}/addendums",
        headers={"X-Tenant-ID": tenant_id},
        json={
            "note": "Patient later reported nausea",
            "created_by_user_id": "doctor_demo",
        },
    )
    detail = client.get(
        f"/api/v1/consultations/{consultation['id']}",
        headers={"X-Tenant-ID": tenant_id},
    )

    assert too_early.status_code == 409
    assert (
        too_early.json()["detail"]
        == "Addendums are only allowed after consultation is signed"
    )
    assert addendum.status_code == 201
    assert detail.status_code == 200
    assert detail.json()["addendums"][0]["note"] == "Patient later reported nausea"


def test_duplicate_consultation_for_appointment_is_rejected(client: TestClient):
    data = setup_booking(client)
    tenant_id = data["tenant"]["id"]
    appointment_id = data["booking"]["appointment"]["id"]
    create_consultation(client, tenant_id, appointment_id)

    duplicate = client.post(
        "/api/v1/consultations",
        headers={"X-Tenant-ID": tenant_id},
        json={"appointment_id": appointment_id},
    )

    assert duplicate.status_code == 409
    assert (
        duplicate.json()["detail"] == "Consultation already exists for this appointment"
    )


def test_consultation_access_is_tenant_isolated(client: TestClient):
    data = setup_booking(client)
    tenant_id = data["tenant"]["id"]
    appointment_id = data["booking"]["appointment"]["id"]
    consultation = create_consultation(client, tenant_id, appointment_id)
    other_tenant = client.post("/api/v1/tenants", json={"name": "Other Clinic"}).json()

    response = client.get(
        f"/api/v1/consultations/{consultation['id']}",
        headers={"X-Tenant-ID": other_tenant["id"]},
    )

    assert response.status_code == 404
    assert response.json()["detail"] == "Consultation not found"


def test_consultation_workflow_writes_audit_events(client: TestClient):
    data = setup_booking(client)
    tenant_id = data["tenant"]["id"]
    appointment_id = data["booking"]["appointment"]["id"]
    consultation = create_consultation(client, tenant_id, appointment_id)

    client.patch(
        f"/api/v1/consultations/{consultation['id']}",
        headers={"X-Tenant-ID": tenant_id},
        json={"diagnosis": "Viral fever"},
    )
    client.post(
        f"/api/v1/consultations/{consultation['id']}/sign",
        headers={"X-Tenant-ID": tenant_id},
        json={"signed_by_user_id": "doctor_demo"},
    )
    client.post(
        f"/api/v1/consultations/{consultation['id']}/addendums",
        headers={"X-Tenant-ID": tenant_id},
        json={"note": "Follow-up note", "created_by_user_id": "doctor_demo"},
    )

    audit = client.get(
        "/api/v1/audit-events", headers={"X-Tenant-ID": tenant_id}
    ).json()
    actions = [event["action"] for event in audit]

    assert "consultation.created" in actions
    assert "consultation.updated" in actions
    assert "consultation.signed" in actions
    assert "consultation.addendum.created" in actions
