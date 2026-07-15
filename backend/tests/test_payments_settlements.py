from sqlmodel import Session

from app.modules.billing.models import (
    DiscountOffer,
    DiscountType,
    Invoice,
    InvoiceStatus,
    TaxRule,
)
from app.modules.billing.services.invoice_amounts import apply_generic_invoice_discount
from app.modules.billing.services.rules import calculate_offer_discount
from test_billing import create_fee_rule, setup_signed_consultation


def create_invoice(
    client, appointment_type: str = "op", fee: int = 1000, doctor_pct: int = 60
):
    data = setup_signed_consultation(client, appointment_type)
    tenant_id = data["tenant"]["id"]
    create_fee_rule(
        client, tenant_id, appointment_type, fee, doctor_share_percentage=doctor_pct
    )
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
    assert (
        cancel_paid.json()["detail"]
        == "Paid invoices cannot be cancelled; refund payments first"
    )
    assert refund.status_code == 200
    assert refund.json()["invoice"]["status"] == "refunded"
    assert refund.json()["invoice"]["paid_amount"] == 0
    assert refund.json()["payments"][0]["status"] == "refunded"


def test_discount_request_reduces_invoice_after_approval_and_execution(client):
    data, invoice = create_invoice(client, "home_visit", 1000, doctor_pct=60)
    tenant_id = data["tenant"]["id"]

    request = client.post(
        f"/api/v1/billing/invoices/{invoice['id']}/adjustment-requests",
        headers={"X-Tenant-ID": tenant_id},
        json={
            "request_type": "discount",
            "amount": 100,
            "reason": "Goodwill discount",
        },
    ).json()
    approved = client.post(
        f"/api/v1/billing/adjustment-requests/{request['id']}/approve",
        headers={"X-Tenant-ID": tenant_id},
        json={},
    )
    executed = client.post(
        f"/api/v1/billing/adjustment-requests/{request['id']}/execute",
        headers={"X-Tenant-ID": tenant_id},
        json={},
    )

    assert request["status"] == "pending"
    assert approved.status_code == 200
    assert approved.json()["status"] == "approved"
    assert executed.status_code == 200
    invoice_after = executed.json()["invoice"]
    assert invoice_after["subtotal_amount"] == 1000
    assert invoice_after["discount_amount"] == 100
    assert invoice_after["total_amount"] == 900
    assert invoice_after["balance_amount"] == 900
    assert invoice_after["doctor_share_amount"] == 540
    assert executed.json()["credit_notes"][0]["amount"] == 100
    discount_entry = next(
        entry
        for entry in executed.json()["ledger_entries"]
        if entry["entry_type"] == "invoice_discount_applied"
    )
    assert discount_entry["credit_amount"] == 100
    assert discount_entry["invoice_total_delta"] == -100
    assert discount_entry["balance_amount_delta"] == -100


def test_discount_request_blocked_after_payment_recorded(client):
    data, invoice = create_invoice(client, "home_visit", 1000, doctor_pct=60)
    tenant_id = data["tenant"]["id"]
    client.post(
        f"/api/v1/billing/invoices/{invoice['id']}/payments",
        headers={"X-Tenant-ID": tenant_id},
        json={"method": "cash", "amount": 1000},
    )

    request = client.post(
        f"/api/v1/billing/invoices/{invoice['id']}/adjustment-requests",
        headers={"X-Tenant-ID": tenant_id},
        json={
            "request_type": "discount",
            "amount": 100,
            "reason": "Too late discount",
        },
    )

    assert request.status_code == 409
    assert "refund" in request.json()["detail"].lower()


def test_discount_request_allowed_for_op_consultation_invoice(client):
    # OP consultations used to be excluded from the old direct "edit amount"
    # feature; discount requests are available for every invoice type now.
    data, invoice = create_invoice(client, "op", 1000, doctor_pct=60)
    tenant_id = data["tenant"]["id"]

    request = client.post(
        f"/api/v1/billing/invoices/{invoice['id']}/adjustment-requests",
        headers={"X-Tenant-ID": tenant_id},
        json={
            "request_type": "discount",
            "amount": 100,
            "reason": "OP goodwill discount",
        },
    ).json()
    client.post(
        f"/api/v1/billing/adjustment-requests/{request['id']}/approve",
        headers={"X-Tenant-ID": tenant_id},
        json={},
    )
    executed = client.post(
        f"/api/v1/billing/adjustment-requests/{request['id']}/execute",
        headers={"X-Tenant-ID": tenant_id},
        json={},
    )

    assert executed.status_code == 200
    invoice_after = executed.json()["invoice"]
    assert invoice_after["subtotal_amount"] == 1000
    assert invoice_after["discount_amount"] == 100
    assert invoice_after["total_amount"] == 900
    assert invoice_after["balance_amount"] == 900
    assert invoice_after["doctor_share_amount"] == 540


def test_generic_discount_reduces_non_consultation_invoice_total(test_engine):
    # Lab/pharmacy/physiotherapy/home-care/direct invoices don't have the
    # consultation fee-rule structure — the generic discount path just knocks
    # the amount straight off total/balance instead of recomputing tax/share.
    with Session(test_engine) as session:
        invoice = Invoice(
            tenant_id="tenant_generic_discount",
            branch_id="branch_main",
            patient_id="patient_generic",
            lab_order_id="laborder_generic",
            invoice_number="MHB-INV-GENERIC",
            subtotal_amount=800,
            taxable_amount=800,
            total_amount=800,
            paid_amount=0,
            balance_amount=800,
            status=InvoiceStatus.ISSUED,
        )
        session.add(invoice)
        session.commit()
        session.refresh(invoice)

        updated = apply_generic_invoice_discount(
            session,
            invoice=invoice,
            discount_amount=200,
            actor_user_id="tenant_admin",
        )
        total_amount = updated.total_amount
        balance_amount = updated.balance_amount
        discount_amount = updated.discount_amount
        result_status = updated.status

    assert total_amount == 600
    assert balance_amount == 600
    assert discount_amount == 200
    assert result_status == InvoiceStatus.ISSUED


def test_generic_discount_recomputes_percentage_tax(test_engine):
    with Session(test_engine) as session:
        tax_rule = TaxRule(
            id="taxrule_generic_18",
            tenant_id="tenant_generic_tax",
            branch_id="branch_main",
            name="GST 18",
            tax_percentage=18,
            service_scope="lab",
        )
        invoice = Invoice(
            tenant_id="tenant_generic_tax",
            branch_id="branch_main",
            patient_id="patient_generic_tax",
            lab_order_id="laborder_generic_tax",
            invoice_number="MHB-INV-GENERIC-TAX",
            subtotal_amount=1000,
            discount_amount=100,
            taxable_amount=900,
            tax_amount=162,
            tax_rule_id=tax_rule.id,
            total_amount=1062,
            paid_amount=0,
            balance_amount=1062,
            status=InvoiceStatus.ISSUED,
        )
        session.add(tax_rule)
        session.add(invoice)
        session.commit()
        session.refresh(invoice)

        updated = apply_generic_invoice_discount(
            session,
            invoice=invoice,
            discount_amount=100,
            actor_user_id="tenant_admin",
        )

        assert updated.discount_amount == 200
        assert updated.taxable_amount == 800
        assert updated.tax_amount == 144
        assert updated.total_amount == 944
        assert updated.balance_amount == 944


def test_offer_percentage_uses_gross_subtotal_once(test_engine):
    with Session(test_engine) as session:
        offer = DiscountOffer(
            tenant_id="tenant_offer_percentage",
            branch_id="branch_main",
            name="Ten Percent",
            service_scope="lab",
            discount_type=DiscountType.PERCENTAGE,
            value=10,
        )
        session.add(offer)
        session.commit()
        session.refresh(offer)

        discount, selected = calculate_offer_discount(
            session,
            tenant_id=offer.tenant_id,
            branch_id=offer.branch_id,
            service_scope="lab",
            subtotal=1000,
            discount_offer_id=offer.id,
        )

        assert selected and selected.id == offer.id
        assert discount == 100


def test_credit_note_can_be_issued_for_invoice(client):
    data, invoice = create_invoice(client)
    tenant_id = data["tenant"]["id"]

    credit = client.post(
        f"/api/v1/billing/invoices/{invoice['id']}/credit-notes",
        headers={"X-Tenant-ID": tenant_id},
        json={
            "amount": 100,
            "reason": "Billing correction",
            "created_by_user_id": "cashier",
        },
    )

    assert credit.status_code == 201
    assert credit.json()["credit_note_number"] == "CN-000001"
    assert credit.json()["amount"] == 100
    detail = client.get(
        f"/api/v1/billing/invoices/{invoice['id']}",
        headers={"X-Tenant-ID": tenant_id},
    )
    assert detail.status_code == 200
    assert detail.json()["invoice"]["status"] == "issued"
    assert detail.json()["invoice"]["total_amount"] == 1000
    assert detail.json()["invoice"]["paid_amount"] == 0
    assert detail.json()["invoice"]["balance_amount"] == 1000
    credit_entry = next(
        entry
        for entry in detail.json()["ledger_entries"]
        if entry["entry_type"] == "credit_note_issued"
    )
    assert credit_entry["debit_amount"] == 0
    assert credit_entry["credit_amount"] == 0
    assert credit_entry["invoice_total_delta"] == 0
    assert credit_entry["paid_amount_delta"] == 0
    assert credit_entry["balance_amount_delta"] == 0


def test_credit_note_does_not_mark_paid_invoice_as_refunded(client):
    data, invoice = create_invoice(client, fee=75)
    tenant_id = data["tenant"]["id"]
    paid = client.post(
        f"/api/v1/billing/invoices/{invoice['id']}/payments",
        headers={"X-Tenant-ID": tenant_id},
        json={"method": "cash", "amount": 75},
    )

    credit = client.post(
        f"/api/v1/billing/invoices/{invoice['id']}/credit-notes",
        headers={"X-Tenant-ID": tenant_id},
        json={"amount": 75, "reason": "Billing credit"},
    )
    detail = client.get(
        f"/api/v1/billing/invoices/{invoice['id']}",
        headers={"X-Tenant-ID": tenant_id},
    )

    assert paid.status_code == 201
    assert credit.status_code == 201
    assert detail.status_code == 200
    assert detail.json()["invoice"]["status"] == "paid"
    assert detail.json()["invoice"]["paid_amount"] == 75
    assert detail.json()["invoice"]["balance_amount"] == 0
    credit_entry = next(
        entry
        for entry in detail.json()["ledger_entries"]
        if entry["entry_type"] == "credit_note_issued"
    )
    assert credit_entry["status_after"] == "paid"
    assert credit_entry["balance_amount_delta"] == 0


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

    due = client.get(
        "/api/v1/billing/reports/due-collection", headers={"X-Tenant-ID": tenant_id}
    )
    revenue = client.get(
        "/api/v1/billing/reports/revenue?group_by=doctor",
        headers={"X-Tenant-ID": tenant_id},
    )
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
    assert finalized.json()["finalized_settlement_amount"] == 420
    assert finalized.json()["payable_settlement_amount"] == 0
    assert finalized.json()["can_finalize"] is False

    summary_after = client.get(
        "/api/v1/billing/doctor-settlements/summary?practitioner_id=doctor_demo",
        headers={"X-Tenant-ID": tenant_id},
    )
    duplicate = client.post(
        "/api/v1/billing/doctor-settlements/finalize",
        headers={"X-Tenant-ID": tenant_id},
        json={"practitioner_id": "doctor_demo", "finalized_by_user_id": "admin"},
    )

    assert summary_after.status_code == 200
    assert summary_after.json()["doctor_share_paid_basis"] == 420
    assert summary_after.json()["finalized_settlement_amount"] == 420
    assert summary_after.json()["payable_settlement_amount"] == 0
    assert summary_after.json()["can_finalize"] is False
    assert duplicate.status_code == 409
    assert duplicate.json()["detail"] == "Doctor settlement is already finalized."


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
    audit = client.get(
        "/api/v1/audit-events", headers={"X-Tenant-ID": tenant_id}
    ).json()
    actions = [event["action"] for event in audit]

    assert "payment.recorded" in actions
    assert "payment.refunded" in actions


def test_adjustment_request_prevents_duplicate_and_executes_full_refund(client):
    data, invoice = create_invoice(client, fee=750)
    tenant_id = data["tenant"]["id"]
    paid = client.post(
        f"/api/v1/billing/invoices/{invoice['id']}/payments",
        headers={"X-Tenant-ID": tenant_id},
        json={"method": "cash", "amount": 750, "collected_by_user_id": "cashier"},
    )
    request = client.post(
        f"/api/v1/billing/invoices/{invoice['id']}/adjustment-requests",
        headers={"X-Tenant-ID": tenant_id},
        json={
            "request_type": "full_refund",
            "reason": "Patient cancelled after payment",
            "requested_by_user_id": "frontdesk",
        },
    )
    duplicate = client.post(
        f"/api/v1/billing/invoices/{invoice['id']}/adjustment-requests",
        headers={"X-Tenant-ID": tenant_id},
        json={
            "request_type": "full_refund",
            "reason": "Duplicate refund request",
        },
    )
    approved = client.post(
        f"/api/v1/billing/adjustment-requests/{request.json()['id']}/approve",
        headers={"X-Tenant-ID": tenant_id},
        json={"actor_user_id": "tenant_admin"},
    )
    executed = client.post(
        f"/api/v1/billing/adjustment-requests/{request.json()['id']}/execute",
        headers={"X-Tenant-ID": tenant_id},
        json={"actor_user_id": "tenant_admin"},
    )
    after_closed = client.post(
        f"/api/v1/billing/invoices/{invoice['id']}/adjustment-requests",
        headers={"X-Tenant-ID": tenant_id},
        json={
            "request_type": "full_refund",
            "reason": "Should not be allowed after refund",
        },
    )

    assert paid.status_code == 201
    assert request.status_code == 201
    assert duplicate.status_code == 409
    assert (
        duplicate.json()["detail"]
        == "Invoice already has a pending or approved adjustment request"
    )
    assert approved.status_code == 200
    assert executed.status_code == 200
    assert executed.json()["invoice"]["status"] == "refunded"
    assert executed.json()["invoice"]["paid_amount"] == 0
    assert executed.json()["credit_notes"][0]["amount"] == 750
    assert any(
        entry["entry_type"] == "payment_refunded"
        for entry in executed.json()["ledger_entries"]
    )
    assert after_closed.status_code == 409
    assert (
        after_closed.json()["detail"]
        == "Invoice is already closed for cancellation/refund"
    )


def test_partial_refund_updates_net_revenue_report(client):
    data, invoice = create_invoice(client, fee=1000, doctor_pct=60)
    tenant_id = data["tenant"]["id"]
    client.post(
        f"/api/v1/billing/invoices/{invoice['id']}/payments",
        headers={"X-Tenant-ID": tenant_id},
        json={"method": "cash", "amount": 1000},
    )
    request = client.post(
        f"/api/v1/billing/invoices/{invoice['id']}/adjustment-requests",
        headers={"X-Tenant-ID": tenant_id},
        json={
            "request_type": "partial_refund",
            "amount": 250,
            "reason": "One service removed",
        },
    ).json()
    client.post(
        f"/api/v1/billing/adjustment-requests/{request['id']}/approve",
        headers={"X-Tenant-ID": tenant_id},
        json={},
    )
    executed = client.post(
        f"/api/v1/billing/adjustment-requests/{request['id']}/execute",
        headers={"X-Tenant-ID": tenant_id},
        json={},
    )
    revenue = client.get(
        "/api/v1/billing/reports/revenue?group_by=doctor",
        headers={"X-Tenant-ID": tenant_id},
    )

    assert executed.status_code == 200
    assert executed.json()["invoice"]["status"] == "partially_refunded"
    assert executed.json()["invoice"]["paid_amount"] == 750
    assert revenue.status_code == 200
    assert revenue.json()["total_invoice_amount"] == 750
    assert revenue.json()["total_paid_amount"] == 750
    assert revenue.json()["total_doctor_share"] == 450
