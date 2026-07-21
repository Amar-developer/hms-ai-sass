import sys

sys.path.insert(0, ".")


def _bootstrap_super_admin(client):
    resp = client.post(
        "/api/v1/auth/bootstrap-super-admin",
        json={"name": "Root", "email": "root@test.local", "password": "RootPass123"},
    )
    assert resp.status_code == 201
    login = client.post(
        "/api/v1/auth/login",
        json={"email": "root@test.local", "password": "RootPass123"},
    )
    assert login.status_code == 200
    return login.cookies["access_token"]


def test_patch_role_keys_persists(unauthenticated_client):
    client = unauthenticated_client
    super_token = _bootstrap_super_admin(client)
    tenant = client.post("/api/v1/tenants", json={"name": "RoleKeysTest Clinic"}).json()
    headers = {"Authorization": f"Bearer {super_token}", "X-Tenant-ID": tenant["id"]}

    client.post(
        "/api/v1/identity/roles",
        headers=headers,
        json={"name": "Nurse", "key": "nurse", "permission_keys": []},
    )
    client.post(
        "/api/v1/identity/roles",
        headers=headers,
        json={"name": "Lab Tech", "key": "lab", "permission_keys": []},
    )

    user = client.post(
        "/api/v1/identity/users",
        headers=headers,
        json={
            "name": "Role Keys User",
            "email": "rolekeys@test.local",
            "password": "RoleKeys123",
            "role_keys": ["nurse"],
        },
    ).json()

    print("Initial roles:", user["roles"])
    assert user["roles"] == ["nurse"]

    patch_resp = client.patch(
        f"/api/v1/identity/users/{user['id']}",
        headers=headers,
        json={"role_keys": ["nurse", "lab"]},
    )
    print("PATCH status:", patch_resp.status_code)
    print("PATCH response roles:", patch_resp.json().get("roles"))
    assert patch_resp.status_code == 200
    assert set(patch_resp.json()["roles"]) == {"nurse", "lab"}

    fetched = client.get("/api/v1/identity/users", headers=headers).json()
    saved = next(r for r in fetched if r["id"] == user["id"])
    print("Refetched roles:", saved["roles"])
    assert set(saved["roles"]) == {"nurse", "lab"}
