def test_limited_role_can_read_patients_but_cannot_write_or_manage_settings(client):
    tenant = client.post("/api/v1/tenants", json={"name": "RBAC Clinic"}).json()
    patient = client.post(
        "/api/v1/patients",
        headers={"X-Tenant-ID": tenant["id"]},
        json={"full_name": "RBAC Demo Patient", "mobile": "9876500000"},
    )
    assert patient.status_code == 201

    role = client.post(
        "/api/v1/identity/roles",
        headers={"X-Tenant-ID": tenant["id"]},
        json={"name": "Patient Viewer", "key": "patient_viewer", "permission_keys": ["patients.read"]},
    )
    assert role.status_code == 201
    user = client.post(
        "/api/v1/identity/users",
        headers={"X-Tenant-ID": tenant["id"]},
        json={
            "name": "Patient Viewer",
            "email": "patient.viewer@test.local",
            "password": "ViewerPass123",
            "role_keys": ["patient_viewer"],
        },
    )
    assert user.status_code == 201
    login = client.post(
        "/api/v1/auth/login",
        json={
            "email": "patient.viewer@test.local",
            "password": "ViewerPass123",
            "tenant_id": tenant["id"],
        },
    )
    token = login.json()["access_token"]
    limited_headers = {"Authorization": f"Bearer {token}", "X-Tenant-ID": tenant["id"]}

    can_read = client.get("/api/v1/patients", headers=limited_headers)
    assert can_read.status_code == 200

    cannot_write = client.post(
        "/api/v1/patients",
        headers=limited_headers,
        json={"full_name": "Denied Patient", "mobile": "9876500001"},
    )
    assert cannot_write.status_code == 403

    cannot_manage_settings = client.get("/api/v1/settings", headers=limited_headers)
    assert cannot_manage_settings.status_code == 403


def test_authenticated_user_cannot_cross_tenant_with_permission(client):
    tenant = client.post("/api/v1/tenants", json={"name": "RBAC Clinic A"}).json()
    other_tenant = client.post("/api/v1/tenants", json={"name": "RBAC Clinic B"}).json()
    client.post(
        "/api/v1/identity/roles",
        headers={"X-Tenant-ID": tenant["id"]},
        json={"name": "Reception", "key": "reception", "permission_keys": ["appointments.manage"]},
    )
    client.post(
        "/api/v1/identity/users",
        headers={"X-Tenant-ID": tenant["id"]},
        json={
            "name": "Reception User",
            "email": "reception.cross@test.local",
            "password": "ReceptionPass123",
            "role_keys": ["reception"],
        },
    )
    login = client.post(
        "/api/v1/auth/login",
        json={
            "email": "reception.cross@test.local",
            "password": "ReceptionPass123",
            "tenant_id": tenant["id"],
        },
    )
    token = login.json()["access_token"]

    response = client.get(
        "/api/v1/appointments",
        headers={"Authorization": f"Bearer {token}", "X-Tenant-ID": other_tenant["id"]},
    )
    assert response.status_code == 403


def test_missing_bearer_token_is_rejected_on_protected_module(unauthenticated_client):
    tenant = unauthenticated_client.post(
        "/api/v1/tenants",
        json={"name": "Unauthorized Clinic"},
    )
    assert tenant.status_code == 401


def test_inactive_role_no_longer_grants_permissions(client):
    tenant = client.post("/api/v1/tenants", json={"name": "Inactive Role Clinic"}).json()
    role = client.post(
        "/api/v1/identity/roles",
        headers={"X-Tenant-ID": tenant["id"]},
        json={"name": "Patient Viewer", "key": "inactive_patient_viewer", "permission_keys": ["patients.read"]},
    ).json()
    client.post(
        "/api/v1/identity/users",
        headers={"X-Tenant-ID": tenant["id"]},
        json={
            "name": "Inactive Role User",
            "email": "inactive.role@test.local",
            "password": "InactivePass123",
            "role_keys": ["inactive_patient_viewer"],
        },
    )
    client.post(
        f"/api/v1/identity/roles/{role['id']}/status",
        headers={"X-Tenant-ID": tenant["id"]},
        json={"is_active": False},
    )
    login = client.post(
        "/api/v1/auth/login",
        json={"email": "inactive.role@test.local", "password": "InactivePass123", "tenant_id": tenant["id"]},
    )

    response = client.get(
        "/api/v1/patients",
        headers={"Authorization": f"Bearer {login.json()['access_token']}", "X-Tenant-ID": tenant["id"]},
    )

    assert response.status_code == 403
    assert response.json()["detail"] == "Permission denied"


def test_suspended_tenant_blocks_tenant_user_access(client):
    tenant = client.post("/api/v1/tenants", json={"name": "Suspended Access Clinic"}).json()
    client.post(
        "/api/v1/identity/roles",
        headers={"X-Tenant-ID": tenant["id"]},
        json={"name": "Patient Viewer", "key": "suspended_patient_viewer", "permission_keys": ["patients.read"]},
    )
    client.post(
        "/api/v1/identity/users",
        headers={"X-Tenant-ID": tenant["id"]},
        json={
            "name": "Suspended User",
            "email": "suspended.user@test.local",
            "password": "SuspendedPass123",
            "role_keys": ["suspended_patient_viewer"],
        },
    )
    login = client.post(
        "/api/v1/auth/login",
        json={"email": "suspended.user@test.local", "password": "SuspendedPass123", "tenant_id": tenant["id"]},
    )
    client.patch(f"/api/v1/tenants/{tenant['id']}", json={"status": "suspended"})

    response = client.get(
        "/api/v1/patients",
        headers={"Authorization": f"Bearer {login.json()['access_token']}", "X-Tenant-ID": tenant["id"]},
    )

    assert response.status_code == 403
    assert response.json()["detail"] == "Tenant is suspended"


def test_branch_scoped_user_can_read_tenant_patient_from_other_branch(client):
    tenant = client.post("/api/v1/tenants", json={"name": "Branch Scoped Clinic"}).json()
    main = client.post(
        f"/api/v1/tenants/{tenant['id']}/branches",
        json={"name": "Main Branch", "code": "MAIN"},
    ).json()
    other = client.post(
        f"/api/v1/tenants/{tenant['id']}/branches",
        json={"name": "Other Branch", "code": "OTHER"},
    ).json()
    patient = client.post(
        "/api/v1/patients",
        headers={"X-Tenant-ID": tenant["id"]},
        json={"full_name": "Other Branch Patient", "branch_id": other["id"]},
    ).json()
    client.post(
        "/api/v1/identity/roles",
        headers={"X-Tenant-ID": tenant["id"]},
        json={"name": "Patient Viewer", "key": "branch_patient_viewer", "permission_keys": ["patients.read"]},
    )
    client.post(
        "/api/v1/identity/users",
        headers={"X-Tenant-ID": tenant["id"]},
        json={
            "name": "Main Branch User",
            "email": "main.branch.viewer@test.local",
            "password": "BranchPass123",
            "branch_id": main["id"],
            "role_keys": ["branch_patient_viewer"],
        },
    )
    login = client.post(
        "/api/v1/auth/login",
        json={"email": "main.branch.viewer@test.local", "password": "BranchPass123", "tenant_id": tenant["id"]},
    )

    response = client.get(
        f"/api/v1/patients/{patient['id']}",
        headers={"Authorization": f"Bearer {login.json()['access_token']}", "X-Tenant-ID": tenant["id"]},
    )
    search = client.get(
        "/api/v1/patients?q=Other",
        headers={"Authorization": f"Bearer {login.json()['access_token']}", "X-Tenant-ID": tenant["id"]},
    )

    assert response.status_code == 200
    assert response.json()["id"] == patient["id"]
    assert search.status_code == 200
    assert [row["id"] for row in search.json()] == [patient["id"]]
