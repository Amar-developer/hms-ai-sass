import httpx
import pytest

from helpers import (
    AuthContext,
    assert_status,
    create_role_user,
    onboard_tenant,
    unique_value,
)


pytestmark = pytest.mark.e2e


def test_backend_error_log_resolution_and_read_manage_permissions(
    api_client: httpx.Client,
    super_admin: AuthContext,
) -> None:
    tenant = onboard_tenant(api_client, super_admin, name_prefix="E2E Error Log Clinic")
    missing_route = f"/{unique_value('missing-e2e-route')}"
    assert_status(
        api_client.get(missing_route, headers=tenant.admin.headers()),
        404,
    )

    page = assert_status(
        api_client.get(
            "/error-logs",
            headers=tenant.admin.headers(),
            params={"q": missing_route, "category": "not_found"},
        ),
        200,
    ).json()
    row = next(
        item for item in page["items"] if item["route"] == f"/api/v1{missing_route}"
    )
    assert row["source"] == "backend_api"
    assert row["status_code"] == 404
    assert row["is_resolved"] is False

    reader = create_role_user(
        api_client,
        tenant,
        permission_keys=["error_logs.read"],
        role_prefix="error_log_reader",
    )
    assert_status(
        api_client.get(f"/error-logs/{row['id']}", headers=reader.headers()),
        200,
    )
    assert_status(
        api_client.patch(
            f"/error-logs/{row['id']}",
            headers=reader.headers(),
            json={"resolved": True, "resolution_note": "Not allowed"},
        ),
        403,
    )

    resolved = assert_status(
        api_client.patch(
            f"/error-logs/{row['id']}",
            headers=tenant.admin.headers(),
            json={"resolved": True, "resolution_note": "Resolved by E2E test"},
        ),
        200,
    ).json()
    assert resolved["is_resolved"] is True
    assert resolved["resolution_note"] == "Resolved by E2E test"

    visible_after_resolve = assert_status(
        api_client.get(
            "/error-logs",
            headers=tenant.admin.headers(),
            params={"q": missing_route},
        ),
        200,
    ).json()
    assert any(
        item["id"] == row["id"] and item["is_resolved"] is True
        for item in visible_after_resolve["items"]
    )
