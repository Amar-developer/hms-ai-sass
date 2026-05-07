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
