from datetime import date
from uuid import uuid4

import httpx
import pytest

from helpers import AuthContext, assert_status, onboard_tenant


pytestmark = pytest.mark.e2e


def test_subscription_entitlement_blocks_then_enables_lab_module(
    api_client: httpx.Client,
    super_admin: AuthContext,
) -> None:
    tenant = onboard_tenant(
        api_client,
        super_admin,
        name_prefix="E2E Entitlement Clinic",
        enabled_modules=["patients", "billing_basic"],
    )
    headers = tenant.admin.headers()
    initial = assert_status(
        api_client.get("/subscription-plans/entitlements", headers=headers), 200
    ).json()
    assert "lab" not in initial["enabled_modules"]
    blocked = assert_status(
        api_client.get("/lab/orders", headers=headers),
        403,
    )
    assert "Module lab is not enabled" in blocked.json()["detail"]

    suffix = uuid4().hex[:10]
    upgraded_plan = assert_status(
        api_client.post(
            "/subscription-plans",
            headers=super_admin.headers(),
            json={
                "key": f"e2e_lab_upgrade_{suffix}",
                "name": f"E2E Lab Upgrade {suffix}",
                "monthly_patient_limit": 1000,
                "included_branches": 5,
                "included_doctors": 10,
                "price_inr_monthly": 0,
                "enabled_modules": ["patients", "billing_basic", "lab"],
            },
        ),
        201,
    ).json()
    assert_status(
        api_client.post(
            "/subscription-plans/tenant-subscriptions",
            headers=super_admin.headers(tenant_id=tenant.tenant_id),
            json={
                "plan_id": upgraded_plan["id"],
                "starts_on": date.today().isoformat(),
                "is_trial": False,
            },
        ),
        201,
    )
    upgraded = assert_status(
        api_client.get("/subscription-plans/entitlements", headers=headers), 200
    ).json()
    assert "lab" in upgraded["enabled_modules"]
    assert_status(api_client.get("/lab/orders", headers=headers), 200)
