import json
from datetime import date

from sqlmodel import Session, select

from app.modules.audit.models import AuditEvent
from app.modules.ip.models import IPAdmission
from app.modules.patients.models import Gender, Patient
from app.modules.subscriptions.models import SubscriptionPlan, TenantSubscription
from app.modules.tenants.models import Branch, Tenant, TenantStatus


def seed_ip_tenant(test_engine):
    with Session(test_engine) as session:
        tenant = Tenant(name="IP Demo Hospital", status=TenantStatus.ACTIVE)
        session.add(tenant)
        session.commit()
        session.refresh(tenant)
        branch = Branch(tenant_id=tenant.id, name="Main Hospital", code="MH")
        patient = Patient(
            tenant_id=tenant.id,
            branch_id=branch.id,
            patient_number="IP-PT-001",
            full_name="IP Demo Patient",
            mobile="9876500010",
            gender=Gender.MALE,
        )
        plan = SubscriptionPlan(
            key="ip_demo_plan",
            name="IP Demo Plan",
            monthly_patient_limit=100,
            included_branches=2,
            included_doctors=5,
            enabled_modules_json=json.dumps(["patients", "appointments", "consultations", "billing_basic", "ip"]),
        )
        session.add(branch)
        session.add(patient)
        session.add(plan)
        session.commit()
        session.refresh(branch)
        session.refresh(patient)
        session.refresh(plan)
        session.add(TenantSubscription(tenant_id=tenant.id, plan_id=plan.id, starts_on=date.today(), is_active=True))
        session.commit()
        return tenant.id, branch.id, patient.id


def test_ip_admission_treatment_consent_discharge_and_invoice(client, test_engine):
    tenant_id, branch_id, patient_id = seed_ip_tenant(test_engine)
    headers = {"X-Tenant-ID": tenant_id}

    admission = client.post(
        "/api/v1/ip/admissions",
        headers=headers,
        json={
            "branch_id": branch_id,
            "patient_id": patient_id,
            "ward": "General Ward",
            "bed": "G1",
            "reason": "Fever observation",
            "provisional_diagnosis": "Viral fever",
        },
    )
    assert admission.status_code == 201
    admission_body = admission.json()
    assert admission_body["admission_number"].startswith("IP-")
    assert admission_body["status"] == "admitted"

    treatment = client.post(
        f"/api/v1/ip/admissions/{admission_body['id']}/treatments",
        headers=headers,
        json={"notes": "Vitals monitored every 4 hours", "orders": "CBC and hydration"},
    )
    assert treatment.status_code == 201

    consultation = client.post(
        f"/api/v1/ip/admissions/{admission_body['id']}/consultations",
        headers=headers,
        json={"complaints": "Fever", "diagnosis": "Viral fever", "notes": "Continue observation"},
    )
    assert consultation.status_code == 201
    signed = client.post(f"/api/v1/ip/consultations/{consultation.json()['id']}/sign", headers=headers)
    assert signed.status_code == 200
    assert signed.json()["status"] == "signed"

    consent = client.post(
        f"/api/v1/ip/admissions/{admission_body['id']}/consents",
        headers=headers,
        json={"title": "Admission Consent", "content": "Consent received for admission."},
    )
    assert consent.status_code == 201
    consent_signed = client.post(f"/api/v1/ip/consents/{consent.json()['id']}/sign", headers=headers)
    assert consent_signed.status_code == 200
    assert consent_signed.json()["status"] == "signed"

    charge = client.post(
        f"/api/v1/ip/admissions/{admission_body['id']}/charges",
        headers=headers,
        json={"charge_type": "room", "description": "Room charge", "quantity": 2, "unit_amount": 1500},
    )
    assert charge.status_code == 201
    assert charge.json()["total_amount"] == 3000

    invoice = client.post(f"/api/v1/ip/admissions/{admission_body['id']}/invoice", headers=headers)
    assert invoice.status_code == 201
    assert invoice.json()["invoice"]["ip_admission_id"] == admission_body["id"]
    assert invoice.json()["invoice"]["total_amount"] == 3000

    discharge = client.post(
        f"/api/v1/ip/admissions/{admission_body['id']}/discharge-summary",
        headers=headers,
        json={"final_diagnosis": "Recovered viral fever", "follow_up_advice": "Review after 3 days"},
    )
    assert discharge.status_code == 201
    finalized = client.post(f"/api/v1/ip/discharge-summaries/{discharge.json()['id']}/finalize", headers=headers)
    assert finalized.status_code == 200
    assert finalized.json()["status"] == "finalized"

    with Session(test_engine) as session:
        admission_row = session.get(IPAdmission, admission_body["id"])
        assert admission_row.status == "discharged"
        actions = {row.action for row in session.exec(select(AuditEvent).where(AuditEvent.tenant_id == tenant_id)).all()}
        assert "ip_admission.created" in actions
        assert "ip_invoice.generated" in actions


def test_ip_room_availability_and_auto_room_invoice(client, test_engine):
    tenant_id, branch_id, patient_id = seed_ip_tenant(test_engine)
    headers = {"X-Tenant-ID": tenant_id}
    room = client.post(
        "/api/v1/ip/rooms",
        headers=headers,
        json={
            "branch_id": branch_id,
            "ward_type": "general",
            "ward_name": "General Ward",
            "room_type": "shared",
            "room_number": "GW-001",
            "bed_number": "B1",
            "daily_rate": 1200,
        },
    )
    assert room.status_code == 201
    room_body = room.json()

    admission = client.post(
        "/api/v1/ip/admissions",
        headers=headers,
        json={
            "branch_id": branch_id,
            "patient_id": patient_id,
            "room_id": room_body["id"],
            "ward": "General Ward",
            "room": "GW-001",
            "bed": "B1",
            "admission_date": "2026-05-11",
            "expected_discharge_date": "2026-05-13",
        },
    )
    assert admission.status_code == 201
    assert admission.json()["room_id"] == room_body["id"]

    availability = client.get(
        "/api/v1/ip/rooms?branch_id="
        f"{branch_id}&available_from=2026-05-12&available_to=2026-05-12",
        headers=headers,
    )
    assert availability.status_code == 200
    assert availability.json()[0]["available"] is False
    assert availability.json()[0]["occupied_admission_id"] == admission.json()["id"]

    duplicate = client.post(
        "/api/v1/ip/admissions",
        headers=headers,
        json={
            "branch_id": branch_id,
            "patient_id": patient_id,
            "room_id": room_body["id"],
            "ward": "General Ward",
            "room": "GW-001",
            "bed": "B1",
            "admission_date": "2026-05-12",
            "expected_discharge_date": "2026-05-12",
        },
    )
    assert duplicate.status_code == 409
    assert duplicate.json()["detail"] == "Selected room/bed is not available for this date range"

    discharge = client.post(
        f"/api/v1/ip/admissions/{admission.json()['id']}/discharge-summary",
        headers=headers,
        json={"discharge_date": "2026-05-13", "final_diagnosis": "Recovered"},
    )
    assert discharge.status_code == 201
    invoice = client.post(f"/api/v1/ip/admissions/{admission.json()['id']}/invoice", headers=headers)
    assert invoice.status_code == 201
    assert invoice.json()["invoice"]["total_amount"] == 3600
    assert invoice.json()["items"][0]["item_type"] == "ip_room"
    assert invoice.json()["items"][0]["quantity"] == 3


def test_ip_consultation_and_medication_events_create_running_bill(client, test_engine):
    tenant_id, branch_id, patient_id = seed_ip_tenant(test_engine)
    headers = {"X-Tenant-ID": tenant_id}
    admission = client.post(
        "/api/v1/ip/admissions",
        headers=headers,
        json={
            "branch_id": branch_id,
            "patient_id": patient_id,
            "ward": "General Ward",
            "bed": "G2",
            "reason": "IP observation",
        },
    )
    assert admission.status_code == 201
    admission_id = admission.json()["id"]

    consultation = client.post(
        f"/api/v1/ip/admissions/{admission_id}/consultations",
        headers=headers,
        json={
            "consultation_type": "morning_round",
            "fee_amount": 500,
            "complaints": "Fever",
            "diagnosis": "Viral fever",
            "notes": "Morning round completed",
        },
    )
    assert consultation.status_code == 201
    signed = client.post(f"/api/v1/ip/consultations/{consultation.json()['id']}/sign", headers=headers)
    assert signed.status_code == 200
    assert signed.json()["billing_item_id"]

    order = client.post(
        f"/api/v1/ip/admissions/{admission_id}/medication-orders",
        headers=headers,
        json={"medicine_name": "Paracetamol", "dosage": "500 mg", "frequency": "1-1-1", "route": "oral", "unit_amount": 15},
    )
    assert order.status_code == 201
    administration = client.post(
        f"/api/v1/ip/admissions/{admission_id}/medication-orders/{order.json()['id']}/administrations",
        headers=headers,
        json={"quantity": 3, "status": "given", "notes": "Three doses administered"},
    )
    assert administration.status_code == 201
    assert administration.json()["billing_item_id"]

    running_bill = client.get(f"/api/v1/ip/admissions/{admission_id}/billing-items", headers=headers)
    assert running_bill.status_code == 200
    assert sum(row["total_amount"] for row in running_bill.json()) == 545
    assert {row["source_type"] for row in running_bill.json()} == {"doctor_consultation", "medication_administration"}

    invoice = client.post(f"/api/v1/ip/admissions/{admission_id}/invoice", headers=headers)
    assert invoice.status_code == 201
    assert invoice.json()["invoice"]["total_amount"] == 545
    assert {row["item_type"] for row in invoice.json()["items"]} == {"ip_doctor_consultation", "ip_medication_administration"}


def test_ip_invoice_refreshes_existing_invoice_when_running_bill_changes(client, test_engine):
    tenant_id, branch_id, patient_id = seed_ip_tenant(test_engine)
    headers = {"X-Tenant-ID": tenant_id}
    room = client.post(
        "/api/v1/ip/rooms",
        headers=headers,
        json={
            "branch_id": branch_id,
            "ward_type": "general",
            "ward_name": "General Ward",
            "room_type": "shared",
            "room_number": "GW-010",
            "bed_number": "A",
            "daily_rate": 800,
        },
    )
    assert room.status_code == 201
    admission = client.post(
        "/api/v1/ip/admissions",
        headers=headers,
        json={
            "branch_id": branch_id,
            "patient_id": patient_id,
            "room_id": room.json()["id"],
            "ward": "General Ward",
            "room": "GW-010",
            "bed": "A",
            "admission_date": "2026-05-11",
            "expected_discharge_date": "2026-05-13",
        },
    )
    assert admission.status_code == 201
    admission_id = admission.json()["id"]

    room_only_invoice = client.post(f"/api/v1/ip/admissions/{admission_id}/invoice", headers=headers)
    assert room_only_invoice.status_code == 201
    assert room_only_invoice.json()["invoice"]["total_amount"] == 2400

    charge = client.post(
        f"/api/v1/ip/admissions/{admission_id}/billing-items",
        headers=headers,
        json={"source_type": "lab_referral", "description": "LAB - CBC", "quantity": 1, "unit_amount": 350},
    )
    assert charge.status_code == 201
    refreshed_invoice = client.post(f"/api/v1/ip/admissions/{admission_id}/invoice", headers=headers)
    assert refreshed_invoice.status_code == 201
    assert refreshed_invoice.json()["invoice"]["id"] == room_only_invoice.json()["invoice"]["id"]
    assert refreshed_invoice.json()["invoice"]["total_amount"] == 2750
    assert {row["item_type"] for row in refreshed_invoice.json()["items"]} == {"ip_room", "ip_lab_referral"}


def test_discharged_ip_admission_rejects_new_items_and_invoice_refresh(client, test_engine):
    tenant_id, branch_id, patient_id = seed_ip_tenant(test_engine)
    headers = {"X-Tenant-ID": tenant_id}
    admission = client.post(
        "/api/v1/ip/admissions",
        headers=headers,
        json={"branch_id": branch_id, "patient_id": patient_id, "ward": "General Ward", "bed": "G3"},
    )
    assert admission.status_code == 201
    admission_id = admission.json()["id"]
    charge = client.post(
        f"/api/v1/ip/admissions/{admission_id}/billing-items",
        headers=headers,
        json={"source_type": "procedure", "description": "Procedure", "quantity": 1, "unit_amount": 500},
    )
    assert charge.status_code == 201
    invoice = client.post(f"/api/v1/ip/admissions/{admission_id}/invoice", headers=headers)
    assert invoice.status_code == 201
    discharge = client.post(
        f"/api/v1/ip/admissions/{admission_id}/discharge-summary",
        headers=headers,
        json={"final_diagnosis": "Recovered"},
    )
    assert discharge.status_code == 201
    finalized = client.post(f"/api/v1/ip/discharge-summaries/{discharge.json()['id']}/finalize", headers=headers)
    assert finalized.status_code == 200

    late_item = client.post(
        f"/api/v1/ip/admissions/{admission_id}/billing-items",
        headers=headers,
        json={"source_type": "lab_referral", "description": "Late LAB", "quantity": 1, "unit_amount": 350},
    )
    assert late_item.status_code == 409
    assert late_item.json()["detail"] == "IP admission is closed; no more clinical or billing changes are allowed"

    refresh_after_discharge = client.post(f"/api/v1/ip/admissions/{admission_id}/invoice", headers=headers)
    assert refresh_after_discharge.status_code == 409
