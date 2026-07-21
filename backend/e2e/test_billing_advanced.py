import httpx
import pytest

from helpers import (
    AuthContext,
    assert_status,
    audit_actions,
    create_clinical_context,
    create_consultation_invoice,
)


pytestmark = pytest.mark.e2e


def test_partial_payments_full_payment_and_refund(
    api_client: httpx.Client,
    super_admin: AuthContext,
) -> None:
    clinical = create_clinical_context(
        api_client,
        super_admin,
        name_prefix="E2E Advanced Billing",
        fee_amount=1000,
    )
    headers = clinical.tenant.admin.headers()
    invoice = create_consultation_invoice(api_client, clinical)["invoice"]
    partial = assert_status(
        api_client.post(
            f"/billing/invoices/{invoice['id']}/payments",
            headers=headers,
            json={"method": "cash", "amount": 400},
        ),
        201,
    ).json()
    assert partial["invoice"]["status"] == "partially_paid"
    paid = assert_status(
        api_client.post(
            f"/billing/invoices/{invoice['id']}/payments",
            headers=headers,
            json={"method": "upi", "amount": 600, "reference_number": "BILL-E2E-UPI"},
        ),
        201,
    ).json()
    assert paid["invoice"]["status"] == "paid"
    assert_status(
        api_client.post(
            f"/billing/invoices/{invoice['id']}/cancel",
            headers=headers,
            json={"reason": "Cancellation must be blocked while paid"},
        ),
        409,
    )
    for payment in paid["payments"]:
        assert_status(
            api_client.post(
                f"/billing/payments/{payment['id']}/refund",
                headers=headers,
                json={"reason": "E2E patient refund"},
            ),
            200,
        )
    refunded = assert_status(
        api_client.get(f"/billing/invoices/{invoice['id']}", headers=headers),
        200,
    ).json()
    assert refunded["invoice"]["status"] == "refunded"
    assert refunded["invoice"]["paid_amount"] == 0
    assert {"payment.recorded", "payment.refunded"}.issubset(
        audit_actions(api_client, clinical.tenant)
    )
