import json
from datetime import date

from sqlmodel import Session, select

from app.modules.audit.models import AuditEvent
from app.modules.billing.models import TaxRule
from app.modules.patients.models import Gender, Patient
from app.modules.physiotherapy.models import PhysiotherapyCase
from app.modules.subscriptions.models import SubscriptionPlan, TenantSubscription
from app.modules.tenants.models import Branch, Tenant, TenantStatus


def seed_physio_tenant(test_engine):
    with Session(test_engine) as session:
        tenant = Tenant(name="Physio Demo Clinic", status=TenantStatus.ACTIVE)
        session.add(tenant)
        session.commit()
        session.refresh(tenant)
        branch = Branch(tenant_id=tenant.id, name="Rehab Branch", code="RHB")
        patient = Patient(
            tenant_id=tenant.id,
            branch_id=branch.id,
            patient_number="PHY-PT-001",
            full_name="Physio Demo Patient",
            mobile="9876500020",
            gender=Gender.FEMALE,
        )
        plan = SubscriptionPlan(
            key="physio_demo_plan",
            name="Physio Demo Plan",
            enabled_modules_json=json.dumps(["patients", "appointments", "billing_basic", "physiotherapy"]),
        )
        session.add(branch)
        session.add(patient)
        session.add(plan)
        session.commit()
        session.refresh(branch)
        session.refresh(patient)
        session.refresh(plan)
        session.add(TaxRule(tenant_id=tenant.id, branch_id=branch.id, name="Physio GST", tax_percentage=5))
        session.commit()
        session.add(TenantSubscription(tenant_id=tenant.id, plan_id=plan.id, starts_on=date.today(), is_active=True))
        session.commit()
        return tenant.id, branch.id, patient.id


def test_physiotherapy_case_session_equipment_and_invoice(client, test_engine):
    tenant_id, branch_id, patient_id = seed_physio_tenant(test_engine)
    headers = {"X-Tenant-ID": tenant_id}

    equipment = client.post(
        "/api/v1/physiotherapy/equipment",
        headers=headers,
        json={"branch_id": branch_id, "name": "HMS DIGISTIM 202", "modality_type": "muscle_stimulator", "manufacturer": "HMS", "is_portable": True},
    )
    assert equipment.status_code == 201

    case = client.post(
        "/api/v1/physiotherapy/cases",
        headers=headers,
        json={
            "branch_id": branch_id,
            "patient_id": patient_id,
            "care_context": "op",
            "body_region": "Knee",
            "condition": "Post injury stiffness",
            "pain_score": 7,
            "planned_sessions": 6,
            "treatment_goal": "Pain relief and range of motion improvement",
        },
    )
    assert case.status_code == 201
    case_body = case.json()
    assert case_body["case_number"].startswith("PHY-")

    session = client.post(
        f"/api/v1/physiotherapy/cases/{case_body['id']}/sessions",
        headers=headers,
        json={
            "equipment_id": equipment.json()["id"],
            "modality_type": "muscle_stimulator",
            "treatment_area": "Knee",
            "duration_minutes": 20,
            "pre_pain_score": 7,
            "post_pain_score": 5,
            "exercises": "ROM and quadriceps strengthening",
            "charge_amount": 800,
        },
    )
    assert session.status_code == 201
    assert session.json()["session_number"] == 1

    invoice = client.post(
        f"/api/v1/physiotherapy/cases/{case_body['id']}/invoice",
        headers=headers,
        json={"discount_amount": 100},
    )
    assert invoice.status_code == 201
    assert invoice.json()["invoice"]["physiotherapy_case_id"] == case_body["id"]
    assert invoice.json()["invoice"]["subtotal_amount"] == 800
    assert invoice.json()["invoice"]["discount_amount"] == 100
    assert invoice.json()["invoice"]["tax_amount"] == 35
    assert invoice.json()["invoice"]["total_amount"] == 735
    assert invoice.json()["items"][0]["item_type"] == "physiotherapy"

    payment = client.post(
        f"/api/v1/billing/invoices/{invoice.json()['invoice']['id']}/payments",
        headers=headers,
        json={"method": "cash", "amount": 735},
    )
    assert payment.status_code == 201

    fetched_invoice = client.get(f"/api/v1/physiotherapy/cases/{case_body['id']}/invoice", headers=headers)
    assert fetched_invoice.status_code == 200
    assert fetched_invoice.json()["invoice"]["balance_amount"] == 0
    assert fetched_invoice.json()["payments"][0]["amount"] == 735

    with Session(test_engine) as db:
        case_row = db.get(PhysiotherapyCase, case_body["id"])
        assert case_row.body_region == "Knee"
        actions = {row.action for row in db.exec(select(AuditEvent).where(AuditEvent.tenant_id == tenant_id)).all()}
        assert "physiotherapy_case.created" in actions
        assert "physiotherapy_invoice.generated" in actions
