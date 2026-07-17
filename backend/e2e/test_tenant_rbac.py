import httpx
import pytest

from helpers import (
    AuthContext,
    assert_status,
    create_role_user,
    onboard_tenant,
)


pytestmark = pytest.mark.e2e


def test_tenant_onboarding_permissions_and_data_isolation(
    api_client: httpx.Client,
    super_admin: AuthContext,
) -> None:
    first = onboard_tenant(api_client, super_admin, name_prefix="E2E RBAC First Clinic")
    second = onboard_tenant(
        api_client, super_admin, name_prefix="E2E RBAC Second Clinic"
    )

    first_patient = assert_status(
        api_client.post(
            "/patients",
            headers=first.admin.headers(),
            json={
                "branch_id": first.branch_id,
                "full_name": "First Tenant Patient",
                "mobile": "9000000001",
            },
        ),
        201,
    ).json()
    second_patient = assert_status(
        api_client.post(
            "/patients",
            headers=second.admin.headers(),
            json={
                "branch_id": second.branch_id,
                "full_name": "Second Tenant Patient",
                "mobile": "9000000002",
            },
        ),
        201,
    ).json()

    reader = create_role_user(
        api_client,
        first,
        permission_keys=["patients.read"],
        role_prefix="patient_reader",
    )
    own_list = assert_status(
        api_client.get("/patients", headers=reader.headers()), 200
    ).json()
    assert any(row["id"] == first_patient["id"] for row in own_list)
    assert_status(
        api_client.get(f"/patients/{second_patient['id']}", headers=reader.headers()),
        404,
    )
    assert_status(
        api_client.post(
            "/patients",
            headers=reader.headers(),
            json={
                "branch_id": first.branch_id,
                "full_name": "Unauthorized Create",
            },
        ),
        403,
    )

    # A tenant-bound token cannot switch itself into another tenant by changing
    # only the request header.
    assert_status(
        api_client.get(
            "/patients",
            headers=first.admin.headers(tenant_id=second.tenant_id),
        ),
        403,
    )
