from datetime import date


def bootstrap_super_admin(client):
    response = client.post(
        "/api/v1/auth/bootstrap-super-admin",
        json={"name": "Platform Admin", "email": "admin@medizinhub.test", "password": "SecretPass123"},
    )
    assert response.status_code == 201
    login = client.post(
        "/api/v1/auth/login",
        json={"email": "admin@medizinhub.test", "password": "SecretPass123"},
    )
    assert login.status_code == 200
    return login.json()["access_token"]


def create_tenant_with_paid_plan(client, super_token):
    headers = {"Authorization": f"Bearer {super_token}"}
    tenant = client.post("/api/v1/tenants", headers=headers, json={"name": "Identity Clinic"}).json()
    client.post(
        "/api/v1/subscription-plans/tenant-subscriptions",
        headers={**headers, "X-Tenant-ID": tenant["id"]},
        json={
            "plan_id": "starter",
            "starts_on": date.today().isoformat(),
            "is_trial": False,
        },
    )
    return tenant


def test_bootstrap_login_me_and_change_password(unauthenticated_client):
    client = unauthenticated_client
    token = bootstrap_super_admin(client)

    me = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me.status_code == 200
    assert me.json()["is_super_admin"] is True
    assert me.json()["roles"] == ["super_admin"]
    assert me.json()["permissions"] == ["*"]

    changed = client.post(
        "/api/v1/auth/change-password",
        headers={"Authorization": f"Bearer {token}"},
        json={"current_password": "SecretPass123", "new_password": "NewSecretPass123"},
    )
    assert changed.status_code == 200
    login = client.post(
        "/api/v1/auth/login",
        json={"email": "admin@medizinhub.test", "password": "NewSecretPass123"},
    )
    assert login.status_code == 200


def test_bootstrap_creates_primary_super_admin_role(unauthenticated_client):
    client = unauthenticated_client
    token = bootstrap_super_admin(client)
    headers = {"Authorization": f"Bearer {token}"}
    tenants = client.get("/api/v1/tenants", headers=headers).json()
    primary = next(row for row in tenants if row["is_primary"])

    roles = client.get(
        "/api/v1/identity/roles",
        headers={**headers, "X-Tenant-ID": primary["id"]},
    )
    assert roles.status_code == 200
    super_role = next(row for row in roles.json() if row["key"] == "super_admin")
    assert super_role["tenant_id"] == primary["id"]
    assert super_role["name"] == "Super Admin"
    assert super_role["is_global_template"] is True
    assert "platform.tenants.manage" in super_role["permission_keys"]
    assert "identity.users.manage" in super_role["permission_keys"]
    tenant_admin_role = next(row for row in roles.json() if row["key"] == "tenant_admin")
    assert tenant_admin_role["tenant_id"] == primary["id"]
    assert tenant_admin_role["name"] == "Tenant Admin"
    assert tenant_admin_role["is_global_template"] is True
    assert "identity.users.manage" in tenant_admin_role["permission_keys"]
    assert "settings.manage" in tenant_admin_role["permission_keys"]
    assert "platform.tenants.manage" not in tenant_admin_role["permission_keys"]
    assert "platform.subscriptions.manage" not in tenant_admin_role["permission_keys"]


def test_logout_revokes_current_session(unauthenticated_client):
    client = unauthenticated_client
    token = bootstrap_super_admin(client)

    logout = client.post("/api/v1/auth/logout", headers={"Authorization": f"Bearer {token}"})
    assert logout.status_code == 200
    assert logout.json() == {"logged_out": True}

    me = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me.status_code == 401


def test_tenant_admin_can_manage_only_own_tenant_users(unauthenticated_client):
    client = unauthenticated_client
    super_token = bootstrap_super_admin(client)
    tenant = create_tenant_with_paid_plan(client, super_token)
    other_tenant = client.post(
        "/api/v1/tenants",
        headers={"Authorization": f"Bearer {super_token}"},
        json={"name": "Other Clinic"},
    ).json()

    role = client.post(
        "/api/v1/identity/roles",
        headers={"Authorization": f"Bearer {super_token}", "X-Tenant-ID": tenant["id"]},
        json={
            "name": "Tenant Admin",
            "key": "tenant_admin",
            "permission_keys": ["identity.users.manage", "settings.manage"],
        },
    )
    assert role.status_code == 201

    user = client.post(
        "/api/v1/identity/users",
        headers={"Authorization": f"Bearer {super_token}", "X-Tenant-ID": tenant["id"]},
        json={
            "name": "Clinic Admin",
            "email": "clinic.admin@test.local",
            "password": "ClinicPass123",
            "role_keys": ["tenant_admin"],
        },
    )
    assert user.status_code == 201

    login = client.post(
        "/api/v1/auth/login",
        json={
            "email": "clinic.admin@test.local",
            "password": "ClinicPass123",
            "tenant_id": tenant["id"],
        },
    )
    assert login.status_code == 200
    tenant_token = login.json()["access_token"]

    own_users = client.get(
        "/api/v1/identity/users",
        headers={"Authorization": f"Bearer {tenant_token}", "X-Tenant-ID": tenant["id"]},
    )
    assert own_users.status_code == 200
    assert [row["email"] for row in own_users.json()] == ["clinic.admin@test.local"]

    cross_tenant = client.get(
        "/api/v1/identity/users",
        headers={"Authorization": f"Bearer {tenant_token}", "X-Tenant-ID": other_tenant["id"]},
    )
    assert cross_tenant.status_code == 403


def test_identity_actions_are_audited(unauthenticated_client):
    client = unauthenticated_client
    super_token = bootstrap_super_admin(client)
    tenant = create_tenant_with_paid_plan(client, super_token)

    client.post(
        "/api/v1/identity/roles",
        headers={"Authorization": f"Bearer {super_token}", "X-Tenant-ID": tenant["id"]},
        json={"name": "Staff", "key": "staff", "permission_keys": ["appointments.manage"]},
    )
    client.post(
        "/api/v1/identity/users",
        headers={"Authorization": f"Bearer {super_token}", "X-Tenant-ID": tenant["id"]},
        json={
            "name": "Reception Staff",
            "email": "staff@test.local",
            "password": "StaffPass123",
            "role_keys": ["staff"],
        },
    )

    audit = client.get(
        "/api/v1/audit-events",
        headers={"Authorization": f"Bearer {super_token}", "X-Tenant-ID": tenant["id"]},
    ).json()
    actions = [event["action"] for event in audit]
    assert "identity.role_created" in actions
    assert "identity.user_created" in actions


def test_tenant_user_update_status_and_delete_are_supported(unauthenticated_client):
    client = unauthenticated_client
    super_token = bootstrap_super_admin(client)
    tenant = create_tenant_with_paid_plan(client, super_token)
    headers = {"Authorization": f"Bearer {super_token}", "X-Tenant-ID": tenant["id"]}

    client.post(
        "/api/v1/identity/roles",
        headers=headers,
        json={"name": "Staff", "key": "staff", "permission_keys": ["appointments.manage"]},
    )
    user = client.post(
        "/api/v1/identity/users",
        headers=headers,
        json={
            "name": "Reception Staff",
            "email": "reception@test.local",
            "password": "StaffPass123",
            "role_keys": ["staff"],
        },
    ).json()

    updated = client.patch(
        f"/api/v1/identity/users/{user['id']}",
        headers=headers,
        json={"name": "Reception Lead", "mobile": "9000000001", "must_change_password": False},
    )
    assert updated.status_code == 200
    assert updated.json()["name"] == "Reception Lead"
    assert updated.json()["mobile"] == "9000000001"

    inactive = client.post(
        f"/api/v1/identity/users/{user['id']}/status",
        headers=headers,
        json={"is_active": False},
    )
    assert inactive.status_code == 200
    assert inactive.json()["is_active"] is False

    deleted = client.delete(f"/api/v1/identity/users/{user['id']}", headers=headers)
    assert deleted.status_code == 200
    assert deleted.json()["mode"] == "deactivated"

    users = client.get("/api/v1/identity/users", headers=headers).json()
    saved_user = next(row for row in users if row["id"] == user["id"])
    assert saved_user["is_active"] is False
    assert saved_user["email"].startswith(f"deleted+{user['id']}+")


def test_role_crud_metadata_and_latest_first_ordering(unauthenticated_client):
    client = unauthenticated_client
    super_token = bootstrap_super_admin(client)
    tenant = create_tenant_with_paid_plan(client, super_token)
    headers = {"Authorization": f"Bearer {super_token}", "X-Tenant-ID": tenant["id"]}

    first = client.post(
        "/api/v1/identity/roles",
        headers=headers,
        json={"name": "Front Office", "key": "front_office", "permission_keys": ["appointments.manage"]},
    )
    assert first.status_code == 201
    first_role = first.json()
    assert first_role["created_by_user_id"] is not None
    assert first_role["updated_by_user_id"] == first_role["created_by_user_id"]
    assert first_role["is_active"] is True
    assert first_role["permission_keys"] == ["appointments.manage"]

    second = client.post(
        "/api/v1/identity/roles",
        headers=headers,
        json={"name": "Billing Desk", "key": "billing_desk", "permission_keys": ["billing.manage"]},
    ).json()

    updated = client.patch(
        f"/api/v1/identity/roles/{first_role['id']}",
        headers=headers,
        json={"name": "Front Office Lead", "key": "front_office_lead", "is_active": True},
    )
    assert updated.status_code == 200
    assert updated.json()["name"] == "Front Office Lead"

    roles = client.get("/api/v1/identity/roles", headers=headers).json()
    assert roles[0]["id"] == first_role["id"]
    assert roles[1]["id"] == second["id"]

    inactive = client.post(
        f"/api/v1/identity/roles/{first_role['id']}/status",
        headers=headers,
        json={"is_active": False},
    )
    assert inactive.status_code == 200
    assert inactive.json()["is_active"] is False

    deleted = client.delete(f"/api/v1/identity/roles/{second['id']}", headers=headers)
    assert deleted.status_code == 200
    assert deleted.json()["mode"] == "deactivated"


def test_super_admin_can_assign_primary_role_template_to_customer_tenant(unauthenticated_client):
    client = unauthenticated_client
    super_token = bootstrap_super_admin(client)
    tenant = create_tenant_with_paid_plan(client, super_token)
    tenants = client.get("/api/v1/tenants", headers={"Authorization": f"Bearer {super_token}"}).json()
    primary = next(row for row in tenants if row["is_primary"])

    catalog = client.get(
        "/api/v1/identity/permissions",
        headers={"Authorization": f"Bearer {super_token}", "X-Tenant-ID": primary["id"]},
    )
    assert catalog.status_code == 200
    assert {"create", "read", "edit", "delete"}.issubset(
        {row["action"] for row in catalog.json() if row["module"] == "appointments"}
    )

    template = client.post(
        "/api/v1/identity/roles",
        headers={"Authorization": f"Bearer {super_token}", "X-Tenant-ID": primary["id"]},
        json={
            "name": "Appointment Operator",
            "key": "appointment_operator",
            "permission_keys": ["appointments.create", "appointments.read", "appointments.edit"],
        },
    ).json()
    assigned = client.post(
        f"/api/v1/identity/roles/{template['id']}/assign/{tenant['id']}",
        headers={"Authorization": f"Bearer {super_token}"},
    )
    assert assigned.status_code == 200
    body = assigned.json()
    assert body["tenant_id"] == tenant["id"]
    assert body["key"] == "appointment_operator"
    assert body["source_template_role_id"] == template["id"]
    assert body["is_template_locked"] is True
    assert body["is_global_template"] is False
    assert body["permission_keys"] == ["appointments.create", "appointments.edit", "appointments.read"]


def test_super_admin_can_promote_customer_role_to_primary_and_copy_to_other_tenant(unauthenticated_client):
    client = unauthenticated_client
    super_token = bootstrap_super_admin(client)
    headers = {"Authorization": f"Bearer {super_token}"}
    tenants = client.get("/api/v1/tenants", headers=headers).json()
    primary = next(row for row in tenants if row["is_primary"])
    source_tenant = client.post("/api/v1/tenants", headers=headers, json={"name": "MedizinHub Demo Clinic"}).json()
    target_tenant = client.post("/api/v1/tenants", headers=headers, json={"name": "Demo Single Clinic"}).json()

    source_role = client.post(
        "/api/v1/identity/roles",
        headers={**headers, "X-Tenant-ID": source_tenant["id"]},
        json={
            "name": "Staff Nurse",
            "key": "staff_nurse",
            "permission_keys": ["patients.read", "appointments.read"],
        },
    ).json()

    promoted = client.post(
        f"/api/v1/identity/roles/{source_role['id']}/assign/{primary['id']}",
        headers=headers,
    )
    assert promoted.status_code == 200
    promoted_body = promoted.json()
    assert promoted_body["tenant_id"] == primary["id"]
    assert promoted_body["key"] == "staff_nurse"
    assert promoted_body["source_template_role_id"] == source_role["id"]
    assert promoted_body["is_global_template"] is True
    assert promoted_body["is_template_locked"] is False

    copied = client.post(
        f"/api/v1/identity/roles/{source_role['id']}/assign/{target_tenant['id']}",
        headers=headers,
    )
    assert copied.status_code == 200
    copied_body = copied.json()
    assert copied_body["tenant_id"] == target_tenant["id"]
    assert copied_body["source_template_role_id"] == source_role["id"]
    assert copied_body["is_global_template"] is False
    assert copied_body["is_template_locked"] is True
    assert copied_body["permission_keys"] == ["appointments.read", "patients.read"]


def test_super_admin_role_cannot_be_assigned_to_customer_tenant(unauthenticated_client):
    client = unauthenticated_client
    super_token = bootstrap_super_admin(client)
    headers = {"Authorization": f"Bearer {super_token}"}
    tenant = create_tenant_with_paid_plan(client, super_token)
    tenants = client.get("/api/v1/tenants", headers=headers).json()
    primary = next(row for row in tenants if row["is_primary"])
    roles = client.get("/api/v1/identity/roles", headers={**headers, "X-Tenant-ID": primary["id"]}).json()
    super_role = next(row for row in roles if row["key"] == "super_admin")

    assigned = client.post(
        f"/api/v1/identity/roles/{super_role['id']}/assign/{tenant['id']}",
        headers=headers,
    )
    assert assigned.status_code == 400
    assert assigned.json()["detail"] == "Super Admin role can only belong to the primary MedizinHub HMS tenant"


def test_tenant_admin_cannot_change_locked_global_role_template(unauthenticated_client):
    client = unauthenticated_client
    super_token = bootstrap_super_admin(client)
    tenant = create_tenant_with_paid_plan(client, super_token)
    tenants = client.get("/api/v1/tenants", headers={"Authorization": f"Bearer {super_token}"}).json()
    primary = next(row for row in tenants if row["is_primary"])
    super_headers = {"Authorization": f"Bearer {super_token}"}
    tenant_headers = {**super_headers, "X-Tenant-ID": tenant["id"]}

    client.post(
        "/api/v1/identity/roles",
        headers=tenant_headers,
        json={"name": "Tenant Admin", "key": "tenant_admin", "permission_keys": ["identity.roles.edit"]},
    )
    client.post(
        "/api/v1/identity/users",
        headers=tenant_headers,
        json={
            "name": "Tenant Admin",
            "email": "tenant.lock.admin@test.local",
            "password": "TenantPass123",
            "role_keys": ["tenant_admin"],
        },
    )
    tenant_login = client.post(
        "/api/v1/auth/login",
        json={
            "email": "tenant.lock.admin@test.local",
            "password": "TenantPass123",
            "tenant_id": tenant["id"],
        },
    ).json()
    tenant_admin_headers = {"Authorization": f"Bearer {tenant_login['access_token']}", "X-Tenant-ID": tenant["id"]}

    template = client.post(
        "/api/v1/identity/roles",
        headers={**super_headers, "X-Tenant-ID": primary["id"]},
        json={"name": "Global Front Desk", "key": "global_front_desk", "permission_keys": ["appointments.read"]},
    ).json()
    assigned = client.post(
        f"/api/v1/identity/roles/{template['id']}/assign/{tenant['id']}",
        headers=super_headers,
    ).json()

    updated = client.patch(
        f"/api/v1/identity/roles/{assigned['id']}",
        headers=tenant_admin_headers,
        json={"name": "Changed By Tenant"},
    )
    assert updated.status_code == 403
    assert "global template" in updated.json()["detail"]
