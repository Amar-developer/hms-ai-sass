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


def test_pharmacy_purchase_dispense_stock_invoice_and_payment(
    api_client: httpx.Client,
    super_admin: AuthContext,
) -> None:
    tenant = onboard_tenant(
        api_client,
        super_admin,
        name_prefix="E2E Pharmacy Clinic",
        enabled_modules=["patients", "billing_basic", "pharmacy"],
    )
    headers = tenant.admin.headers()
    patient = create_patient(api_client, tenant, name="E2E Pharmacy Patient")
    medicine = assert_status(
        api_client.post(
            "/pharmacy/medicines",
            headers=headers,
            json={
                "branch_id": tenant.branch_id,
                "code": unique_value("PCM").upper(),
                "name": "Paracetamol 500mg",
                "generic_name": "Paracetamol",
                "form": "Tablet",
                "default_sale_price": 5,
                "reorder_level": 5,
            },
        ),
        201,
    ).json()
    supplier = assert_status(
        api_client.post(
            "/pharmacy/suppliers",
            headers=headers,
            json={"name": "E2E Pharma Supplier", "phone": "9000000020"},
        ),
        201,
    ).json()
    purchase = assert_status(
        api_client.post(
            "/pharmacy/purchases",
            headers=headers,
            json={
                "branch_id": tenant.branch_id,
                "supplier_id": supplier["id"],
                "invoice_number": unique_value("PINV").upper(),
                "items": [
                    {
                        "medicine_id": medicine["id"],
                        "batch_number": unique_value("BATCH").upper(),
                        "quantity": 10,
                        "cost_price": 2,
                        "sale_price": 5,
                    }
                ],
            },
        ),
        201,
    ).json()
    batch_id = purchase["batches"][0]["id"]
    issue = assert_status(
        api_client.post(
            "/pharmacy/issues",
            headers=headers,
            json={
                "branch_id": tenant.branch_id,
                "patient_id": patient["id"],
                "source": "op_direct",
                "medicine_text": "Paracetamol 500mg",
                "items": [
                    {
                        "medicine_id": medicine["id"],
                        "batch_id": batch_id,
                        "medicine_name": "Paracetamol 500mg",
                        "quantity": 2,
                        "unit_price": 5,
                    }
                ],
            },
        ),
        201,
    ).json()
    dispensed = assert_status(
        api_client.patch(
            f"/pharmacy/issues/{issue['id']}/status",
            headers=headers,
            json={"status": "dispensed"},
        ),
        200,
    ).json()
    assert dispensed["status"] == "dispensed"

    invoice = assert_status(
        api_client.post(
            "/billing/invoices/from-pharmacy-issue",
            headers=headers,
            json={"pharmacy_issue_id": issue["id"]},
        ),
        201,
    ).json()
    assert invoice["invoice"]["total_amount"] == 10
    paid = assert_status(
        api_client.post(
            f"/billing/invoices/{invoice['invoice']['id']}/payments",
            headers=headers,
            json={"method": "cash", "amount": 10},
        ),
        201,
    ).json()
    assert paid["invoice"]["status"] == "paid"
    ledger = assert_status(
        api_client.get(
            "/pharmacy/stock-ledger",
            headers=headers,
            params={"medicine_id": medicine["id"]},
        ),
        200,
    ).json()
    assert {row["movement_type"] for row in ledger} >= {"purchase", "dispense"}
    assert {
        "pharmacy_purchase.created",
        "pharmacy_issue.created",
        "pharmacy_invoice.generated",
        "payment.recorded",
    }.issubset(audit_actions(api_client, tenant))
