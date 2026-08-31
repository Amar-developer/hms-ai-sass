import json
from datetime import date
from decimal import Decimal

from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app.modules.appointments.models import Appointment, AppointmentType
from app.core.list_filters import parse_list_filters, parse_list_sort
from app.modules.billing.models import (
    DoctorFeeRule,
    Invoice,
    InvoiceItem,
    InvoiceStatus,
)
from app.modules.billing.repositories.read_repository import BillingReadRepository
from app.modules.billing.services.consultation_invoice import (
    consultation_item_description,
    doctor_share_after_patient_benefits,
)
from app.modules.billing.services.rules import calculate_fee_split
from app.modules.billing.services.service_invoices import create_service_invoice
from app.modules.identity.models import User
from app.modules.patients.models import Patient
from app.modules.tenants.models import Branch, Department, Tenant


def test_full_membership_benefit_preserves_contractual_doctor_share():
    calculation = calculate_fee_split(
        DoctorFeeRule(
            tenant_id="tenant_doctor_cost",
            appointment_type=AppointmentType.OP,
            fee_amount=1000,
            doctor_share_percentage=60,
        )
    )

    doctor_share = doctor_share_after_patient_benefits(
        calculation,
        subtotal=calculation.consultation_amount,
        taxable=0,
        total=0,
        membership_discount=1000,
    )

    assert doctor_share == 600


def test_consultation_item_description_uses_department_and_safe_fallback(test_engine):
    with Session(test_engine) as session:
        department = Department(
            tenant_id="tenant_invoice_description",
            name="General Surgery",
            code="GENERAL_SURGERY",
        )
        session.add(department)
        session.commit()
        session.refresh(department)
        appointment = Appointment(
            tenant_id="tenant_invoice_description",
            branch_id="branch_invoice_description",
            patient_id="patient_invoice_description",
            department_id=department.id,
            appointment_date=date.today(),
        )

        assert (
            consultation_item_description(session, appointment=appointment)
            == "General Surgery Consultation"
        )

        department.name = "Gynecologist"
        assert (
            consultation_item_description(session, appointment=appointment)
            == "Gynecologist Consultation"
        )

        appointment.department_id = "missing_department"
        assert (
            consultation_item_description(
                session,
                appointment=appointment,
                treatment_type="general_consultation",
            )
            == "General Consultation"
        )


def test_service_invoice_line_prices_fallback_from_total_amount(test_engine):
    with Session(test_engine) as session:
        invoice = create_service_invoice(
            session,
            tenant_id="tenant_receipt_prices",
            branch_id="branch_receipt_prices",
            patient_id="patient_receipt_prices",
            appointment_id=None,
            consultation_id=None,
            item_type="lab",
            description="Beta HCG",
            amount=700,
            created_by_user_id="billing_user",
            service_scope="lab",
            record_billing_ledger=lambda *args, **kwargs: None,
            ensure_invoice_membership_benefit_ledger=lambda *args, **kwargs: None,
            line_items=[
                {
                    "item_type": "lab",
                    "description": "Beta HCG",
                    "quantity": 2,
                    "total_amount": 700,
                }
            ],
        )
        item = session.exec(
            select(InvoiceItem).where(InvoiceItem.invoice_id == invoice.id)
        ).one()

    assert item.quantity == 2
    assert item.unit_amount == 350
    assert item.selling_amount == 350
    assert item.mrp_amount == 0
    assert item.total_amount == 700


def test_service_invoice_posts_full_multiline_total_to_ledger(test_engine):
    ledger_entries: list[dict] = []

    def capture_ledger(*_args, **kwargs):
        ledger_entries.append(kwargs)

    with Session(test_engine) as session:
        invoice = create_service_invoice(
            session,
            tenant_id="tenant_multiline_ledger",
            branch_id="branch_multiline_ledger",
            patient_id="patient_multiline_ledger",
            appointment_id=None,
            consultation_id=None,
            item_type="lab",
            description="Lab order",
            amount=700,
            created_by_user_id="billing_user",
            service_scope="lab",
            record_billing_ledger=capture_ledger,
            ensure_invoice_membership_benefit_ledger=lambda *_args, **_kwargs: None,
            line_items=[
                {
                    "item_type": "lab",
                    "description": "CBC",
                    "quantity": 1,
                    "total_amount": 300,
                },
                {
                    "item_type": "lab",
                    "description": "Thyroid panel",
                    "quantity": 1,
                    "total_amount": 400,
                },
            ],
        )

    assert invoice.total_amount == 700
    assert len(ledger_entries) == 1
    assert ledger_entries[0]["debit_amount"] == 700
    assert ledger_entries[0]["invoice_total_delta"] == 700
    assert ledger_entries[0]["balance_amount_delta"] == 700
    assert ledger_entries[0]["commit"] is False


def test_billing_invoice_repository_applies_dynamic_filter_before_pagination(
    test_engine,
):
    with Session(test_engine) as session:
        tenant = Tenant(name="Billing Filter Clinic")
        session.add(tenant)
        session.commit()
        session.refresh(tenant)
        branch = Branch(tenant_id=tenant.id, name="Main Branch", code="MAIN")
        session.add(branch)
        session.commit()
        session.refresh(branch)
        first_patient = Patient(
            tenant_id=tenant.id,
            branch_id=branch.id,
            patient_number="PAT-BILL-1",
            full_name="Asha Billing",
            mobile="9000000101",
        )
        second_patient = Patient(
            tenant_id=tenant.id,
            branch_id=branch.id,
            patient_number="PAT-BILL-2",
            full_name="Ravi Billing",
            mobile="9000000102",
        )
        session.add(first_patient)
        session.add(second_patient)
        session.commit()
        session.refresh(first_patient)
        session.refresh(second_patient)
        session.add(
            Invoice(
                tenant_id=tenant.id,
                branch_id=branch.id,
                patient_id=first_patient.id,
                invoice_number="INV-BILL-1",
                total_amount=Decimal("500"),
                paid_amount=Decimal("0"),
                balance_amount=Decimal("500"),
            )
        )
        session.add(
            Invoice(
                tenant_id=tenant.id,
                branch_id=branch.id,
                patient_id=second_patient.id,
                invoice_number="INV-BILL-2",
                total_amount=Decimal("1200"),
                paid_amount=Decimal("1200"),
                balance_amount=Decimal("0"),
            )
        )
        session.commit()

        repo = BillingReadRepository(session)
        filters = parse_list_filters(
            json.dumps(
                [
                    {
                        "field": "patient_name",
                        "operator": "like",
                        "value": "asha",
                    }
                ]
            )
        )
        rows = repo.list_invoices(
            tenant_id=tenant.id,
            branch_id=None,
            patient_id=None,
            list_filters=filters,
            offset=0,
            limit=1,
        )
        total = repo.count_invoices(
            tenant_id=tenant.id,
            branch_id=None,
            patient_id=None,
            list_filters=filters,
        )

    assert total == 1
    assert [row.invoice_number for row in rows] == ["INV-BILL-1"]


def test_billing_invoice_repository_applies_dynamic_sort_before_pagination(
    test_engine,
):
    with Session(test_engine) as session:
        tenant = Tenant(name="Billing Sort Clinic")
        session.add(tenant)
        session.commit()
        session.refresh(tenant)
        branch = Branch(tenant_id=tenant.id, name="Main Branch", code="MAIN")
        patient = Patient(
            tenant_id=tenant.id,
            branch_id=branch.id,
            patient_number="PAT-BILL-SORT",
            full_name="Sort Patient",
            mobile="9000000111",
        )
        session.add(branch)
        session.add(patient)
        session.commit()
        session.refresh(branch)
        session.refresh(patient)
        session.add(
            Invoice(
                tenant_id=tenant.id,
                branch_id=branch.id,
                patient_id=patient.id,
                invoice_number="INV-SMALL",
                total_amount=Decimal("300"),
                paid_amount=Decimal("0"),
                balance_amount=Decimal("300"),
            )
        )
        session.add(
            Invoice(
                tenant_id=tenant.id,
                branch_id=branch.id,
                patient_id=patient.id,
                invoice_number="INV-LARGE",
                total_amount=Decimal("900"),
                paid_amount=Decimal("0"),
                balance_amount=Decimal("900"),
            )
        )
        session.commit()

        rows = BillingReadRepository(session).list_invoices(
            tenant_id=tenant.id,
            branch_id=None,
            patient_id=None,
            list_sort=parse_list_sort(
                json.dumps({"key": "total_amount", "dir": "desc"})
            ),
            offset=0,
            limit=1,
        )

    assert [row.invoice_number for row in rows] == ["INV-LARGE"]


def test_billing_invoice_filter_options_are_data_backed_and_branch_scoped(
    test_engine,
):
    with Session(test_engine) as session:
        tenant = Tenant(name="Billing Options Clinic")
        session.add(tenant)
        session.commit()
        session.refresh(tenant)
        main_branch = Branch(tenant_id=tenant.id, name="Main Branch", code="MAIN")
        side_branch = Branch(tenant_id=tenant.id, name="Side Branch", code="SIDE")
        main_patient = Patient(
            tenant_id=tenant.id,
            branch_id=main_branch.id,
            patient_number="PAT-BILL-OPT-1",
            full_name="Main Billing Patient",
            mobile="9000000301",
        )
        side_patient = Patient(
            tenant_id=tenant.id,
            branch_id=side_branch.id,
            patient_number="PAT-BILL-OPT-2",
            full_name="Side Billing Patient",
            mobile="9000000302",
        )
        session.add(main_branch)
        session.add(side_branch)
        session.add(main_patient)
        session.add(side_patient)
        session.commit()
        session.refresh(main_branch)
        session.refresh(side_branch)
        session.refresh(main_patient)
        session.refresh(side_patient)
        creator = User(
            tenant_id=tenant.id,
            branch_id=main_branch.id,
            name="Billing User",
            email="billing@example.test",
        )
        session.add(creator)
        session.commit()
        session.refresh(creator)
        creator_id = creator.id
        session.add(
            Invoice(
                tenant_id=tenant.id,
                branch_id=main_branch.id,
                patient_id=main_patient.id,
                invoice_number="INV-OPT-DIRECT",
                status=InvoiceStatus.PAID,
                created_by_user_id=creator_id,
                total_amount=Decimal("500"),
                paid_amount=Decimal("500"),
                balance_amount=Decimal("0"),
            )
        )
        session.add(
            Invoice(
                tenant_id=tenant.id,
                branch_id=side_branch.id,
                patient_id=side_patient.id,
                invoice_number="INV-OPT-LAB",
                status=InvoiceStatus.DRAFT,
                lab_order_id="lab_order_other_branch",
                total_amount=Decimal("700"),
                paid_amount=Decimal("0"),
                balance_amount=Decimal("700"),
            )
        )
        session.commit()

        options = BillingReadRepository(session).invoice_filter_options(
            tenant_id=tenant.id,
            branch_id=main_branch.id,
        )

    assert [row.value for row in options["source"]] == ["direct"]
    assert [row.value for row in options["status"]] == ["paid"]
    assert [row.model_dump() for row in options["created_by_user_id"]] == [
        {"value": creator_id, "label": "Billing User"}
    ]


def setup_signed_consultation(
    client: TestClient,
    appointment_type: str = "op",
    department_id: str | None = "general",
    treatment_type: str = "general_consultation",
    is_billable: bool = True,
    visit_purpose: str | None = None,
    department_name: str | None = None,
) -> dict:
    tenant = client.post("/api/v1/tenants", json={"name": "Billing Clinic"}).json()
    plans = client.get("/api/v1/subscription-plans").json()
    starter = next(plan for plan in plans if plan["key"] == "starter")
    client.post(
        "/api/v1/subscription-plans/tenant-subscriptions",
        headers={"X-Tenant-ID": tenant["id"]},
        json={
            "plan_id": starter["id"],
            "starts_on": date.today().isoformat(),
            "is_trial": False,
        },
    )
    branch = client.post(
        f"/api/v1/tenants/{tenant['id']}/branches",
        json={"name": "Main Branch", "code": "MAIN"},
    ).json()
    if department_name:
        department = client.post(
            f"/api/v1/tenants/{tenant['id']}/departments",
            headers={"X-Tenant-ID": tenant["id"]},
            json={"name": department_name},
        )
        assert department.status_code == 201
        department_id = department.json()["id"]
    patient = client.post(
        "/api/v1/patients",
        headers={"X-Tenant-ID": tenant["id"]},
        json={"full_name": "Ravi Kumar", "mobile": "9876543210", "age_years": 42},
    ).json()
    booking = client.post(
        "/api/v1/appointments",
        headers={"X-Tenant-ID": tenant["id"]},
        json={
            "branch_id": branch["id"],
            "patient_id": patient["id"],
            "appointment_type": appointment_type,
            "appointment_date": date.today().isoformat(),
            "practitioner_id": "doctor_demo",
            "department_id": department_id,
            "visit_purpose": visit_purpose,
            "is_billable": is_billable,
        },
    ).json()
    consultation = client.post(
        "/api/v1/consultations",
        headers={"X-Tenant-ID": tenant["id"]},
        json={
            "appointment_id": booking["appointment"]["id"],
            "treatment_type": treatment_type,
            "chief_complaint": "Fever and body pain",
            "diagnosis": "Viral fever",
            "clinical_notes": "Hydration advised",
            "prescription_text": "Paracetamol",
            "created_by_user_id": "doctor_demo",
        },
    ).json()
    signed = client.post(
        f"/api/v1/consultations/{consultation['id']}/sign",
        headers={"X-Tenant-ID": tenant["id"]},
        json={"signed_by_user_id": "doctor_demo"},
    )
    assert signed.status_code == 200
    return {
        "tenant": tenant,
        "branch": branch,
        "patient": patient,
        "booking": booking,
        "consultation": signed.json(),
    }


def create_fee_rule(
    client: TestClient,
    tenant_id: str,
    appointment_type: str,
    fee_amount: int,
    share_type: str = "percentage",
    doctor_share_percentage: int | None = 60,
    doctor_fixed_amount: int | None = None,
    branch_id: str | None = None,
    practitioner_id: str | None = None,
    department_id: str | None = None,
    treatment_type: str | None = None,
    share_tax_with_doctor: bool = False,
) -> dict:
    payload = {
        "appointment_type": appointment_type,
        "fee_amount": fee_amount,
        "share_type": share_type,
        "doctor_share_percentage": doctor_share_percentage,
        "doctor_fixed_amount": doctor_fixed_amount,
        "branch_id": branch_id,
        "practitioner_id": practitioner_id,
        "department_id": department_id,
        "treatment_type": treatment_type,
        "share_tax_with_doctor": share_tax_with_doctor,
    }
    response = client.post(
        "/api/v1/billing/doctor-fee-rules",
        headers={"X-Tenant-ID": tenant_id},
        json=payload,
    )
    assert response.status_code == 201
    return response.json()


def test_receptionist_can_list_create_and_open_consultation_invoices(
    client: TestClient,
):
    data = setup_signed_consultation(client, "op")
    tenant_id = data["tenant"]["id"]
    branch_id = data["branch"]["id"]
    create_fee_rule(
        client,
        tenant_id,
        "op",
        500,
        practitioner_id="doctor_demo",
    )

    email = f"receptionist.invoice.{tenant_id}@test.local"
    password = "Reception123"
    role_key = "invoice_receptionist"
    role = client.post(
        "/api/v1/identity/roles",
        headers={"X-Tenant-ID": tenant_id},
        json={
            "name": "Invoice Receptionist",
            "key": role_key,
            "permission_keys": [
                "billing.read",
                "invoices.read",
                "invoices.create",
                "payments.create",
            ],
        },
    )
    assert role.status_code == 201
    created = client.post(
        "/api/v1/identity/users",
        headers={"X-Tenant-ID": tenant_id},
        json={
            "name": "Receptionist Invoice User",
            "email": email,
            "password": password,
            "branch_id": branch_id,
            "role_keys": [role_key],
        },
    )
    assert created.status_code == 201

    login = client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": password, "tenant_id": tenant_id},
    )
    assert login.status_code == 200
    assert "invoices.read" in login.json()["user"]["permissions"]
    assert "invoices.create" in login.json()["user"]["permissions"]
    headers = {
        "Authorization": f"Bearer {login.cookies['access_token']}",
        "X-Tenant-ID": tenant_id,
    }

    invoice_list = client.get("/api/v1/billing/invoices", headers=headers)
    assert invoice_list.status_code == 200

    generated = client.post(
        "/api/v1/billing/invoices/from-consultation",
        headers=headers,
        json={"consultation_id": data["consultation"]["id"]},
    )
    assert generated.status_code == 201
    invoice_id = generated.json()["invoice"]["id"]

    detail = client.get(f"/api/v1/billing/invoices/{invoice_id}", headers=headers)
    assert detail.status_code == 200
    assert detail.json()["invoice"]["id"] == invoice_id

    payment = client.post(
        f"/api/v1/billing/invoices/{invoice_id}/payments",
        headers=headers,
        json={"method": "cash", "amount": 100},
    )
    assert payment.status_code == 201
    assert payment.json()["invoice"]["paid_amount"] == 100


def test_create_fee_rule_and_generate_op_invoice_with_percentage_split(
    client: TestClient,
):
    data = setup_signed_consultation(client, "op")
    tenant_id = data["tenant"]["id"]
    create_fee_rule(
        client,
        tenant_id,
        "op",
        500,
        doctor_share_percentage=60,
        practitioner_id="doctor_demo",
    )

    invoice_response = client.post(
        "/api/v1/billing/invoices/from-consultation",
        headers={"X-Tenant-ID": tenant_id},
        json={
            "consultation_id": data["consultation"]["id"],
            "created_by_user_id": "billing_user",
        },
    )

    assert invoice_response.status_code == 201
    detail = invoice_response.json()
    assert detail["invoice"]["invoice_number"] == "INV-000001"
    assert detail["invoice"]["total_amount"] == 500
    assert detail["invoice"]["doctor_share_amount"] == 300
    assert detail["invoice"]["clinic_share_amount"] == 200
    assert detail["items"][0]["description"] == "General Consultation"


def test_consultation_invoice_item_uses_appointment_department_name(
    client: TestClient,
):
    data = setup_signed_consultation(
        client,
        "op",
        treatment_type="general_consultation",
        department_name="General Surgery",
    )
    tenant_id = data["tenant"]["id"]
    appointment = data["booking"]["appointment"]
    create_fee_rule(
        client,
        tenant_id,
        "op",
        650,
        practitioner_id="doctor_demo",
        department_id=appointment["department_id"],
    )

    invoice = client.post(
        "/api/v1/billing/invoices/from-consultation",
        headers={"X-Tenant-ID": tenant_id},
        json={"consultation_id": data["consultation"]["id"]},
    )

    assert invoice.status_code == 201
    assert invoice.json()["items"][0]["description"] == ("General Surgery Consultation")


def test_doctor_fee_rules_allow_different_departments_but_reject_identical_context(
    client: TestClient,
):
    data = setup_signed_consultation(client, "op")
    tenant_id = data["tenant"]["id"]
    common = {
        "appointment_type": "op",
        "fee_amount": 650,
        "share_type": "percentage",
        "doctor_share_percentage": 60,
        "practitioner_id": "doctor_demo",
    }

    general = client.post(
        "/api/v1/billing/doctor-fee-rules",
        headers={"X-Tenant-ID": tenant_id},
        json={**common, "department_id": "general"},
    )
    orthopaedics = client.post(
        "/api/v1/billing/doctor-fee-rules",
        headers={"X-Tenant-ID": tenant_id},
        json={**common, "department_id": "orthopaedics", "fee_amount": 800},
    )
    duplicate = client.post(
        "/api/v1/billing/doctor-fee-rules",
        headers={"X-Tenant-ID": tenant_id},
        json={**common, "department_id": "general"},
    )

    assert general.status_code == 201
    assert orthopaedics.status_code == 201
    assert duplicate.status_code == 409
    assert (
        duplicate.json()["detail"]
        == "An identical active doctor fee rule already exists"
    )


def test_invoice_number_uses_configured_branch_prefix(client: TestClient):
    data = setup_signed_consultation(client, "op")
    tenant_id = data["tenant"]["id"]
    branch_id = data["branch"]["id"]
    create_fee_rule(client, tenant_id, "op", 500)
    client.put(
        "/api/v1/settings",
        headers={"X-Tenant-ID": tenant_id},
        json={
            "scope": "branch",
            "scope_id": branch_id,
            "module": "invoice",
            "key": "invoice.prefix",
            "value": "MZH",
        },
    )

    invoice_response = client.post(
        "/api/v1/billing/invoices/from-consultation",
        headers={"X-Tenant-ID": tenant_id},
        json={"consultation_id": data["consultation"]["id"]},
    )

    assert invoice_response.status_code == 201
    assert invoice_response.json()["invoice"]["invoice_number"] == "MZH-000001"


def test_home_visit_invoice_uses_fixed_doctor_payout(client: TestClient):
    data = setup_signed_consultation(client, "home_visit")
    tenant_id = data["tenant"]["id"]
    create_fee_rule(
        client,
        tenant_id,
        "home_visit",
        1500,
        share_type="fixed",
        doctor_share_percentage=None,
        doctor_fixed_amount=1000,
    )

    response = client.post(
        "/api/v1/billing/invoices/from-consultation",
        headers={"X-Tenant-ID": tenant_id},
        json={"consultation_id": data["consultation"]["id"]},
    )

    assert response.status_code == 201
    invoice = response.json()["invoice"]
    assert invoice["total_amount"] == 1500
    assert invoice["doctor_share_amount"] == 1000
    assert invoice["clinic_share_amount"] == 500


def test_discount_reduces_doctor_and_clinic_share_proportionally(client: TestClient):
    data = setup_signed_consultation(client, "op")
    tenant_id = data["tenant"]["id"]
    branch_id = data["branch"]["id"]
    create_fee_rule(client, tenant_id, "op", 1000, doctor_share_percentage=70)
    approval = client.post(
        "/api/v1/billing/discount-approvals",
        headers={"X-Tenant-ID": tenant_id},
        json={
            "branch_id": branch_id,
            "consultation_id": data["consultation"]["id"],
            "requested_amount": 200,
            "reason": "Owner approved concession",
        },
    ).json()
    client.post(
        f"/api/v1/billing/discount-approvals/{approval['id']}/decision",
        headers={"X-Tenant-ID": tenant_id},
        json={"status": "approved", "approved_by_user_id": "owner"},
    )

    response = client.post(
        "/api/v1/billing/invoices/from-consultation",
        headers={"X-Tenant-ID": tenant_id},
        json={
            "consultation_id": data["consultation"]["id"],
            "discount_amount": 200,
            "discount_approval_id": approval["id"],
        },
    )

    invoice = response.json()["invoice"]
    assert response.status_code == 201
    assert invoice["subtotal_amount"] == 1000
    assert invoice["total_amount"] == 800
    assert invoice["doctor_share_amount"] == 560
    assert invoice["clinic_share_amount"] == 240


def test_discount_requires_approved_request(client: TestClient):
    data = setup_signed_consultation(client, "op")
    tenant_id = data["tenant"]["id"]
    create_fee_rule(client, tenant_id, "op", 1000, doctor_share_percentage=70)

    response = client.post(
        "/api/v1/billing/invoices/from-consultation",
        headers={"X-Tenant-ID": tenant_id},
        json={"consultation_id": data["consultation"]["id"], "discount_amount": 200},
    )

    assert response.status_code == 409
    assert (
        response.json()["detail"]
        == "Approved discount approval is required for invoice discount"
    )


def test_tax_rule_applies_gst_to_invoice(client: TestClient):
    data = setup_signed_consultation(client, "op")
    tenant_id = data["tenant"]["id"]
    create_fee_rule(client, tenant_id, "op", 1000, doctor_share_percentage=60)
    tax_rule = client.post(
        "/api/v1/billing/tax-rules",
        headers={"X-Tenant-ID": tenant_id},
        json={"name": "GST 18", "tax_percentage": 18, "tax_label": "GST"},
    ).json()

    response = client.post(
        "/api/v1/billing/invoices/from-consultation",
        headers={"X-Tenant-ID": tenant_id},
        json={
            "consultation_id": data["consultation"]["id"],
            "tax_rule_id": tax_rule["id"],
        },
    )
    assert response.status_code == 201
    assert response.json()["invoice"]["tax_amount"] == 180
    assert response.json()["invoice"]["total_amount"] == 1180
    assert response.json()["invoice"]["doctor_share_amount"] == 600
    assert response.json()["invoice"]["clinic_share_amount"] == 580


def test_percentage_offer_is_applied_before_percentage_tax(client: TestClient):
    data = setup_signed_consultation(client, "op")
    tenant_id = data["tenant"]["id"]
    create_fee_rule(client, tenant_id, "op", 1000, doctor_share_percentage=60)
    offer = client.post(
        "/api/v1/billing/discount-offers",
        headers={"X-Tenant-ID": tenant_id},
        json={
            "name": "Consultation 10%",
            "service_scope": "consultation",
            "discount_type": "percentage",
            "value": 10,
        },
    ).json()
    tax_rule = client.post(
        "/api/v1/billing/tax-rules",
        headers={"X-Tenant-ID": tenant_id},
        json={
            "name": "GST 18",
            "tax_percentage": 18,
            "tax_label": "GST",
            "service_scope": "consultation",
        },
    ).json()

    response = client.post(
        "/api/v1/billing/invoices/from-consultation",
        headers={"X-Tenant-ID": tenant_id},
        json={
            "consultation_id": data["consultation"]["id"],
            "discount_offer_id": offer["id"],
            "tax_rule_id": tax_rule["id"],
        },
    )

    assert response.status_code == 201
    invoice = response.json()["invoice"]
    assert invoice["subtotal_amount"] == 1000
    assert invoice["offer_discount_amount"] == 100
    assert invoice["discount_amount"] == 100
    assert invoice["taxable_amount"] == 900
    assert invoice["tax_amount"] == 162
    assert invoice["total_amount"] == 1062
    assert invoice["offer_discount_type"] == "percentage"
    assert invoice["offer_discount_value"] == 10
    assert invoice["tax_percentage"] == 18
    assert invoice["tax_label"] == "GST"


def _offer_invoice_setup(client: TestClient) -> tuple[str, dict, dict]:
    """A signed consultation billed at ₹1000, with an eligible 10% offer and
    18% GST configured but no offer chosen at invoice creation."""
    data = setup_signed_consultation(client, "op")
    tenant_id = data["tenant"]["id"]
    create_fee_rule(client, tenant_id, "op", 1000, doctor_share_percentage=60)
    offer = client.post(
        "/api/v1/billing/discount-offers",
        headers={"X-Tenant-ID": tenant_id},
        json={
            "name": "Consultation 10%",
            "code": "CONSULT10",
            "service_scope": "consultation",
            "discount_type": "percentage",
            "value": 10,
        },
    ).json()
    tax_rule = client.post(
        "/api/v1/billing/tax-rules",
        headers={"X-Tenant-ID": tenant_id},
        json={
            "name": "GST 18",
            "tax_percentage": 18,
            "tax_label": "GST",
            "service_scope": "consultation",
        },
    ).json()
    detail = client.post(
        "/api/v1/billing/invoices/from-consultation",
        headers={"X-Tenant-ID": tenant_id},
        json={
            "consultation_id": data["consultation"]["id"],
            "tax_rule_id": tax_rule["id"],
        },
    ).json()
    return tenant_id, offer, detail


def test_eligible_offer_is_not_applied_without_staff_action(client: TestClient):
    tenant_id, offer, detail = _offer_invoice_setup(client)

    # The offer exists and matches, but nothing was chosen, so the patient is
    # billed the full amount.
    invoice = detail["invoice"]
    assert invoice["discount_offer_id"] is None
    assert invoice["discount_amount"] == 0
    assert invoice["offer_discount_amount"] == 0
    assert invoice["total_amount"] == 1180

    # It is surfaced as something staff *may* apply.
    benefit = detail["offer_benefit"]
    assert benefit["is_applied"] is False
    assert benefit["can_apply"] is True
    assert benefit["offer_id"] == offer["id"]
    assert benefit["offer_name"] == "Consultation 10%"
    assert benefit["discount_amount"] == 100
    assert benefit["eligible_count"] == 1


def test_offer_apply_endpoint_discounts_and_recomputes_tax(client: TestClient):
    tenant_id, offer, detail = _offer_invoice_setup(client)
    invoice_id = detail["invoice"]["id"]

    response = client.post(
        f"/api/v1/billing/invoices/{invoice_id}/offer/apply",
        headers={"X-Tenant-ID": tenant_id},
        json={"discount_offer_id": offer["id"]},
    )

    assert response.status_code == 200
    invoice = response.json()["invoice"]
    assert invoice["discount_offer_id"] == offer["id"]
    assert invoice["discount_amount"] == 100
    assert invoice["offer_discount_amount"] == 100
    assert invoice["taxable_amount"] == 900
    # Tax is recharged on the discounted base, not the original ₹1000.
    assert invoice["tax_amount"] == 162
    assert invoice["total_amount"] == 1062
    assert invoice["balance_amount"] == 1062
    benefit = response.json()["offer_benefit"]
    assert benefit["is_applied"] is True
    assert benefit["can_remove"] is True


def test_offer_apply_without_a_body_picks_the_best_eligible_offer(
    client: TestClient,
):
    tenant_id, _, detail = _offer_invoice_setup(client)
    better = client.post(
        "/api/v1/billing/discount-offers",
        headers={"X-Tenant-ID": tenant_id},
        json={
            "name": "Consultation 25%",
            "service_scope": "consultation",
            "discount_type": "percentage",
            "value": 25,
        },
    ).json()

    response = client.post(
        f"/api/v1/billing/invoices/{detail['invoice']['id']}/offer/apply",
        headers={"X-Tenant-ID": tenant_id},
    )

    assert response.status_code == 200
    assert response.json()["invoice"]["discount_offer_id"] == better["id"]
    assert response.json()["invoice"]["discount_amount"] == 250


def test_offer_remove_restores_the_full_invoice_amount(client: TestClient):
    tenant_id, offer, detail = _offer_invoice_setup(client)
    invoice_id = detail["invoice"]["id"]
    client.post(
        f"/api/v1/billing/invoices/{invoice_id}/offer/apply",
        headers={"X-Tenant-ID": tenant_id},
        json={"discount_offer_id": offer["id"]},
    )

    response = client.post(
        f"/api/v1/billing/invoices/{invoice_id}/offer/remove",
        headers={"X-Tenant-ID": tenant_id},
    )

    assert response.status_code == 200
    invoice = response.json()["invoice"]
    assert invoice["discount_offer_id"] is None
    assert invoice["discount_amount"] == 0
    assert invoice["taxable_amount"] == 1000
    assert invoice["tax_amount"] == 180
    assert invoice["total_amount"] == 1180
    assert response.json()["offer_benefit"]["can_apply"] is True


def test_removing_an_offer_keeps_an_admin_approved_discount(client: TestClient):
    tenant_id, offer, detail = _offer_invoice_setup(client)
    invoice_id = detail["invoice"]["id"]
    request = client.post(
        f"/api/v1/billing/invoices/{invoice_id}/adjustment-requests",
        headers={"X-Tenant-ID": tenant_id},
        json={
            "request_type": "discount",
            "amount": 200,
            "reason": "Goodwill discount",
        },
    ).json()
    client.post(
        f"/api/v1/billing/adjustment-requests/{request['id']}/approve",
        headers={"X-Tenant-ID": tenant_id},
        json={},
    )
    client.post(
        f"/api/v1/billing/adjustment-requests/{request['id']}/execute",
        headers={"X-Tenant-ID": tenant_id},
        json={},
    )

    applied = client.post(
        f"/api/v1/billing/invoices/{invoice_id}/offer/apply",
        headers={"X-Tenant-ID": tenant_id},
        json={"discount_offer_id": offer["id"]},
    )
    # ₹200 approved + ₹100 offer, both retained.
    assert applied.status_code == 200
    assert applied.json()["invoice"]["discount_amount"] == 300

    removed = client.post(
        f"/api/v1/billing/invoices/{invoice_id}/offer/remove",
        headers={"X-Tenant-ID": tenant_id},
    )

    # Removing the offer must not take the approved discount with it.
    assert removed.status_code == 200
    assert removed.json()["invoice"]["discount_amount"] == 200
    assert removed.json()["invoice"]["discount_offer_id"] is None


def test_offer_cannot_be_applied_after_payment(client: TestClient):
    tenant_id, offer, detail = _offer_invoice_setup(client)
    invoice_id = detail["invoice"]["id"]
    paid = client.post(
        f"/api/v1/billing/invoices/{invoice_id}/payments",
        headers={"X-Tenant-ID": tenant_id},
        json={"method": "cash", "amount": 1180},
    )
    assert paid.status_code == 201

    response = client.post(
        f"/api/v1/billing/invoices/{invoice_id}/offer/apply",
        headers={"X-Tenant-ID": tenant_id},
        json={"discount_offer_id": offer["id"]},
    )

    assert response.status_code == 409


def test_deactivating_an_offer_does_not_rebill_an_invoice_it_was_applied_to(
    client: TestClient,
):
    tenant_id, offer, detail = _offer_invoice_setup(client)
    invoice_id = detail["invoice"]["id"]
    client.post(
        f"/api/v1/billing/invoices/{invoice_id}/offer/apply",
        headers={"X-Tenant-ID": tenant_id},
        json={"discount_offer_id": offer["id"]},
    )
    client.patch(
        f"/api/v1/billing/discount-offers/{offer['id']}",
        headers={"X-Tenant-ID": tenant_id},
        json={"is_active": False},
    )

    detail_after = client.get(
        f"/api/v1/billing/invoices/{invoice_id}",
        headers={"X-Tenant-ID": tenant_id},
    ).json()

    # The campaign ending must not claw back a discount already granted.
    assert detail_after["invoice"]["discount_amount"] == 100
    assert detail_after["invoice"]["total_amount"] == 1062
    assert detail_after["offer_benefit"]["is_applied"] is True
    assert detail_after["offer_benefit"]["can_apply"] is False


def test_offer_can_be_applied_by_code(client: TestClient):
    tenant_id, offer, detail = _offer_invoice_setup(client)

    response = client.post(
        f"/api/v1/billing/invoices/{detail['invoice']['id']}/offer/apply",
        headers={"X-Tenant-ID": tenant_id},
        json={"code": "consult10"},
    )

    assert response.status_code == 200
    assert response.json()["invoice"]["discount_offer_id"] == offer["id"]


def test_percentage_offer_rejects_value_above_one_hundred(client: TestClient):
    data = setup_signed_consultation(client, "op")
    response = client.post(
        "/api/v1/billing/discount-offers",
        headers={"X-Tenant-ID": data["tenant"]["id"]},
        json={
            "name": "Invalid 150%",
            "discount_type": "percentage",
            "value": 150,
        },
    )

    assert response.status_code == 422


def test_consultation_invoice_uses_service_scoped_tax_rule(client: TestClient):
    data = setup_signed_consultation(client, "op")
    tenant_id = data["tenant"]["id"]
    create_fee_rule(client, tenant_id, "op", 1000, doctor_share_percentage=60)
    client.post(
        "/api/v1/billing/tax-rules",
        headers={"X-Tenant-ID": tenant_id},
        json={
            "name": "Default GST 5",
            "tax_percentage": 5,
            "tax_label": "GST",
            "service_scope": "all",
        },
    )
    consultation_tax = client.post(
        "/api/v1/billing/tax-rules",
        headers={"X-Tenant-ID": tenant_id},
        json={
            "name": "Consultation GST 12",
            "tax_percentage": 12,
            "tax_label": "GST",
            "service_scope": "consultation",
        },
    )

    response = client.post(
        "/api/v1/billing/invoices/from-consultation",
        headers={"X-Tenant-ID": tenant_id},
        json={"consultation_id": data["consultation"]["id"]},
    )

    assert consultation_tax.status_code == 201
    assert response.status_code == 201
    assert response.json()["invoice"]["tax_rule_id"] == consultation_tax.json()["id"]
    assert response.json()["invoice"]["tax_amount"] == 120
    assert response.json()["invoice"]["total_amount"] == 1120


def test_tax_can_be_shared_with_doctor_when_fee_rule_allows_it(client: TestClient):
    data = setup_signed_consultation(client, "op")
    tenant_id = data["tenant"]["id"]
    create_fee_rule(
        client,
        tenant_id,
        "op",
        1000,
        doctor_share_percentage=60,
        share_tax_with_doctor=True,
    )
    tax_rule = client.post(
        "/api/v1/billing/tax-rules",
        headers={"X-Tenant-ID": tenant_id},
        json={"name": "GST 18", "tax_percentage": 18, "tax_label": "GST"},
    ).json()

    response = client.post(
        "/api/v1/billing/invoices/from-consultation",
        headers={"X-Tenant-ID": tenant_id},
        json={
            "consultation_id": data["consultation"]["id"],
            "tax_rule_id": tax_rule["id"],
        },
    )

    assert response.status_code == 201
    assert response.json()["invoice"]["total_amount"] == 1180
    assert response.json()["invoice"]["doctor_share_amount"] == 708
    assert response.json()["invoice"]["clinic_share_amount"] == 472


def test_invoice_requires_signed_consultation(client: TestClient):
    tenant = client.post(
        "/api/v1/tenants", json={"name": "Draft Billing Clinic"}
    ).json()
    starter = next(
        plan
        for plan in client.get("/api/v1/subscription-plans").json()
        if plan["key"] == "starter"
    )
    client.post(
        "/api/v1/subscription-plans/tenant-subscriptions",
        headers={"X-Tenant-ID": tenant["id"]},
        json={
            "plan_id": starter["id"],
            "starts_on": date.today().isoformat(),
            "is_trial": False,
        },
    )
    branch = client.post(
        f"/api/v1/tenants/{tenant['id']}/branches",
        json={"name": "Main Branch", "code": "MAIN"},
    ).json()
    patient = client.post(
        "/api/v1/patients",
        headers={"X-Tenant-ID": tenant["id"]},
        json={"full_name": "Draft Patient"},
    ).json()
    booking = client.post(
        "/api/v1/appointments",
        headers={"X-Tenant-ID": tenant["id"]},
        json={
            "branch_id": branch["id"],
            "patient_id": patient["id"],
            "appointment_type": "op",
            "appointment_date": date.today().isoformat(),
            "department_id": "general",
            "practitioner_id": "doctor_demo",
        },
    ).json()
    consultation = client.post(
        "/api/v1/consultations",
        headers={"X-Tenant-ID": tenant["id"]},
        json={"appointment_id": booking["appointment"]["id"]},
    ).json()
    create_fee_rule(client, tenant["id"], "op", 500)

    response = client.post(
        "/api/v1/billing/invoices/from-consultation",
        headers={"X-Tenant-ID": tenant["id"]},
        json={"consultation_id": consultation["id"]},
    )

    assert response.status_code == 409
    assert (
        response.json()["detail"]
        == "Invoice can be generated only after consultation is signed"
    )


def test_existing_consultation_invoice_is_returned_for_refresh(client: TestClient):
    data = setup_signed_consultation(client, "op")
    tenant_id = data["tenant"]["id"]
    create_fee_rule(client, tenant_id, "op", 500)

    first = client.post(
        "/api/v1/billing/invoices/from-consultation",
        headers={"X-Tenant-ID": tenant_id},
        json={"consultation_id": data["consultation"]["id"]},
    )
    refreshed = client.post(
        "/api/v1/billing/invoices/from-consultation",
        headers={"X-Tenant-ID": tenant_id},
        json={"consultation_id": data["consultation"]["id"]},
    )

    assert first.status_code == 201
    assert refreshed.status_code == 201
    assert refreshed.json()["invoice"]["id"] == first.json()["invoice"]["id"]
    assert refreshed.json()["invoice"]["total_amount"] == 500


def test_pending_consultation_invoice_page_uses_authoritative_invoice_links(
    client: TestClient,
):
    data = setup_signed_consultation(client, "op")
    tenant_id = data["tenant"]["id"]
    consultation_id = data["consultation"]["id"]
    headers = {"X-Tenant-ID": tenant_id}

    pending = client.get(
        "/api/v1/billing/pending-consultation-invoices/page?limit=10&offset=0",
        headers=headers,
    )
    assert pending.status_code == 200
    assert pending.json()["total"] == 1
    assert pending.json()["items"][0]["consultation_id"] == consultation_id
    assert pending.json()["items"][0]["appointment_id"] == data["appointment"]["id"]
    assert (
        pending.json()["items"][0]["appointment_number"]
        == data["appointment"]["appointment_number"]
    )

    create_fee_rule(client, tenant_id, "op", 500, practitioner_id="doctor_demo")
    generated = client.post(
        "/api/v1/billing/invoices/from-consultation",
        headers=headers,
        json={"consultation_id": consultation_id},
    )
    assert generated.status_code == 201
    invoice_id = generated.json()["invoice"]["id"]
    paid = client.post(
        f"/api/v1/billing/invoices/{invoice_id}/payments",
        headers=headers,
        json={"method": "cash", "amount": 500},
    )
    assert paid.status_code == 201
    assert paid.json()["invoice"]["status"] == "paid"

    after_payment = client.get(
        "/api/v1/billing/pending-consultation-invoices/page?limit=10&offset=0",
        headers=headers,
    )
    assert after_payment.status_code == 200
    assert after_payment.json()["items"] == []
    assert after_payment.json()["total"] == 0


def test_invoice_generation_requires_matching_fee_rule(client: TestClient):
    data = setup_signed_consultation(client, "online")

    response = client.post(
        "/api/v1/billing/invoices/from-consultation",
        headers={"X-Tenant-ID": data["tenant"]["id"]},
        json={"consultation_id": data["consultation"]["id"]},
    )

    assert response.status_code == 404
    assert response.json()["detail"] == "No active fee rule found for appointment type"


def test_fee_rule_can_vary_by_doctor_department_and_treatment(client: TestClient):
    data = setup_signed_consultation(
        client,
        "op",
        department_id="pediatrics",
        treatment_type="pediatric_consultation",
    )
    tenant_id = data["tenant"]["id"]
    create_fee_rule(
        client,
        tenant_id,
        "op",
        300,
        practitioner_id="doctor_demo",
        department_id="general",
        treatment_type="general_consultation",
    )
    create_fee_rule(
        client,
        tenant_id,
        "op",
        700,
        practitioner_id="doctor_demo",
        department_id="pediatrics",
        treatment_type="pediatric_consultation",
    )

    invoice = client.post(
        "/api/v1/billing/invoices/from-consultation",
        headers={"X-Tenant-ID": tenant_id},
        json={"consultation_id": data["consultation"]["id"]},
    )

    assert invoice.status_code == 201
    assert invoice.json()["invoice"]["total_amount"] == 700
    assert invoice.json()["items"][0]["description"] == "Pediatric Consultation"


def test_free_doctor_review_generates_zero_invoice_without_fee_rule(client: TestClient):
    data = setup_signed_consultation(
        client,
        "doctor_review",
        treatment_type="doctor_review",
        is_billable=False,
        visit_purpose="doctor_review",
    )

    invoice = client.post(
        "/api/v1/billing/invoices/from-consultation",
        headers={"X-Tenant-ID": data["tenant"]["id"]},
        json={"consultation_id": data["consultation"]["id"]},
    )

    assert invoice.status_code == 201
    assert invoice.json()["invoice"]["total_amount"] == 0
    assert invoice.json()["invoice"]["fee_rule_id"] is None
    assert (
        invoice.json()["items"][0]["description"] == "Doctor Review Consultation Free"
    )


def test_fitness_certificate_uses_its_own_fee_rule_for_revenue_tracking(
    client: TestClient,
):
    data = setup_signed_consultation(
        client,
        "fitness_certificate",
        treatment_type="fitness_certificate",
        visit_purpose="fitness_certificate",
    )
    create_fee_rule(
        client,
        data["tenant"]["id"],
        "fitness_certificate",
        900,
        treatment_type="fitness_certificate",
    )

    invoice = client.post(
        "/api/v1/billing/invoices/from-consultation",
        headers={"X-Tenant-ID": data["tenant"]["id"]},
        json={"consultation_id": data["consultation"]["id"]},
    )

    assert invoice.status_code == 201
    assert invoice.json()["invoice"]["total_amount"] == 900
    assert (
        invoice.json()["items"][0]["description"] == "Fitness Certificate Consultation"
    )

    report = client.get(
        "/api/v1/billing/reports/revenue?group_by=visit_purpose",
        headers={"X-Tenant-ID": data["tenant"]["id"]},
    )

    assert report.status_code == 200
    assert report.json()["rows"][0]["key"] == "fitness_certificate"
    assert report.json()["rows"][0]["invoice_amount"] == 900


def test_invoice_access_is_tenant_isolated(client: TestClient):
    data = setup_signed_consultation(client, "op")
    tenant_id = data["tenant"]["id"]
    create_fee_rule(client, tenant_id, "op", 500)
    invoice = client.post(
        "/api/v1/billing/invoices/from-consultation",
        headers={"X-Tenant-ID": tenant_id},
        json={"consultation_id": data["consultation"]["id"]},
    ).json()["invoice"]
    other_tenant = client.post("/api/v1/tenants", json={"name": "Other Clinic"}).json()

    response = client.get(
        f"/api/v1/billing/invoices/{invoice['id']}",
        headers={"X-Tenant-ID": other_tenant["id"]},
    )

    assert response.status_code == 404
    assert response.json()["detail"] == "Invoice not found"


def test_invoice_generation_writes_audit_event(client: TestClient):
    data = setup_signed_consultation(client, "op")
    tenant_id = data["tenant"]["id"]
    create_fee_rule(client, tenant_id, "op", 500)

    client.post(
        "/api/v1/billing/invoices/from-consultation",
        headers={"X-Tenant-ID": tenant_id},
        json={
            "consultation_id": data["consultation"]["id"],
            "created_by_user_id": "billing_user",
        },
    )
    audit = client.get(
        "/api/v1/audit-events", headers={"X-Tenant-ID": tenant_id}
    ).json()
    actions = [event["action"] for event in audit]

    assert "doctor_fee_rule.created" in actions
    assert "invoice.generated" in actions
