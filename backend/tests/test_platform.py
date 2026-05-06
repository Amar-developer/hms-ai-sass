from fastapi.testclient import TestClient


def test_health_contract(client: TestClient):
    response = client.get("/api/v1/health")

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["service"] == "MedizinHub HMS API"
    assert body["version"] == "0.1.0"
    assert "checked_at" in body


def test_readiness_contract_starts_without_external_dependencies(client: TestClient):
    response = client.get("/api/v1/readiness")

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ready"
    assert body["dependencies"] == {
        "database": "not_configured",
        "redis": "not_configured",
        "object_storage": "not_configured",
    }


def test_tenant_context_echo_header(client: TestClient):
    response = client.get("/api/v1/health", headers={"X-Tenant-ID": "tenant_demo"})

    assert response.status_code == 200
    assert response.headers["X-Tenant-ID"] == "tenant_demo"


def test_module_manifest_contains_foundation_modules(client: TestClient):
    response = client.get("/api/v1/modules")

    assert response.status_code == 200
    modules = response.json()
    by_key = {module["key"]: module for module in modules}
    keys = set(by_key)
    assert {
        "identity",
        "tenants",
        "subscriptions",
        "audit",
        "patients",
        "appointments",
        "queue",
        "settings",
    }.issubset(keys)
    assert by_key["patients"]["category"] == "clinical"
    assert by_key["patients"]["default_enabled"] is True
    assert "patients.read" in by_key["patients"]["permissions"]
    assert "patients" in by_key["appointments"]["dependencies"]
    assert by_key["lab"]["entitlement_key"] == "lab"
    assert by_key["pharmacy"]["minimum_plan"] == "growth"
    assert by_key["whatsapp"]["category"] == "communication"


def test_platform_super_admin_can_manage_tenant_metadata(client: TestClient):
    created = client.post(
        "/api/v1/tenants",
        json={
            "name": "Platform Managed Hospital",
            "legal_name": "Platform Managed Hospital Pvt Ltd",
            "description": "A hospital tenant created by MedizinHub HMS primary tenant.",
            "email": "owner@hospital.test",
            "phone": "9000011111",
            "address": "Hospital Road, Chennai",
            "tenant_type": "general_hospital",
            "status": "trial",
        },
    )
    assert created.status_code == 201
    tenant = created.json()
    assert tenant["tenant_type"] == "general_hospital"
    assert tenant["email"] == "owner@hospital.test"
    assert tenant["is_primary"] is False

    updated = client.patch(
        f"/api/v1/tenants/{tenant['id']}",
        json={"status": "active", "tenant_type": "multi_specialty_hospital", "phone": "9000022222"},
    )
    assert updated.status_code == 200
    assert updated.json()["status"] == "active"
    assert updated.json()["tenant_type"] == "multi_specialty_hospital"

    fetched = client.get(f"/api/v1/tenants/{tenant['id']}")
    assert fetched.status_code == 200
    assert fetched.json()["phone"] == "9000022222"

    deleted = client.delete(f"/api/v1/tenants/{tenant['id']}")
    assert deleted.status_code == 200
    assert deleted.json()["mode"] == "suspended"

    after_delete = client.get(f"/api/v1/tenants/{tenant['id']}")
    assert after_delete.json()["status"] == "suspended"


def test_primary_tenant_is_protected_from_direct_status_and_type_changes(client: TestClient):
    created = client.post(
        "/api/v1/tenants",
        json={
            "name": "MedizinHub HMS",
            "legal_name": "MedizinHub HMS Platform",
            "tenant_type": "primary",
            "is_primary": True,
            "status": "active",
        },
    )
    assert created.status_code == 201
    tenant = created.json()

    rename = client.patch(f"/api/v1/tenants/{tenant['id']}", json={"name": "Other Platform"})
    assert rename.status_code == 400

    change_type = client.patch(f"/api/v1/tenants/{tenant['id']}", json={"tenant_type": "general_hospital"})
    assert change_type.status_code == 400

    suspend = client.delete(f"/api/v1/tenants/{tenant['id']}")
    assert suspend.status_code == 400


def test_super_admin_can_manage_tenant_departments(client: TestClient):
    created = client.post(
        "/api/v1/tenants",
        json={
            "name": "Department Managed Clinic",
            "tenant_type": "clinic",
            "status": "active",
        },
    )
    assert created.status_code == 201
    tenant = created.json()

    department = client.post(
        f"/api/v1/tenants/{tenant['id']}/departments",
        headers={"X-Tenant-ID": tenant["id"]},
        json={"name": "General Medicine", "description": "OP and primary care"},
    )
    assert department.status_code == 201
    department_body = department.json()
    assert department_body["tenant_id"] == tenant["id"]
    assert department_body["name"] == "General Medicine"
    assert department_body["code"] == "GENERAL_MEDICINE"
    assert department_body["is_active"] is True
    assert department_body["description"] == "OP and primary care"
    assert department_body["created_by_user_id"] is not None

    listing = client.get(f"/api/v1/tenants/{tenant['id']}/departments", headers={"X-Tenant-ID": tenant["id"]})
    assert listing.status_code == 200
    assert [row["name"] for row in listing.json()] == ["General Medicine"]

    updated = client.patch(
        f"/api/v1/tenants/{tenant['id']}/departments/{department_body['id']}",
        headers={"X-Tenant-ID": tenant["id"]},
        json={"name": "Family Medicine", "description": "Family clinic services"},
    )
    assert updated.status_code == 200
    assert updated.json()["name"] == "Family Medicine"
    assert updated.json()["code"] == "FAMILY_MEDICINE"

    deactivated = client.post(
        f"/api/v1/tenants/{tenant['id']}/departments/{department_body['id']}/status",
        headers={"X-Tenant-ID": tenant["id"]},
        json={"is_active": False},
    )
    assert deactivated.status_code == 200
    assert deactivated.json()["is_active"] is False

    deleted = client.delete(
        f"/api/v1/tenants/{tenant['id']}/departments/{department_body['id']}",
        headers={"X-Tenant-ID": tenant["id"]},
    )
    assert deleted.status_code == 200
    assert deleted.json()["mode"] == "deactivated"


def test_super_admin_can_assign_primary_department_template_to_customer_tenant(client: TestClient):
    primary = client.post(
        "/api/v1/tenants",
        json={
            "name": "MedizinHub HMS",
            "tenant_type": "primary",
            "is_primary": True,
            "status": "active",
        },
    ).json()
    tenant = client.post(
        "/api/v1/tenants",
        json={"name": "Template Assigned Clinic", "tenant_type": "clinic", "status": "active"},
    ).json()
    template = client.post(
        f"/api/v1/tenants/{primary['id']}/departments",
        headers={"X-Tenant-ID": primary["id"]},
        json={"name": "Cardiology", "description": "Heart care"},
    ).json()

    assigned = client.post(f"/api/v1/tenants/departments/{template['id']}/assign/{tenant['id']}")
    assert assigned.status_code == 200
    body = assigned.json()
    assert body["tenant_id"] == tenant["id"]
    assert body["name"] == "Cardiology"
    assert body["code"] == "CARDIOLOGY"
    assert body["source_template_department_id"] == template["id"]
    assert body["is_template_locked"] is True
    assert body["is_global_template"] is False

    assigned_again = client.post(f"/api/v1/tenants/departments/{template['id']}/assign/{tenant['id']}")
    assert assigned_again.status_code == 200
    listing = client.get(f"/api/v1/tenants/{tenant['id']}/departments", headers={"X-Tenant-ID": tenant["id"]})
    assert [row["code"] for row in listing.json()] == ["CARDIOLOGY"]


def test_tenant_admin_cannot_change_locked_global_department_template(unauthenticated_client):
    from backend.tests.test_identity_auth import bootstrap_super_admin, create_tenant_with_paid_plan

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
        json={"name": "Tenant Admin", "key": "tenant_admin", "permission_keys": ["settings.manage"]},
    )
    client.post(
        "/api/v1/identity/users",
        headers=tenant_headers,
        json={
            "name": "Tenant Admin",
            "email": "department.lock.admin@test.local",
            "password": "TenantPass123",
            "role_keys": ["tenant_admin"],
        },
    )
    tenant_login = client.post(
        "/api/v1/auth/login",
        json={
            "email": "department.lock.admin@test.local",
            "password": "TenantPass123",
            "tenant_id": tenant["id"],
        },
    ).json()
    tenant_admin_headers = {"Authorization": f"Bearer {tenant_login['access_token']}", "X-Tenant-ID": tenant["id"]}

    template = client.post(
        f"/api/v1/tenants/{primary['id']}/departments",
        headers={**super_headers, "X-Tenant-ID": primary["id"]},
        json={"name": "Global Cardiology", "description": "Heart care"},
    ).json()
    assigned = client.post(
        f"/api/v1/tenants/departments/{template['id']}/assign/{tenant['id']}",
        headers=super_headers,
    ).json()

    updated = client.patch(
        f"/api/v1/tenants/{tenant['id']}/departments/{assigned['id']}",
        headers=tenant_admin_headers,
        json={"name": "Changed By Tenant"},
    )
    assert updated.status_code == 403
    assert "global template" in updated.json()["detail"]


def test_tenant_can_have_multiple_branches_with_audit_metadata(client: TestClient):
    created = client.post(
        "/api/v1/tenants",
        json={
            "name": "Multi Branch Clinic",
            "tenant_type": "polyclinic",
            "status": "trial",
        },
    )
    assert created.status_code == 201
    tenant = created.json()
    assert tenant["created_by_user_id"] is not None
    assert tenant["updated_by_user_id"] is not None

    first = client.post(
        f"/api/v1/tenants/{tenant['id']}/branches",
        headers={"X-Tenant-ID": tenant["id"]},
        json={"name": "Main Branch", "code": "MAIN", "city": "Chennai"},
    )
    second = client.post(
        f"/api/v1/tenants/{tenant['id']}/branches",
        headers={"X-Tenant-ID": tenant["id"]},
        json={"name": "North Branch", "code": "NORTH", "city": "Chennai"},
    )
    listing = client.get(f"/api/v1/tenants/{tenant['id']}/branches", headers={"X-Tenant-ID": tenant["id"]})

    assert first.status_code == 201
    assert second.status_code == 201
    assert first.json()["created_by_user_id"] is not None
    assert first.json()["updated_at"] is not None
    assert listing.status_code == 200
    assert [branch["name"] for branch in listing.json()] == ["North Branch", "Main Branch"]

    updated = client.patch(
        f"/api/v1/tenants/{tenant['id']}/branches/{first.json()['id']}",
        headers={"X-Tenant-ID": tenant["id"]},
        json={"name": "Main Branch Updated", "code": "MAIN", "city": "Coimbatore", "is_active": False},
    )
    assert updated.status_code == 200
    assert updated.json()["name"] == "Main Branch Updated"
    assert updated.json()["city"] == "Coimbatore"
    assert updated.json()["is_active"] is False


def test_super_admin_can_assign_primary_branch_template_to_customer_tenant(client: TestClient):
    primary = client.post(
        "/api/v1/tenants",
        json={"name": "MedizinHub HMS", "tenant_type": "primary", "is_primary": True, "status": "active"},
    ).json()
    tenant = client.post(
        "/api/v1/tenants",
        json={"name": "Branch Template Clinic", "tenant_type": "clinic", "status": "active"},
    ).json()
    template = client.post(
        f"/api/v1/tenants/{primary['id']}/branches",
        headers={"X-Tenant-ID": primary["id"]},
        json={"name": "Main Branch", "code": "MAIN", "city": "Chennai"},
    ).json()

    assigned = client.post(f"/api/v1/tenants/branches/{template['id']}/assign/{tenant['id']}")
    assert assigned.status_code == 200
    body = assigned.json()
    assert body["tenant_id"] == tenant["id"]
    assert body["source_template_branch_id"] == template["id"]
    assert body["is_template_locked"] is True
    assert body["is_global_template"] is False


def test_super_admin_can_promote_customer_department_and_branch_to_primary_templates(client: TestClient):
    primary = client.post(
        "/api/v1/tenants",
        json={"name": "MedizinHub HMS", "tenant_type": "primary", "is_primary": True, "status": "active"},
    ).json()
    source_tenant = client.post(
        "/api/v1/tenants",
        json={"name": "MedizinHub Demo Clinic", "tenant_type": "clinic", "status": "active"},
    ).json()
    target_tenant = client.post(
        "/api/v1/tenants",
        json={"name": "Demo Single Clinic", "tenant_type": "clinic", "status": "active"},
    ).json()
    source_department = client.post(
        f"/api/v1/tenants/{source_tenant['id']}/departments",
        headers={"X-Tenant-ID": source_tenant["id"]},
        json={"name": "Diabetology", "description": "Diabetes care"},
    ).json()
    source_branch = client.post(
        f"/api/v1/tenants/{source_tenant['id']}/branches",
        headers={"X-Tenant-ID": source_tenant["id"]},
        json={"name": "OP Main Branch", "code": "OP_MAIN", "city": "Chennai"},
    ).json()

    promoted_department = client.post(
        f"/api/v1/tenants/departments/{source_department['id']}/assign/{primary['id']}"
    )
    assert promoted_department.status_code == 200
    assert promoted_department.json()["is_global_template"] is True
    assert promoted_department.json()["is_template_locked"] is False
    assert promoted_department.json()["source_template_department_id"] == source_department["id"]

    copied_department = client.post(
        f"/api/v1/tenants/departments/{source_department['id']}/assign/{target_tenant['id']}"
    )
    assert copied_department.status_code == 200
    assert copied_department.json()["is_global_template"] is False
    assert copied_department.json()["is_template_locked"] is True

    promoted_branch = client.post(f"/api/v1/tenants/branches/{source_branch['id']}/assign/{primary['id']}")
    assert promoted_branch.status_code == 200
    assert promoted_branch.json()["is_global_template"] is True
    assert promoted_branch.json()["is_template_locked"] is False
    assert promoted_branch.json()["source_template_branch_id"] == source_branch["id"]

    copied_branch = client.post(f"/api/v1/tenants/branches/{source_branch['id']}/assign/{target_tenant['id']}")
    assert copied_branch.status_code == 200
    assert copied_branch.json()["is_global_template"] is False
    assert copied_branch.json()["is_template_locked"] is True


def test_branch_status_and_delete_are_soft_actions(client: TestClient):
    tenant = client.post(
        "/api/v1/tenants",
        json={"name": "Branch CRUD Clinic", "tenant_type": "clinic", "status": "active"},
    ).json()
    branch = client.post(
        f"/api/v1/tenants/{tenant['id']}/branches",
        headers={"X-Tenant-ID": tenant["id"]},
        json={"name": "North Branch", "code": "NORTH", "city": "Chennai"},
    ).json()

    inactive = client.post(
        f"/api/v1/tenants/{tenant['id']}/branches/{branch['id']}/status",
        headers={"X-Tenant-ID": tenant["id"]},
        json={"is_active": False},
    )
    assert inactive.status_code == 200
    assert inactive.json()["is_active"] is False

    deleted = client.delete(
        f"/api/v1/tenants/{tenant['id']}/branches/{branch['id']}",
        headers={"X-Tenant-ID": tenant["id"]},
    )
    assert deleted.status_code == 200
    assert deleted.json()["mode"] == "deactivated"


def test_tenant_admin_cannot_change_locked_global_branch_template(unauthenticated_client):
    from backend.tests.test_identity_auth import bootstrap_super_admin, create_tenant_with_paid_plan

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
        json={"name": "Tenant Admin", "key": "tenant_admin", "permission_keys": ["settings.manage"]},
    )
    client.post(
        "/api/v1/identity/users",
        headers=tenant_headers,
        json={
            "name": "Tenant Admin",
            "email": "branch.lock.admin@test.local",
            "password": "TenantPass123",
            "role_keys": ["tenant_admin"],
        },
    )
    tenant_login = client.post(
        "/api/v1/auth/login",
        json={"email": "branch.lock.admin@test.local", "password": "TenantPass123", "tenant_id": tenant["id"]},
    ).json()
    tenant_admin_headers = {"Authorization": f"Bearer {tenant_login['access_token']}", "X-Tenant-ID": tenant["id"]}

    template = client.post(
        f"/api/v1/tenants/{primary['id']}/branches",
        headers={**super_headers, "X-Tenant-ID": primary["id"]},
        json={"name": "Global Main Branch", "code": "GLOBAL_MAIN", "city": "Chennai"},
    ).json()
    assigned = client.post(
        f"/api/v1/tenants/branches/{template['id']}/assign/{tenant['id']}",
        headers=super_headers,
    ).json()

    updated = client.patch(
        f"/api/v1/tenants/{tenant['id']}/branches/{assigned['id']}",
        headers=tenant_admin_headers,
        json={"name": "Changed By Tenant"},
    )
    assert updated.status_code == 403
    assert "global template" in updated.json()["detail"]
