import json
from datetime import date

from sqlmodel import Session, select

from app.modules.audit.models import AuditEvent
from app.modules.billing.models import Invoice
from app.modules.home_care.models import HomeCareBooking
from app.modules.patients.models import Gender, Patient
from app.modules.subscriptions.models import SubscriptionPlan, TenantSubscription
from app.modules.tenants.models import Branch, Tenant, TenantStatus


def seed_home_care_tenant(test_engine):
    with Session(test_engine) as session:
        tenant = Tenant(name="Home Care Demo Clinic", status=TenantStatus.ACTIVE)
        session.add(tenant)
        session.commit()
        session.refresh(tenant)

        branch = Branch(tenant_id=tenant.id, name="Home Care Branch", code="HCB")
        patient = Patient(
            tenant_id=tenant.id,
            branch_id=branch.id,
            patient_number="HC-PT-001",
            full_name="Home Care Patient",
            mobile="9876500040",
            gender=Gender.FEMALE,
        )
        plan = SubscriptionPlan(
            key="home_care_demo_plan",
            name="Home Care Demo Plan",
            enabled_modules_json=json.dumps(["patients", "billing_basic", "home_care"]),
        )
        session.add(branch)
        session.add(patient)
        session.add(plan)
        session.commit()
        session.refresh(branch)
        session.refresh(patient)
        session.refresh(plan)

        session.add(
            TenantSubscription(
                tenant_id=tenant.id,
                plan_id=plan.id,
                starts_on=date.today(),
                is_active=True,
            )
        )
        session.commit()
        return tenant.id, branch.id, patient.id


def test_home_care_service_booking_invoice_payment_and_audit(client, test_engine):
    tenant_id, branch_id, patient_id = seed_home_care_tenant(test_engine)
    headers = {"X-Tenant-ID": tenant_id}

    service = client.post(
        "/api/v1/home-care/services",
        headers=headers,
        json={
            "branch_id": branch_id,
            "name": "Nursing Visit",
            "description": "Daily vitals and medication support",
            "default_price": 1200,
        },
    )
    assert service.status_code == 201
    service_body = service.json()
    assert service_body["code"].startswith("HC-NURSIN-")

    service_update = client.patch(
        f"/api/v1/home-care/services/{service_body['id']}",
        headers=headers,
        json={"default_price": 1500},
    )
    assert service_update.status_code == 200
    assert service_update.json()["default_price"] == 1500

    services = client.get(
        f"/api/v1/home-care/services?branch_id={branch_id}", headers=headers
    )
    assert services.status_code == 200
    assert [row["id"] for row in services.json()] == [service_body["id"]]

    booking = client.post(
        "/api/v1/home-care/bookings",
        headers=headers,
        json={
            "branch_id": branch_id,
            "patient_id": patient_id,
            "assigned_staff_name": "Nurse Lakshmi",
            "staff_type": "nurse",
            "booking_type": "home_care",
            "recurrence": "Daily",
            "start_date": date.today().isoformat(),
            "end_date": date.today().isoformat(),
            "location": "12 Home Street, Chennai",
            "complaints": "Post-discharge support",
            "services": [
                {"service_id": service_body["id"], "quantity": 2},
                {
                    "service_category": "home_care_service",
                    "description": "Manual attender support",
                    "quantity": 1,
                    "unit_amount": 500,
                },
            ],
        },
    )
    assert booking.status_code == 201
    booking_body = booking.json()
    assert booking_body["booking_number"].startswith("HC-")
    assert booking_body["status"] == "requested"
    assert booking_body["location"] == "12 Home Street, Chennai"
    assert booking_body["services"][0]["description"] == "Nursing Visit"
    assert booking_body["services"][0]["service_category"] == "home_care_service"
    assert booking_body["services"][0]["unit_amount"] == 1500
    assert booking_body["services"][0]["total_amount"] == 3000
    assert booking_body["services"][1]["service_id"] is None
    assert booking_body["services"][1]["service_category"] == "home_care_service"
    assert booking_body["services"][1]["description"] == "Manual attender support"

    booking_update = client.patch(
        f"/api/v1/home-care/bookings/{booking_body['id']}",
        headers=headers,
        json={
            "status": "Scheduled",
            "location": "Manual visit location",
            "notes": "Start tomorrow morning",
            "services": [
                {
                    "service_category": "home_care_service",
                    "description": "Manual nursing care",
                    "quantity": 1,
                    "unit_amount": 1400,
                }
            ],
        },
    )
    assert booking_update.status_code == 200
    assert booking_update.json()["status"] == "scheduled"
    assert booking_update.json()["location"] == "Manual visit location"
    assert booking_update.json()["services"][0]["total_amount"] == 1400
    assert (
        booking_update.json()["services"][0]["service_category"] == "home_care_service"
    )

    missed_visit = client.post(
        f"/api/v1/home-care/bookings/{booking_body['id']}/visits",
        headers=headers,
        json={
            "visit_date": str(date.today()),
            "assigned_staff_name": "Nurse Lakshmi",
            "staff_type": "nurse",
            "service_category": "home_care_service",
            "description": "Patient unavailable",
            "quantity": 8,
            "unit_amount": 1000,
            "status": "missed",
        },
    )
    assert missed_visit.status_code == 201
    assert missed_visit.json()["total_amount"] == 0

    completed_visit = client.post(
        f"/api/v1/home-care/bookings/{booking_body['id']}/visits",
        headers=headers,
        json={
            "visit_date": str(date.today()),
            "assigned_staff_name": "Nurse Meena",
            "staff_type": "nurse",
            "service_category": "home_care_service",
            "description": "Manual nursing care",
            "quantity": 2,
            "unit_amount": 500,
            "status": "completed",
        },
    )
    assert completed_visit.status_code == 201
    assert completed_visit.json()["total_amount"] == 500

    bookings = client.get(
        f"/api/v1/home-care/bookings?branch_id={branch_id}&patient_id={patient_id}&status_filter=scheduled",
        headers=headers,
    )
    assert bookings.status_code == 200
    assert [row["id"] for row in bookings.json()] == [booking_body["id"]]
    assert len(bookings.json()[0]["visit_logs"]) == 2

    offer = client.post(
        "/api/v1/billing/discount-offers",
        headers=headers,
        json={
            "branch_id": branch_id,
            "name": "Home Care Concession",
            "service_scope": "home_care",
            "discount_type": "fixed",
            "value": 100,
        },
    )
    assert offer.status_code == 201

    invoice = client.post(
        f"/api/v1/home-care/bookings/{booking_body['id']}/invoice",
        headers=headers,
        json={"discount_offer_id": offer.json()["id"]},
    )
    assert invoice.status_code == 201
    invoice_body = invoice.json()
    assert invoice_body["invoice"]["home_care_booking_id"] == booking_body["id"]
    assert invoice_body["invoice"]["subtotal_amount"] == 500
    assert invoice_body["invoice"]["discount_amount"] == 100
    assert invoice_body["invoice"]["total_amount"] == 400
    assert invoice_body["items"][0]["item_type"] == "home_care"
    assert invoice_body["items"][0]["total_amount"] == 500
    assert invoice_body["items"][0]["external_slug"] == "home_care_service"
    assert (
        invoice_body["items"][0]["external_item_code"] == completed_visit.json()["id"]
    )

    locked_update = client.patch(
        f"/api/v1/home-care/bookings/{booking_body['id']}",
        headers=headers,
        json={"notes": "Should not update after invoice"},
    )
    assert locked_update.status_code == 409

    fetched_invoice = client.get(
        f"/api/v1/home-care/bookings/{booking_body['id']}/invoice", headers=headers
    )
    assert fetched_invoice.status_code == 200
    assert fetched_invoice.json()["invoice"]["id"] == invoice_body["invoice"]["id"]

    payment = client.post(
        f"/api/v1/billing/invoices/{invoice_body['invoice']['id']}/payments",
        headers=headers,
        json={"method": "cash", "amount": 400},
    )
    assert payment.status_code == 201

    paid_invoice = client.get(
        f"/api/v1/home-care/bookings/{booking_body['id']}/invoice", headers=headers
    )
    assert paid_invoice.status_code == 200
    assert paid_invoice.json()["invoice"]["balance_amount"] == 0

    with Session(test_engine) as db:
        booking_row = db.get(HomeCareBooking, booking_body["id"])
        invoice_row = db.get(Invoice, invoice_body["invoice"]["id"])
        actions = {
            row.action
            for row in db.exec(
                select(AuditEvent).where(AuditEvent.tenant_id == tenant_id)
            ).all()
        }
        assert booking_row.status == "paid"
        assert invoice_row.home_care_booking_id == booking_body["id"]
        assert "home_care_service.created" in actions
        assert "home_care_booking.created" in actions
        assert "home_care_invoice.generated" in actions


def test_home_care_service_soft_delete_hides_from_list(client, test_engine):
    tenant_id, branch_id, _patient_id = seed_home_care_tenant(test_engine)
    headers = {"X-Tenant-ID": tenant_id}

    service = client.post(
        "/api/v1/home-care/services",
        headers=headers,
        json={"branch_id": branch_id, "name": "Attender Visit", "default_price": 800},
    ).json()

    deleted = client.delete(
        f"/api/v1/home-care/services/{service['id']}", headers=headers
    )
    listed = client.get("/api/v1/home-care/services", headers=headers)

    assert deleted.status_code == 200
    assert deleted.json()["is_active"] is False
    assert all(row["id"] != service["id"] for row in listed.json())
