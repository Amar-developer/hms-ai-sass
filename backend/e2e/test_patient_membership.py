from datetime import date

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


def test_membership_purchase_payment_activation_and_consultation_benefit(
    api_client: httpx.Client,
    super_admin: AuthContext,
) -> None:
    clinical = create_clinical_context(
        api_client,
        super_admin,
        name_prefix="E2E Membership",
        enabled_modules=[
            "patients",
            "appointments",
            "queue",
            "practitioners",
            "scheduling",
            "consultations",
            "billing_basic",
            "billing_advanced",
            "patient_subscriptions",
        ],
        fee_amount=500,
    )
    tenant = clinical.tenant
    headers = tenant.admin.headers()
    plan = assert_status(
        api_client.post(
            "/patient-subscriptions/plans",
            headers=headers,
            json={
                "branch_id": tenant.branch_id,
                "name": "E2E Family Membership",
                "price_amount": 500,
                "duration_days": 30,
                "free_consultations": 1,
                "free_consultation_department_ids": [clinical.department_id],
            },
        ),
        201,
    ).json()
    enrollment = assert_status(
        api_client.post(
            "/patient-subscriptions/enrollments",
            headers=headers,
            json={
                "branch_id": tenant.branch_id,
                "patient_id": clinical.patient_id,
                "plan_id": plan["id"],
                "starts_on": date.today().isoformat(),
            },
        ),
        201,
    ).json()
    assert enrollment["paid_amount"] == 0
    assert enrollment["purchase_invoice_id"]

    before_payment = assert_status(
        api_client.post(
            "/patient-subscriptions/benefits/preview",
            headers=headers,
            json={
                "patient_id": clinical.patient_id,
                "branch_id": tenant.branch_id,
                "service_type": "consultation",
                "subtotal_amount": 500,
                "department_id": clinical.department_id,
            },
        ),
        200,
    ).json()
    assert before_payment["has_active_subscription"] is False

    assert_status(
        api_client.post(
            f"/billing/invoices/{enrollment['purchase_invoice_id']}/payments",
            headers=headers,
            json={"method": "cash", "amount": 500},
        ),
        201,
    )
    active = assert_status(
        api_client.get(
            "/patient-subscriptions/enrollments",
            headers=headers,
            params={"patient_id": clinical.patient_id},
        ),
        200,
    ).json()[0]
    assert active["paid_amount"] == 500
    assert active["remaining_free_consultations"] == 1

    invoice = create_consultation_invoice(api_client, clinical)
    benefited = assert_status(
        api_client.post(
            f"/billing/invoices/{invoice['invoice']['id']}/membership-benefit/apply",
            headers=headers,
        ),
        200,
    ).json()
    assert benefited["invoice"]["membership_discount_amount"] == 500
    assert benefited["invoice"]["total_amount"] == 0
    assert benefited["invoice"]["balance_amount"] == 0

    consumed = assert_status(
        api_client.get(
            "/patient-subscriptions/enrollments",
            headers=headers,
            params={"patient_id": clinical.patient_id},
        ),
        200,
    ).json()[0]
    assert consumed["used_consultations"] == 1
    assert consumed["remaining_free_consultations"] == 0
    assert {
        "patient_subscription_plan.created",
        "patient_subscription.enrolled",
        "invoice.membership_benefit_applied",
    }.issubset(audit_actions(api_client, tenant))
