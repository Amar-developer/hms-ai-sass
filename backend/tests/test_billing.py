from datetime import date

from fastapi.testclient import TestClient


def setup_signed_consultation(
    client: TestClient,
    appointment_type: str = "op",
    department_id: str | None = None,
    treatment_type: str = "general_consultation",
    is_billable: bool = True,
    visit_purpose: str | None = None,
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
            "diagnosis": "Viral fever",
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
    assert detail["items"][0]["description"] == "Op general consultation"


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


def test_tax_rule_applies_gst_to_invoice_and_receipt_pdf(client: TestClient):
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
    receipt = client.get(
        f"/api/v1/billing/invoices/{response.json()['invoice']['id']}/receipt.pdf",
        headers={"X-Tenant-ID": tenant_id},
    )

    assert response.status_code == 201
    assert response.json()["invoice"]["tax_amount"] == 180
    assert response.json()["invoice"]["total_amount"] == 1180
    assert response.json()["invoice"]["doctor_share_amount"] == 600
    assert response.json()["invoice"]["clinic_share_amount"] == 580
    assert receipt.status_code == 200
    assert receipt.headers["content-type"] == "application/pdf"


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


def test_discount_offer_applies_to_consultation_invoice_before_tax(client: TestClient):
    data = setup_signed_consultation(client, "op")
    tenant_id = data["tenant"]["id"]
    create_fee_rule(client, tenant_id, "op", 1000, doctor_share_percentage=60)
    tax_rule = client.post(
        "/api/v1/billing/tax-rules",
        headers={"X-Tenant-ID": tenant_id},
        json={
            "name": "GST 10",
            "tax_percentage": 10,
            "tax_label": "GST",
            "service_scope": "consultation",
        },
    ).json()
    offer = client.post(
        "/api/v1/billing/discount-offers",
        headers={"X-Tenant-ID": tenant_id},
        json={
            "name": "Health camp 10",
            "code": "HEALTH10",
            "service_scope": "consultation",
            "discount_type": "percentage",
            "value": 10,
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
    assert response.json()["invoice"]["discount_offer_id"] == offer["id"]
    assert response.json()["invoice"]["discount_amount"] == 100
    assert response.json()["invoice"]["taxable_amount"] == 900
    assert response.json()["invoice"]["tax_amount"] == 90
    assert response.json()["invoice"]["total_amount"] == 990


def test_discount_offer_requires_minimum_bill_amount(client: TestClient):
    data = setup_signed_consultation(client, "op")
    tenant_id = data["tenant"]["id"]
    create_fee_rule(client, tenant_id, "op", 600, doctor_share_percentage=60)
    offer = client.post(
        "/api/v1/billing/discount-offers",
        headers={"X-Tenant-ID": tenant_id},
        json={
            "name": "Consultation 10 above 700",
            "code": "CONSULT10",
            "service_scope": "consultation",
            "discount_type": "percentage",
            "value": 10,
            "minimum_bill_amount": 700,
        },
    ).json()

    response = client.post(
        "/api/v1/billing/invoices/from-consultation",
        headers={"X-Tenant-ID": tenant_id},
        json={
            "consultation_id": data["consultation"]["id"],
            "discount_offer_id": offer["id"],
        },
    )

    assert response.status_code == 201
    assert response.json()["invoice"]["discount_offer_id"] is None
    assert response.json()["invoice"]["discount_amount"] == 0
    assert response.json()["invoice"]["total_amount"] == 600


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
    assert invoice.json()["items"][0]["description"] == "Op pediatric consultation"


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
        invoice.json()["items"][0]["description"] == "Doctor Review doctor review Free"
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
        invoice.json()["items"][0]["description"]
        == "Fitness Certificate fitness certificate"
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
