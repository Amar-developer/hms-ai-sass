from datetime import date

from app.modules.identity.services.helpers import (
    normalize_user_access as _normalize_user_access,
)


def bootstrap_super_admin(client):
    response = client.post(
        "/api/v1/auth/bootstrap-super-admin",
        json={
            "name": "Platform Admin",
            "email": "admin@medizinhub.test",
            "password": "SecretPass123",
        },
    )
    assert response.status_code == 201
    login = client.post(
        "/api/v1/auth/login",
        json={"email": "admin@medizinhub.test", "password": "SecretPass123"},
    )
    assert login.status_code == 200
    return login.cookies["access_token"]


def create_tenant_with_paid_plan(client, super_token):
    headers = {"Authorization": f"Bearer {super_token}"}
    tenant = client.post(
        "/api/v1/tenants", headers=headers, json={"name": "Identity Clinic"}
    ).json()
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
    tenant_admin_role = next(
        row for row in roles.json() if row["key"] == "tenant_admin"
    )
    assert tenant_admin_role["tenant_id"] == primary["id"]
    assert tenant_admin_role["name"] == "Tenant Admin"
    assert tenant_admin_role["is_global_template"] is True
    assert "identity.users.manage" in tenant_admin_role["permission_keys"]
    assert "settings.manage" in tenant_admin_role["permission_keys"]
    assert "platform.tenants.manage" not in tenant_admin_role["permission_keys"]
    assert "platform.subscriptions.manage" not in tenant_admin_role["permission_keys"]


def test_bootstrap_super_admin_can_manage_default_subscription_catalog(
    unauthenticated_client,
):
    client = unauthenticated_client
    token = bootstrap_super_admin(client)
    headers = {"Authorization": f"Bearer {token}"}
    plans = client.get("/api/v1/subscription-plans", headers=headers)

    assert plans.status_code == 200
    keys = {row["key"] for row in plans.json()}
    assert {"free_trial", "starter", "growth", "pro", "hospital"}.issubset(keys)

    primary = next(
        row
        for row in client.get("/api/v1/tenants", headers=headers).json()
        if row["is_primary"]
    )
    starter = next(row for row in plans.json() if row["key"] == "starter")
    primary_subscription = client.post(
        "/api/v1/subscription-plans/tenant-subscriptions",
        headers={**headers, "X-Tenant-ID": primary["id"]},
        json={"plan_id": starter["id"], "starts_on": date.today().isoformat()},
    )
    assert primary_subscription.status_code == 400
    assert (
        primary_subscription.json()["detail"]
        == "Primary platform tenant does not need a customer subscription"
    )


def test_super_admin_can_update_primary_tenant_contact_fields(unauthenticated_client):
    client = unauthenticated_client
    token = bootstrap_super_admin(client)
    headers = {"Authorization": f"Bearer {token}"}
    tenants = client.get("/api/v1/tenants", headers=headers).json()
    primary = next(row for row in tenants if row["is_primary"])

    updated = client.patch(
        f"/api/v1/tenants/{primary['id']}",
        headers=headers,
        json={
            "name": "MedizinHub HMS",
            "legal_name": "MedizinHub HMS Platform",
            "description": "Primary platform tenant",
            "email": "ops@medizinhub.local",
            "phone": "9000000000",
            "address": "Platform Office",
            "tenant_type": "primary",
            "status": "active",
            "country": "IN",
            "timezone": "Asia/Kolkata",
        },
    )

    assert updated.status_code == 200
    assert updated.json()["email"] == "ops@medizinhub.local"
    assert updated.json()["is_primary"] is True


def test_logout_revokes_current_session(unauthenticated_client):
    client = unauthenticated_client
    token = bootstrap_super_admin(client)

    logout = client.post(
        "/api/v1/auth/logout", headers={"Authorization": f"Bearer {token}"}
    )
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
    tenant_token = login.cookies["access_token"]

    own_users = client.get(
        "/api/v1/identity/users",
        headers={
            "Authorization": f"Bearer {tenant_token}",
            "X-Tenant-ID": tenant["id"],
        },
    )
    assert own_users.status_code == 200
    assert [row["email"] for row in own_users.json()] == ["clinic.admin@test.local"]

    cross_tenant = client.get(
        "/api/v1/identity/users",
        headers={
            "Authorization": f"Bearer {tenant_token}",
            "X-Tenant-ID": other_tenant["id"],
        },
    )
    assert cross_tenant.status_code == 403


def test_super_admin_user_creation_auto_creates_missing_tenant_admin_role(
    unauthenticated_client,
):
    client = unauthenticated_client
    super_token = bootstrap_super_admin(client)
    tenant = create_tenant_with_paid_plan(client, super_token)
    headers = {"Authorization": f"Bearer {super_token}", "X-Tenant-ID": tenant["id"]}

    created = client.post(
        "/api/v1/identity/users",
        headers=headers,
        json={
            "name": "Clinic Admin",
            "email": "auto.admin@test.local",
            "password": "ClinicPass123",
            "user_type": "tenant_admin",
            "role_keys": ["tenant_admin"],
        },
    )

    assert created.status_code == 201
    assert created.json()["roles"] == ["tenant_admin"]
    roles = client.get("/api/v1/identity/roles", headers=headers)
    tenant_admin_role = next(
        row for row in roles.json() if row["key"] == "tenant_admin"
    )
    assert tenant_admin_role["name"] == "Tenant Admin"
    assert "identity.users.manage" in tenant_admin_role["permission_keys"]
    assert "platform.tenants.manage" not in tenant_admin_role["permission_keys"]


def test_identity_actions_are_audited(unauthenticated_client):
    client = unauthenticated_client
    super_token = bootstrap_super_admin(client)
    tenant = create_tenant_with_paid_plan(client, super_token)

    client.post(
        "/api/v1/identity/roles",
        headers={"Authorization": f"Bearer {super_token}", "X-Tenant-ID": tenant["id"]},
        json={
            "name": "Staff",
            "key": "staff",
            "permission_keys": ["appointments.manage"],
        },
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


def test_identity_users_manage_permission_can_manage_users_without_tenant_admin_role(
    client,
):
    tenant = client.post(
        "/api/v1/tenants", json={"name": "Delegated User Clinic"}
    ).json()
    role = client.post(
        "/api/v1/identity/roles",
        headers={"X-Tenant-ID": tenant["id"]},
        json={
            "name": "User Manager",
            "key": "user_manager",
            "permission_keys": ["identity.users.manage"],
        },
    ).json()
    operator = client.post(
        "/api/v1/identity/users",
        headers={"X-Tenant-ID": tenant["id"]},
        json={
            "name": "Nurse User Manager",
            "email": "nurse.user.manager@test.local",
            "password": "UserManage123",
            "user_type": "nurse",
            "role_keys": [role["key"]],
        },
    ).json()
    login = client.post(
        "/api/v1/auth/login",
        json={
            "email": operator["email"],
            "password": "UserManage123",
            "tenant_id": tenant["id"],
        },
    )
    headers = {
        "Authorization": f"Bearer {login.cookies['access_token']}",
        "X-Tenant-ID": tenant["id"],
    }

    users = client.get("/api/v1/identity/users", headers=headers)
    roles = client.get("/api/v1/identity/roles", headers=headers)
    created = client.post(
        "/api/v1/identity/users",
        headers=headers,
        json={
            "name": "Front Desk From Nurse",
            "email": "frontdesk.from.nurse@test.local",
            "password": "FrontDesk123",
            "user_type": "reception",
            "role_keys": [],
        },
    )
    blocked_role_create = client.post(
        "/api/v1/identity/roles",
        headers=headers,
        json={
            "name": "Should Not Create Role",
            "key": "blocked_role",
            "permission_keys": [],
        },
    )

    assert users.status_code == 200
    assert roles.status_code == 200
    assert created.status_code == 201
    assert created.json()["created_by_user_id"] == operator["id"]
    assert blocked_role_create.status_code == 403


def test_tenant_user_update_status_and_delete_are_supported(unauthenticated_client):
    client = unauthenticated_client
    super_token = bootstrap_super_admin(client)
    tenant = create_tenant_with_paid_plan(client, super_token)
    headers = {"Authorization": f"Bearer {super_token}", "X-Tenant-ID": tenant["id"]}

    client.post(
        "/api/v1/identity/roles",
        headers=headers,
        json={
            "name": "Staff",
            "key": "staff",
            "permission_keys": ["appointments.manage"],
        },
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
        json={
            "name": "Reception Lead",
            "mobile": "9000000001",
            "must_change_password": False,
        },
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
    assert saved_user["email"] == user["email"]

    restored = client.post(
        f"/api/v1/identity/users/{user['id']}/status",
        headers=headers,
        json={"is_active": True},
    )
    login = client.post(
        "/api/v1/auth/login",
        json={
            "email": user["email"],
            "password": "StaffPass123",
            "tenant_id": tenant["id"],
        },
    )

    assert restored.status_code == 200
    assert restored.json()["email"] == user["email"]
    assert login.status_code == 200


def test_tenant_admin_user_type_enforces_tenant_admin_role():
    normalized = _normalize_user_access(
        {
            "user_type": "tenant_admin",
            "role_keys": ["doctor"],
            "branch_id": "branch_main",
        }
    )

    assert normalized["user_type"] == "tenant_admin"
    assert normalized["role_keys"] == ["doctor", "tenant_admin"]
    assert normalized["branch_id"] is None


def test_role_crud_metadata_and_latest_first_ordering(unauthenticated_client):
    client = unauthenticated_client
    super_token = bootstrap_super_admin(client)
    tenant = create_tenant_with_paid_plan(client, super_token)
    headers = {"Authorization": f"Bearer {super_token}", "X-Tenant-ID": tenant["id"]}

    first = client.post(
        "/api/v1/identity/roles",
        headers=headers,
        json={
            "name": "Front Office",
            "key": "front_office",
            "permission_keys": ["appointments.manage"],
        },
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
        json={
            "name": "Billing Desk",
            "key": "billing_desk",
            "permission_keys": ["billing.manage"],
        },
    ).json()

    updated = client.patch(
        f"/api/v1/identity/roles/{first_role['id']}",
        headers=headers,
        json={
            "name": "Front Office Lead",
            "key": "front_office_lead",
            "is_active": True,
        },
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


def test_same_name_tenant_roles_share_permission_updates(unauthenticated_client):
    client = unauthenticated_client
    super_token = bootstrap_super_admin(client)
    tenant = create_tenant_with_paid_plan(client, super_token)
    headers = {"Authorization": f"Bearer {super_token}", "X-Tenant-ID": tenant["id"]}

    base = client.post(
        "/api/v1/identity/roles",
        headers=headers,
        json={
            "name": "Receptionist",
            "key": "receptionist",
            "permission_keys": ["appointments.read"],
        },
    ).json()
    branch = client.post(
        "/api/v1/identity/roles",
        headers=headers,
        json={
            "name": "Receptionist",
            "key": "sun_main_receptionist",
            "permission_keys": ["appointments.read"],
        },
    ).json()
    client.post(
        "/api/v1/identity/users",
        headers=headers,
        json={
            "name": "Lavanya Kannan",
            "email": "lavanya.receptionist@identity.test",
            "password": "SecretPass123",
            "user_type": "receptionist",
            "role_keys": [branch["key"]],
        },
    )

    updated = client.patch(
        f"/api/v1/identity/roles/{base['id']}",
        headers=headers,
        json={
            "permission_keys": [
                "appointments.read",
                "consultations.read",
                "consultations.write",
                "consultations.sign",
            ],
        },
    )
    assert updated.status_code == 200

    login = client.post(
        "/api/v1/auth/login",
        json={
            "email": "lavanya.receptionist@identity.test",
            "password": "SecretPass123",
        },
    )
    assert login.status_code == 200
    me = client.get(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {login.cookies['access_token']}"},
    ).json()
    assert me["roles"] == ["receptionist"]
    assert "consultations.write" in me["permissions"]
    assert "consultations.sign" in me["permissions"]

    roles = client.get("/api/v1/identity/roles", headers=headers).json()
    assert branch["id"] not in {row["id"] for row in roles}
    canonical = next(row for row in roles if row["id"] == base["id"])
    assert "consultations.sign" in canonical["permission_keys"]


def test_super_admin_can_assign_primary_role_template_to_customer_tenant(
    unauthenticated_client,
):
    client = unauthenticated_client
    super_token = bootstrap_super_admin(client)
    tenant = create_tenant_with_paid_plan(client, super_token)
    tenants = client.get(
        "/api/v1/tenants", headers={"Authorization": f"Bearer {super_token}"}
    ).json()
    primary = next(row for row in tenants if row["is_primary"])

    catalog = client.get(
        "/api/v1/identity/permissions",
        headers={
            "Authorization": f"Bearer {super_token}",
            "X-Tenant-ID": primary["id"],
        },
    )
    assert catalog.status_code == 200
    assert {"create", "read", "edit", "delete"}.issubset(
        {row["action"] for row in catalog.json() if row["module"] == "appointments"}
    )
    assert {"manage", "create", "read", "edit", "delete"}.issubset(
        {row["action"] for row in catalog.json() if row["module"] == "identity.users"}
    )
    assert {"manage", "create", "read", "edit", "delete"}.issubset(
        {row["action"] for row in catalog.json() if row["module"] == "branches"}
    )
    assert {"manage", "create", "read", "edit", "delete"}.issubset(
        {row["action"] for row in catalog.json() if row["module"] == "departments"}
    )
    assert {"manage", "create", "read", "edit", "delete"}.issubset(
        {row["action"] for row in catalog.json() if row["module"] == "scheduling"}
    )

    template = client.post(
        "/api/v1/identity/roles",
        headers={
            "Authorization": f"Bearer {super_token}",
            "X-Tenant-ID": primary["id"],
        },
        json={
            "name": "Appointment Operator",
            "key": "appointment_operator",
            "permission_keys": [
                "appointments.create",
                "appointments.read",
                "appointments.edit",
            ],
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
    assert body["permission_keys"] == [
        "appointments.create",
        "appointments.edit",
        "appointments.read",
    ]


def test_super_admin_can_promote_customer_role_to_primary_and_copy_to_other_tenant(
    unauthenticated_client,
):
    client = unauthenticated_client
    super_token = bootstrap_super_admin(client)
    headers = {"Authorization": f"Bearer {super_token}"}
    tenants = client.get("/api/v1/tenants", headers=headers).json()
    primary = next(row for row in tenants if row["is_primary"])
    source_tenant = client.post(
        "/api/v1/tenants", headers=headers, json={"name": "MedizinHub Demo Clinic"}
    ).json()
    target_tenant = client.post(
        "/api/v1/tenants", headers=headers, json={"name": "Demo Single Clinic"}
    ).json()

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
    roles = client.get(
        "/api/v1/identity/roles", headers={**headers, "X-Tenant-ID": primary["id"]}
    ).json()
    super_role = next(row for row in roles if row["key"] == "super_admin")

    assigned = client.post(
        f"/api/v1/identity/roles/{super_role['id']}/assign/{tenant['id']}",
        headers=headers,
    )
    assert assigned.status_code == 400
    assert (
        assigned.json()["detail"]
        == "Super Admin role can only belong to the primary MedizinHub HMS tenant"
    )


def test_tenant_admin_cannot_change_locked_global_role_template(unauthenticated_client):
    client = unauthenticated_client
    super_token = bootstrap_super_admin(client)
    tenant = create_tenant_with_paid_plan(client, super_token)
    tenants = client.get(
        "/api/v1/tenants", headers={"Authorization": f"Bearer {super_token}"}
    ).json()
    primary = next(row for row in tenants if row["is_primary"])
    super_headers = {"Authorization": f"Bearer {super_token}"}
    tenant_headers = {**super_headers, "X-Tenant-ID": tenant["id"]}

    client.post(
        "/api/v1/identity/roles",
        headers=tenant_headers,
        json={
            "name": "Tenant Admin",
            "key": "tenant_admin",
            "permission_keys": ["identity.roles.edit"],
        },
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
    )
    tenant_admin_headers = {
        "Authorization": f"Bearer {tenant_login.cookies['access_token']}",
        "X-Tenant-ID": tenant["id"],
    }

    template = client.post(
        "/api/v1/identity/roles",
        headers={**super_headers, "X-Tenant-ID": primary["id"]},
        json={
            "name": "Global Front Desk",
            "key": "global_front_desk",
            "permission_keys": ["appointments.read"],
        },
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
