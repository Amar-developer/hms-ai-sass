import httpx
import pytest

from helpers import (
    AuthContext,
    assert_status,
    audit_actions,
    create_patient,
    onboard_tenant,
    unique_value,
)


pytestmark = pytest.mark.e2e


def test_lab_order_sample_result_invoice_and_payment(
    api_client: httpx.Client,
    super_admin: AuthContext,
) -> None:
    tenant = onboard_tenant(
        api_client,
        super_admin,
        name_prefix="E2E Lab Clinic",
        enabled_modules=["patients", "billing_basic", "lab"],
    )
    headers = tenant.admin.headers()
    patient = create_patient(api_client, tenant, name="E2E Lab Patient")
    test = assert_status(
        api_client.post(
            "/lab/catalog/tests",
            headers=headers,
            json={
                "branch_id": tenant.branch_id,
                "code": unique_value("CBC").upper(),
                "name": "Complete Blood Count",
                "sample_type": "Blood",
                "default_price": 350,
            },
        ),
        201,
    ).json()
    order = assert_status(
        api_client.post(
            "/lab/orders",
            headers=headers,
            json={
                "branch_id": tenant.branch_id,
                "patient_id": patient["id"],
                "source": "op_direct",
                "tests": "Complete Blood Count",
                "test_ids": [test["id"]],
            },
        ),
        201,
    ).json()
    assert order["amount"] == 350

    sample = assert_status(
        api_client.post(
            f"/lab/orders/{order['id']}/samples",
            headers=headers,
            json={
                "barcode": unique_value("LAB").upper(),
                "sample_type": "Blood",
            },
        ),
        201,
    ).json()
    assert sample["order"]["status"] == "sample_collected"
    result = assert_status(
        api_client.post(
            f"/lab/orders/{order['id']}/results",
            headers=headers,
            json={
                "result_summary": "CBC values are within normal limits",
                "abnormal_flag": False,
            },
        ),
        201,
    ).json()
    assert result["order"]["status"] == "result_ready"

    invoice = assert_status(
        api_client.post(
            "/billing/invoices/from-lab-order",
            headers=headers,
            json={"lab_order_id": order["id"]},
        ),
        201,
    ).json()
    assert invoice["invoice"]["total_amount"] == 350
    assert invoice["items"][0]["item_type"] == "lab"
    paid = assert_status(
        api_client.post(
            f"/billing/invoices/{invoice['invoice']['id']}/payments",
            headers=headers,
            json={"method": "upi", "amount": 350, "reference_number": "LAB-E2E-UPI"},
        ),
        201,
    ).json()
    assert paid["invoice"]["status"] == "paid"
    assert {
        "lab_test.created",
        "lab_order.created",
        "lab_sample.collected",
        "lab_result.released",
        "lab_invoice.generated",
        "payment.recorded",
    }.issubset(audit_actions(api_client, tenant))
