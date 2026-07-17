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


def test_ip_admission_running_charge_discharge_invoice_and_payment(
    api_client: httpx.Client,
    super_admin: AuthContext,
) -> None:
    tenant = onboard_tenant(
        api_client,
        super_admin,
        name_prefix="E2E IP Hospital",
        enabled_modules=["patients", "billing_basic", "ip"],
    )
    headers = tenant.admin.headers()
    patient = create_patient(api_client, tenant, name="E2E IP Patient")
    admission = assert_status(
        api_client.post(
            "/ip/admissions",
            headers=headers,
            json={
                "branch_id": tenant.branch_id,
                "patient_id": patient["id"],
                "ward": "General Ward",
                "bed": "E2E-B1",
                "reason": "Fever observation",
                "provisional_diagnosis": "Viral fever",
            },
        ),
        201,
    ).json()
    assert admission["status"] == "admitted"
    charge = assert_status(
        api_client.post(
            f"/ip/admissions/{admission['id']}/charges",
            headers=headers,
            json={
                "charge_type": "room",
                "description": "Room and nursing charge",
                "quantity": 2,
                "unit_amount": 1500,
            },
        ),
        201,
    ).json()
    assert charge["total_amount"] == 3000
    invoice = assert_status(
        api_client.post(f"/ip/admissions/{admission['id']}/invoice", headers=headers),
        201,
    ).json()
    assert invoice["invoice"]["total_amount"] == 3000
    assert_status(
        api_client.post(
            f"/billing/invoices/{invoice['invoice']['id']}/payments",
            headers=headers,
            json={"method": "cash", "amount": 3000},
        ),
        201,
    )
    discharge = assert_status(
        api_client.post(
            f"/ip/admissions/{admission['id']}/discharge-summary",
            headers=headers,
            json={
                "final_diagnosis": "Recovered viral fever",
                "follow_up_advice": "Review after three days",
            },
        ),
        201,
    ).json()
    finalized = assert_status(
        api_client.post(
            f"/ip/discharge-summaries/{discharge['id']}/finalize",
            headers=headers,
        ),
        200,
    ).json()
    assert finalized["status"] == "finalized"
    assert {
        "ip_admission.created",
        "ip_charge.created",
        "ip_invoice.generated",
        "payment.recorded",
        "ip_discharge_summary.created",
        "ip_discharge_summary.finalized",
    }.issubset(audit_actions(api_client, tenant))
