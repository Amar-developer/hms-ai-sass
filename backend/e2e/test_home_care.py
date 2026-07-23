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


def test_home_care_booking_completed_visit_invoice_and_payment(
    api_client: httpx.Client,
    super_admin: AuthContext,
) -> None:
    tenant = onboard_tenant(
        api_client,
        super_admin,
        name_prefix="E2E Home Care Clinic",
        enabled_modules=["patients", "billing_basic", "home_care"],
    )
    headers = tenant.admin.headers()
    patient = create_patient(api_client, tenant, name="E2E Home Care Patient")
    booking = assert_status(
        api_client.post(
            "/home-care/bookings",
            headers=headers,
            json={
                "branch_id": tenant.branch_id,
                "patient_id": patient["id"],
                "assigned_staff_name": "Nurse E2E",
                "staff_type": "nurse",
                "booking_type": "home_care",
                "recurrence": "once",
                "start_date": date.today().isoformat(),
                "end_date": date.today().isoformat(),
                "location": "E2E Patient Home, Chennai",
                "services": [
                    {
                        "service_category": "home_care_service",
                        "description": "Nursing Visit",
                        "quantity": 2,
                        "unit_amount": 1200,
                    }
                ],
            },
        ),
        201,
    ).json()
    assert booking["status"] == "requested"
    assert_status(
        api_client.patch(
            f"/home-care/bookings/{booking['id']}",
            headers=headers,
            json={"status": "scheduled", "notes": "Visit confirmed"},
        ),
        200,
    )
    visit = assert_status(
        api_client.post(
            f"/home-care/bookings/{booking['id']}/visits",
            headers=headers,
            json={
                "visit_date": date.today().isoformat(),
                "assigned_staff_name": "Nurse E2E",
                "staff_type": "nurse",
                "service_category": "home_care_service",
                "description": "Nursing Visit",
                "quantity": 2,
                "unit_amount": 1200,
                "status": "completed",
            },
        ),
        201,
    ).json()
    assert visit["total_amount"] == 1200
    invoice = assert_status(
        api_client.post(
            f"/home-care/bookings/{booking['id']}/invoice",
            headers=headers,
            json={},
        ),
        201,
    ).json()
    assert invoice["invoice"]["total_amount"] == 1200
    assert_status(
        api_client.post(
            f"/billing/invoices/{invoice['invoice']['id']}/payments",
            headers=headers,
            json={"method": "cash", "amount": 1200},
        ),
        201,
    )
    final_invoice = assert_status(
        api_client.get(f"/home-care/bookings/{booking['id']}/invoice", headers=headers),
        200,
    ).json()
    assert final_invoice["invoice"]["balance_amount"] == 0
    assert {
        "home_care_booking.created",
        "home_care_visit.logged",
        "home_care_invoice.generated",
        "payment.recorded",
    }.issubset(audit_actions(api_client, tenant))
