from test_billing import create_fee_rule, setup_signed_consultation


def create_invoice(client, appointment_type: str = "op", fee: int = 1000, doctor_pct: int = 60):
    data = setup_signed_consultation(client, appointment_type)
    tenant_id = data["tenant"]["id"]
    create_fee_rule(client, tenant_id, appointment_type, fee, doctor_share_percentage=doctor_pct)
    invoice = client.post(
        "/api/v1/billing/invoices/from-consultation",
        headers={"X-Tenant-ID": tenant_id},
        json={"consultation_id": data["consultation"]["id"]},
    ).json()["invoice"]
    return data, invoice


def test_partial_cash_and_upi_payments_mark_invoice_partially_then_paid(client):
    data, invoice = create_invoice(client)
    tenant_id = data["tenant"]["id"]

    cash = client.post(
        f"/api/v1/billing/invoices/{invoice['id']}/payments",
        headers={"X-Tenant-ID": tenant_id},
        json={"method": "cash", "amount": 400, "collected_by_user_id": "cashier"},
    )
    upi = client.post(
        f"/api/v1/billing/invoices/{invoice['id']}/payments",
        headers={"X-Tenant-ID": tenant_id},
        json={"method": "upi", "amount": 600, "reference_number": "UPI123"},
    )

    assert cash.status_code == 201
    assert cash.json()["invoice"]["status"] == "partially_paid"
    assert cash.json()["invoice"]["paid_amount"] == 400
    assert cash.json()["invoice"]["balance_amount"] == 600
    assert upi.status_code == 201
    assert upi.json()["invoice"]["status"] == "paid"
    assert upi.json()["invoice"]["paid_amount"] == 1000
    assert {payment["method"] for payment in upi.json()["payments"]} == {"cash", "upi"}


def test_gpay_and_paytm_methods_are_supported(client):
    data, first_invoice = create_invoice(client, "op", 500)
    tenant_id = data["tenant"]["id"]
    first = client.post(
        f"/api/v1/billing/invoices/{first_invoice['id']}/payments",
        headers={"X-Tenant-ID": tenant_id},
        json={"method": "gpay", "amount": 500, "reference_number": "GPAY-1"},
    )

    second_data, second_invoice = create_invoice(client, "home_visit", 800)
    second_tenant_id = second_data["tenant"]["id"]
    create_fee_rule(client, second_tenant_id, "home_visit", 800)
    second = client.post(
        f"/api/v1/billing/invoices/{second_invoice['id']}/payments",
        headers={"X-Tenant-ID": second_tenant_id},
        json={"method": "paytm", "amount": 800, "reference_number": "PAYTM-1"},
    )

    assert first.status_code == 201
    assert first.json()["payments"][0]["method"] == "gpay"
    assert second.status_code == 201
    assert second.json()["payments"][0]["method"] == "paytm"


def test_overpayment_is_rejected(client):
    data, invoice = create_invoice(client)

    response = client.post(
        f"/api/v1/billing/invoices/{invoice['id']}/payments",
        headers={"X-Tenant-ID": data["tenant"]["id"]},
        json={"method": "cash", "amount": 1001},
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "Payment amount cannot exceed invoice balance"


def test_paid_invoice_cannot_be_cancelled_until_refunded(client):
    data, invoice = create_invoice(client)
    tenant_id = data["tenant"]["id"]
    paid = client.post(
        f"/api/v1/billing/invoices/{invoice['id']}/payments",
        headers={"X-Tenant-ID": tenant_id},
        json={"method": "debit_card", "amount": 1000, "reference_number": "CARD123"},
    )
    cancel_paid = client.post(
        f"/api/v1/billing/invoices/{invoice['id']}/cancel",
        headers={"X-Tenant-ID": tenant_id},
        json={"reason": "Wrong invoice"},
    )
    payment_id = paid.json()["payments"][0]["id"]
    refund = client.post(
        f"/api/v1/billing/payments/{payment_id}/refund",
        headers={"X-Tenant-ID": tenant_id},
        json={"reason": "Customer refund"},
    )

    assert cancel_paid.status_code == 409
    assert cancel_paid.json()["detail"] == "Paid invoices cannot be cancelled; refund payments first"
    assert refund.status_code == 200
    assert refund.json()["invoice"]["status"] == "refunded"
    assert refund.json()["invoice"]["paid_amount"] == 0
    assert refund.json()["payments"][0]["status"] == "refunded"


def test_credit_note_can_be_issued_for_invoice(client):
    data, invoice = create_invoice(client)
    tenant_id = data["tenant"]["id"]

    credit = client.post(
        f"/api/v1/billing/invoices/{invoice['id']}/credit-notes",
        headers={"X-Tenant-ID": tenant_id},
        json={"amount": 100, "reason": "Billing correction", "created_by_user_id": "cashier"},
    )

    assert credit.status_code == 201
    assert credit.json()["credit_note_number"] == "CN-000001"
    assert credit.json()["amount"] == 100


def test_unpaid_invoice_can_be_cancelled(client):
    data, invoice = create_invoice(client)

    response = client.post(
        f"/api/v1/billing/invoices/{invoice['id']}/cancel",
        headers={"X-Tenant-ID": data["tenant"]["id"]},
        json={"reason": "Duplicate registration"},
    )

    assert response.status_code == 200
    assert response.json()["status"] == "cancelled"


def test_doctor_settlement_summary_uses_paid_basis(client):
    data, invoice = create_invoice(client, fee=1000, doctor_pct=60)
    tenant_id = data["tenant"]["id"]
    client.post(
        f"/api/v1/billing/invoices/{invoice['id']}/payments",
        headers={"X-Tenant-ID": tenant_id},
        json={"method": "cash", "amount": 500},
    )

    summary = client.get(
        "/api/v1/billing/doctor-settlements/summary?practitioner_id=doctor_demo",
        headers={"X-Tenant-ID": tenant_id},
    )

    assert summary.status_code == 200
    body = summary.json()
    assert body["invoice_count"] == 1
    assert body["total_invoice_amount"] == 1000
    assert body["total_paid_amount"] == 500
    assert body["total_doctor_share"] == 600
    assert body["doctor_share_paid_basis"] == 300
    assert body["pending_doctor_share"] == 300


def test_doctor_settlement_finalization_and_reports(client):
    data, invoice = create_invoice(client, fee=1000, doctor_pct=60)
    tenant_id = data["tenant"]["id"]
    client.post(
        f"/api/v1/billing/invoices/{invoice['id']}/payments",
        headers={"X-Tenant-ID": tenant_id},
        json={"method": "cash", "amount": 700},
    )

    due = client.get("/api/v1/billing/reports/due-collection", headers={"X-Tenant-ID": tenant_id})
    revenue = client.get("/api/v1/billing/reports/revenue?group_by=doctor", headers={"X-Tenant-ID": tenant_id})
    finalized = client.post(
        "/api/v1/billing/doctor-settlements/finalize",
        headers={"X-Tenant-ID": tenant_id},
        json={"practitioner_id": "doctor_demo", "finalized_by_user_id": "admin"},
    )

    assert due.status_code == 200
    assert due.json()["total_due_amount"] == 300
    assert revenue.status_code == 200
    assert revenue.json()["total_invoice_amount"] == 1000
    assert finalized.status_code == 200
    assert finalized.json()["settlement_amount"] == 420
    assert finalized.json()["status"] == "finalized"


def test_payment_access_is_tenant_isolated(client):
    data, invoice = create_invoice(client)
    other = client.post("/api/v1/tenants", json={"name": "Other Clinic"}).json()

    response = client.post(
        f"/api/v1/billing/invoices/{invoice['id']}/payments",
        headers={"X-Tenant-ID": other["id"]},
        json={"method": "cash", "amount": 100},
    )

    assert response.status_code == 404
    assert response.json()["detail"] == "Invoice not found"


def test_payment_and_refund_write_audit_events(client):
    data, invoice = create_invoice(client)
    tenant_id = data["tenant"]["id"]
    payment_detail = client.post(
        f"/api/v1/billing/invoices/{invoice['id']}/payments",
        headers={"X-Tenant-ID": tenant_id},
        json={"method": "credit_card", "amount": 1000, "reference_number": "CC123"},
    ).json()
    payment_id = payment_detail["payments"][0]["id"]
    client.post(
        f"/api/v1/billing/payments/{payment_id}/refund",
        headers={"X-Tenant-ID": tenant_id},
        json={"reason": "Refund requested"},
    )
    audit = client.get("/api/v1/audit-events", headers={"X-Tenant-ID": tenant_id}).json()
    actions = [event["action"] for event in audit]

    assert "payment.recorded" in actions
    assert "payment.refunded" in actions
