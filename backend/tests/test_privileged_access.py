from datetime import date


ROOT_PASSWORD = "SecretPass123"
TEMPORARY_PASSWORD = "TemporaryPass123"


def _bootstrap(client):
    created = client.post(
        "/api/v1/auth/bootstrap-super-admin",
        json={
            "name": "Root Administrator",
            "email": "root@medizinhub.test",
            "password": ROOT_PASSWORD,
        },
    )
    assert created.status_code == 201
    login = client.post(
        "/api/v1/auth/login",
        json={"email": "root@medizinhub.test", "password": ROOT_PASSWORD},
    )
    assert login.status_code == 200
    return login.cookies["access_token"]


def _customer_tenant(client, token):
    headers = {"Authorization": f"Bearer {token}"}
    tenant = client.post(
        "/api/v1/tenants",
        headers=headers,
        json={"name": "Support Target Clinic"},
    ).json()
    plan = next(
        row
        for row in client.get("/api/v1/subscription-plans", headers=headers).json()
        if row["key"] == "starter"
    )
    subscribed = client.post(
        "/api/v1/subscription-plans/tenant-subscriptions",
        headers={**headers, "X-Tenant-ID": tenant["id"]},
        json={
            "plan_id": plan["id"],
            "starts_on": date.today().isoformat(),
            "is_trial": False,
        },
    )
    assert subscribed.status_code == 201
    return tenant


def _create_privileged_account(client, token, account_type, permissions):
    response = client.post(
        "/api/v1/identity/privileged-accounts",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "account_type": account_type,
            "name": account_type.replace("_", " ").title(),
            "email": f"{account_type}@medizinhub.test",
            "temporary_password": TEMPORARY_PASSWORD,
            "current_password": ROOT_PASSWORD,
            "permission_keys": permissions,
            "reason": "Privileged access test",
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


def _login(client, email):
    response = client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": TEMPORARY_PASSWORD},
    )
    assert response.status_code == 200, response.text
    return response.cookies["access_token"], response.json()["user"]


def test_platform_admin_is_permission_scoped_without_global_bypass(
    unauthenticated_client,
):
    client = unauthenticated_client
    root_token = _bootstrap(client)
    tenant = _customer_tenant(client, root_token)
    root_headers = {"Authorization": f"Bearer {root_token}"}
    primary = next(
        row
        for row in client.get("/api/v1/tenants", headers=root_headers).json()
        if row["is_primary"]
    )
    created = _create_privileged_account(
        client,
        root_token,
        "platform_admin",
        ["platform.tenants.manage", "platform.subscriptions.manage"],
    )
    token, user = _login(client, created["email"])
    headers = {"Authorization": f"Bearer {token}", "X-Tenant-ID": primary["id"]}

    assert user["is_super_admin"] is False
    assert user["user_type"] == "platform_admin"
    assert "platform.tenants.manage" in user["permissions"]
    assert client.get("/api/v1/tenants", headers=headers).status_code == 200
    assert (
        client.get(
            "/api/v1/subscription-plans/tenant-subscriptions",
            headers={
                "Authorization": f"Bearer {token}",
                "X-Tenant-ID": tenant["id"],
            },
        ).status_code
        == 200
    )
    assert (
        client.get(
            "/api/v1/patients",
            headers={
                "Authorization": f"Bearer {token}",
                "X-Tenant-ID": tenant["id"],
            },
        ).status_code
        == 403
    )
    assert (
        client.get("/api/v1/identity/super-admins", headers=headers).status_code == 403
    )


def test_support_admin_requires_expiring_tenant_grant_and_cannot_write(
    unauthenticated_client,
):
    client = unauthenticated_client
    root_token = _bootstrap(client)
    tenant = _customer_tenant(client, root_token)
    support = _create_privileged_account(
        client,
        root_token,
        "support_admin",
        [],
    )
    support_token, user = _login(client, support["email"])
    support_headers = {
        "Authorization": f"Bearer {support_token}",
        "X-Tenant-ID": tenant["id"],
    }

    assert user["is_super_admin"] is False
    denied = client.get("/api/v1/patients", headers=support_headers)
    assert denied.status_code == 403
    assert denied.json()["detail"] == "Temporary tenant access is missing or expired"

    grant = client.post(
        "/api/v1/identity/support-access-grants",
        headers={"Authorization": f"Bearer {root_token}"},
        json={
            "user_id": support["id"],
            "tenant_id": tenant["id"],
            "permission_keys": ["patients.read"],
            "duration_minutes": 60,
            "current_password": ROOT_PASSWORD,
            "reason": "Investigate patient search display",
        },
    )
    assert grant.status_code == 201, grant.text
    grant_body = grant.json()
    assert grant_body["status"] == "active"
    assert grant_body["permission_keys"] == ["patients.read"]

    assert client.get("/api/v1/patients", headers=support_headers).status_code == 200
    write = client.post(
        "/api/v1/patients",
        headers=support_headers,
        json={"full_name": "Blocked Support Write"},
    )
    assert write.status_code == 403

    own_grants = client.get(
        "/api/v1/identity/support-access-grants",
        headers={"Authorization": f"Bearer {support_token}"},
    )
    assert own_grants.status_code == 200
    assert [row["id"] for row in own_grants.json()] == [grant_body["id"]]

    revoked = client.post(
        f"/api/v1/identity/support-access-grants/{grant_body['id']}/revoke",
        headers={"Authorization": f"Bearer {root_token}"},
        json={
            "current_password": ROOT_PASSWORD,
            "reason": "Support investigation complete",
        },
    )
    assert revoked.status_code == 200
    assert revoked.json()["status"] == "revoked"
    assert client.get("/api/v1/patients", headers=support_headers).status_code == 403


def test_only_root_can_manage_privileged_accounts_and_grants(unauthenticated_client):
    client = unauthenticated_client
    root_token = _bootstrap(client)
    platform = _create_privileged_account(
        client,
        root_token,
        "platform_admin",
        ["platform.tenants.manage"],
    )
    platform_token, _user = _login(client, platform["email"])
    headers = {"Authorization": f"Bearer {platform_token}"}

    assert (
        client.get("/api/v1/identity/privileged-accounts", headers=headers).status_code
        == 403
    )
    create = client.post(
        "/api/v1/identity/privileged-accounts",
        headers=headers,
        json={
            "account_type": "support_admin",
            "name": "Unauthorized Support",
            "email": "unauthorized.support@medizinhub.test",
            "temporary_password": TEMPORARY_PASSWORD,
            "current_password": TEMPORARY_PASSWORD,
            "permission_keys": [],
            "reason": "Must be rejected",
        },
    )
    assert create.status_code == 403
