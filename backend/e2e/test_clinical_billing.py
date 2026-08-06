from datetime import date

import httpx
import pytest

from helpers import AuthContext, assert_status, onboard_tenant, unique_value


pytestmark = pytest.mark.e2e


def test_patient_visit_to_paid_invoice_and_audit_trail(
    api_client: httpx.Client,
    super_admin: AuthContext,
) -> None:
    tenant = onboard_tenant(
        api_client, super_admin, name_prefix="E2E Clinical Billing Clinic"
    )
    headers = tenant.admin.headers()

    department = assert_status(
        api_client.post(
            f"/tenants/{tenant.tenant_id}/departments",
            headers=headers,
            json={
                "name": "General Medicine",
                "code": unique_value("GEN").replace("-", "_").upper(),
                "branch_id": tenant.branch_id,
            },
        ),
        201,
    ).json()
    practitioner = assert_status(
        api_client.post(
            "/practitioners",
            headers=headers,
            json={
                "full_name": "Dr E2E Clinical",
                "practitioner_type": "doctor",
                "primary_specialty": "General Medicine",
                "registration_number": unique_value("REG"),
                "branch_ids": [tenant.branch_id],
                "department_ids": [department["id"]],
            },
        ),
        201,
    ).json()
    assert_status(
        api_client.post(
            f"/practitioners/{practitioner['id']}/schedules",
            headers=headers,
            json={
                "branch_id": tenant.branch_id,
                "department_id": department["id"],
                "mode": "custom",
                "weekdays": [date.today().weekday()],
                "start_time": "09:00:00",
                "end_time": "17:00:00",
                "slot_minutes": 15,
            },
        ),
        201,
    )
    patient = assert_status(
        api_client.post(
            "/patients",
            headers=headers,
            json={
                "branch_id": tenant.branch_id,
                "full_name": "E2E Clinical Patient",
                "mobile": "9000000010",
                "age_years": 36,
            },
        ),
        201,
    ).json()
    booking = assert_status(
        api_client.post(
            "/appointments",
            headers=headers,
            json={
                "branch_id": tenant.branch_id,
                "patient_id": patient["id"],
                "department_id": department["id"],
                "practitioner_id": practitioner["id"],
                "appointment_type": "op",
                "appointment_date": date.today().isoformat(),
                "reason": "E2E fever consultation",
            },
        ),
        201,
    ).json()
    consultation = assert_status(
        api_client.post(
            "/consultations",
            headers=headers,
            json={
                "appointment_id": booking["appointment"]["id"],
                "treatment_type": "general_consultation",
                "chief_complaint": "Fever and body pain",
                "diagnosis": "Viral fever",
                "clinical_notes": "Hydration and rest advised",
                "prescription_text": "Paracetamol",
            },
        ),
        201,
    ).json()
    signed = assert_status(
        api_client.post(
            f"/consultations/{consultation['id']}/sign",
            headers=headers,
            json={},
        ),
        200,
    ).json()
    assert signed["status"] == "signed"

    assert_status(
        api_client.post(
            "/billing/doctor-fee-rules",
            headers=headers,
            json={
                "appointment_type": "op",
                "fee_amount": 500,
                "share_type": "percentage",
                "doctor_share_percentage": 60,
                "branch_id": tenant.branch_id,
                "practitioner_id": practitioner["id"],
                "department_id": department["id"],
                "treatment_type": "general_consultation",
                "share_tax_with_doctor": False,
            },
        ),
        201,
    )
    invoice_detail = assert_status(
        api_client.post(
            "/billing/invoices/from-consultation",
            headers=headers,
            json={"consultation_id": consultation["id"]},
        ),
        201,
    ).json()
    invoice = invoice_detail["invoice"]
    assert invoice["total_amount"] == 500
    assert invoice["doctor_share_amount"] == 300
    assert invoice["clinic_share_amount"] == 200
    assert invoice["balance_amount"] == 500

    paid_detail = assert_status(
        api_client.post(
            f"/billing/invoices/{invoice['id']}/payments",
            headers=headers,
            json={"method": "cash", "amount": 500},
        ),
        201,
    ).json()
    paid_invoice = paid_detail["invoice"]
    assert paid_invoice["status"] == "paid"
    assert paid_invoice["paid_amount"] == 500
    assert paid_invoice["balance_amount"] == 0

    actions = {
        event["action"]
        for event in assert_status(
            api_client.get("/audit-events", headers=headers), 200
        ).json()
    }
    assert {
        "patient.created",
        "appointment.booked",
        "consultation.signed",
        "doctor_fee_rule.created",
        "invoice.generated",
        "payment.recorded",
    }.issubset(actions)
