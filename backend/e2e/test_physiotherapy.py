from datetime import date

import httpx
import pytest

from helpers import (
    AuthContext,
    assert_status,
    audit_actions,
    create_patient,
    onboard_tenant,
)


pytestmark = pytest.mark.e2e


def test_physiotherapy_case_session_invoice_and_payment(
    api_client: httpx.Client,
    super_admin: AuthContext,
) -> None:
    tenant = onboard_tenant(
        api_client,
        super_admin,
        name_prefix="E2E Physiotherapy Clinic",
        enabled_modules=["patients", "billing_basic", "physiotherapy"],
    )
    headers = tenant.admin.headers()
    patient = create_patient(api_client, tenant, name="E2E Physio Patient")
    equipment = assert_status(
        api_client.post(
            "/physiotherapy/equipment",
            headers=headers,
            json={
                "branch_id": tenant.branch_id,
                "name": "E2E Muscle Stimulator",
                "modality_type": "muscle_stimulator",
                "manufacturer": "E2E Medical",
                "is_portable": True,
            },
        ),
        201,
    ).json()
    case = assert_status(
        api_client.post(
            "/physiotherapy/cases",
            headers=headers,
            json={
                "branch_id": tenant.branch_id,
                "patient_id": patient["id"],
                "care_context": "op",
                "assessment_date": date.today().isoformat(),
                "body_region": "Knee",
                "condition": "Post injury stiffness",
                "pain_score": 7,
                "planned_sessions": 3,
                "treatment_goal": "Improve range of motion",
            },
        ),
        201,
    ).json()
    session = assert_status(
        api_client.post(
            f"/physiotherapy/cases/{case['id']}/sessions",
            headers=headers,
            json={
                "session_date": date.today().isoformat(),
                "equipment_id": equipment["id"],
                "modality_type": "muscle_stimulator",
                "treatment_area": "Knee",
                "duration_minutes": 20,
                "pre_pain_score": 7,
                "post_pain_score": 5,
                "charge_amount": 800,
            },
        ),
        201,
    ).json()
    assert session["session_number"] == 1
    invoice = assert_status(
        api_client.post(
            f"/physiotherapy/cases/{case['id']}/invoice",
            headers=headers,
            json={},
        ),
        201,
    ).json()
    assert invoice["invoice"]["total_amount"] == 800
    assert_status(
        api_client.post(
            f"/billing/invoices/{invoice['invoice']['id']}/payments",
            headers=headers,
            json={"method": "upi", "amount": 800, "reference_number": "PHY-E2E-UPI"},
        ),
        201,
    )
    final_invoice = assert_status(
        api_client.get(f"/physiotherapy/cases/{case['id']}/invoice", headers=headers),
        200,
    ).json()
    assert final_invoice["invoice"]["balance_amount"] == 0
    assert {
        "physiotherapy_equipment.created",
        "physiotherapy_case.created",
        "physiotherapy_session.created",
        "physiotherapy_invoice.generated",
        "payment.recorded",
    }.issubset(audit_actions(api_client, tenant))
