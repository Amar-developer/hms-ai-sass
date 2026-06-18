from datetime import date


ALL_MATRIX_MODULES = [
    "patients",
    "appointments",
    "queue",
    "consultations",
    "billing_basic",
    "billing_advanced",
    "lab",
    "pharmacy",
    "notifications",
    "whatsapp",
    "sms",
    "voice",
    "reports",
]


READ_ENDPOINTS = {
    "patients": ("/api/v1/patients", "patients.read"),
    "appointments": ("/api/v1/appointments", "appointments.manage"),
    "queue": ("/api/v1/queue", "queue.manage"),
    "consultations": ("/api/v1/consultations", "consultations.read"),
    "billing": ("/api/v1/billing/doctor-fee-rules", "billing.manage"),
    "lab": ("/api/v1/lab/catalog/tests", "lab.manage"),
    "pharmacy": ("/api/v1/pharmacy/medicines", "pharmacy.manage"),
}


ROLE_ACCESS_MATRIX = {
    "reception": {"patients", "appointments", "queue"},
    "doctor": {"patients", "queue", "consultations"},
    "lab": {"lab"},
    "pharmacy": {"pharmacy"},
    "billing": {"billing"},
}


def _create_tenant_with_all_modules(client, name="Matrix Clinic"):
    tenant = client.post("/api/v1/tenants", json={"name": name}).json()
    branch = client.post(
        f"/api/v1/tenants/{tenant['id']}/branches",
        json={"name": "Main Branch", "code": "MAIN"},
    ).json()
    plan = client.post(
        "/api/v1/subscription-plans",
        json={
            "key": f"matrix_{tenant['id']}",
            "name": f"{name} Matrix Plan",
            "monthly_patient_limit": 1000,
            "included_branches": 5,
            "included_doctors": 10,
            "price_inr_monthly": 0,
            "enabled_modules": ALL_MATRIX_MODULES,
        },
    ).json()
    client.post(
        "/api/v1/subscription-plans/tenant-subscriptions",
        headers={"X-Tenant-ID": tenant["id"]},
        json={"plan_id": plan["id"], "starts_on": date.today().isoformat()},
    )
    return tenant, branch


def _create_role_user_and_login(
    client, tenant_id, role_key, permission_keys, branch_id=None
):
    client.post(
        "/api/v1/identity/roles",
        headers={"X-Tenant-ID": tenant_id},
        json={
            "name": role_key.replace("_", " ").title(),
            "key": role_key,
            "permission_keys": permission_keys,
        },
    )
    email = f"{role_key}@matrix.test.local"
    password = "MatrixPass123"
    created = client.post(
        "/api/v1/identity/users",
        headers={"X-Tenant-ID": tenant_id},
        json={
            "name": role_key.replace("_", " ").title(),
            "email": email,
            "password": password,
            "branch_id": branch_id,
            "role_keys": [role_key],
        },
    )
    assert created.status_code == 201
    login = client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": password, "tenant_id": tenant_id},
    )
    assert login.status_code == 200
    return {
        "Authorization": f"Bearer {login.json()['access_token']}",
        "X-Tenant-ID": tenant_id,
    }


def _permissions_for_modules(modules):
    return [
        permission
        for module, (_path, permission) in READ_ENDPOINTS.items()
        if module in modules
    ]


def test_role_permission_matrix_allows_only_assigned_module_reads(client):
    tenant, _branch = _create_tenant_with_all_modules(client)

    for role_key, allowed_modules in ROLE_ACCESS_MATRIX.items():
        headers = _create_role_user_and_login(
            client,
            tenant["id"],
            role_key=f"matrix_{role_key}",
            permission_keys=_permissions_for_modules(allowed_modules),
        )
        for module, (path, _permission) in READ_ENDPOINTS.items():
            response = client.get(path, headers=headers)
            if module in allowed_modules:
                assert (
                    response.status_code == 200
                ), f"{role_key} should read {module}: {response.text}"
            else:
                assert (
                    response.status_code == 403
                ), f"{role_key} should not read {module}: {response.text}"


def test_module_entitlement_matrix_blocks_disabled_modules_even_with_permission(client):
    tenant = client.post(
        "/api/v1/tenants", json={"name": "Disabled Module Clinic"}
    ).json()
    permissions = ["lab.manage", "pharmacy.manage", "billing.manage"]
    headers = _create_role_user_and_login(
        client, tenant["id"], "disabled_module_operator", permissions
    )

    lab = client.get("/api/v1/lab/catalog/tests", headers=headers)
    pharmacy = client.get("/api/v1/pharmacy/medicines", headers=headers)
    billing_basic = client.get("/api/v1/billing/doctor-fee-rules", headers=headers)

    assert lab.status_code == 403
    assert lab.json()["detail"] == "Module lab is not enabled for plan Free Trial"
    assert pharmacy.status_code == 403
    assert (
        pharmacy.json()["detail"]
        == "Module pharmacy is not enabled for plan Free Trial"
    )
    assert billing_basic.status_code == 200


def test_branch_scope_matrix_blocks_cross_branch_records_and_queries(client):
    tenant, main_branch = _create_tenant_with_all_modules(
        client, name="Branch Matrix Clinic"
    )
    other_branch = client.post(
        f"/api/v1/tenants/{tenant['id']}/branches",
        json={"name": "Other Branch", "code": "OTHER"},
    ).json()
    other_patient = client.post(
        "/api/v1/patients",
        headers={"X-Tenant-ID": tenant["id"]},
        json={"full_name": "Other Branch Patient", "branch_id": other_branch["id"]},
    ).json()
    headers = _create_role_user_and_login(
        client,
        tenant["id"],
        "branch_matrix_user",
        [
            "patients.read",
            "appointments.manage",
            "queue.manage",
            "lab.manage",
            "pharmacy.manage",
        ],
        branch_id=main_branch["id"],
    )

    patient = client.get(f"/api/v1/patients/{other_patient['id']}", headers=headers)
    appointments = client.get(
        f"/api/v1/appointments?branch_id={other_branch['id']}", headers=headers
    )
    queue = client.get(f"/api/v1/queue?branch_id={other_branch['id']}", headers=headers)
    lab = client.get(
        f"/api/v1/lab/catalog/tests?branch_id={other_branch['id']}", headers=headers
    )
    pharmacy = client.get(
        f"/api/v1/pharmacy/medicines?branch_id={other_branch['id']}", headers=headers
    )

    assert patient.status_code == 200
    assert patient.json()["id"] == other_patient["id"]
    assert appointments.status_code == 403
    assert queue.status_code == 403
    assert lab.status_code == 403
    assert pharmacy.status_code == 403


def test_sensitive_action_audit_matrix_records_core_module_events(client):
    tenant, branch = _create_tenant_with_all_modules(client, name="Audit Matrix Clinic")
    patient = client.post(
        "/api/v1/patients",
        headers={"X-Tenant-ID": tenant["id"]},
        json={"full_name": "Audit Matrix Patient", "branch_id": branch["id"]},
    )
    lab = client.post(
        "/api/v1/lab/catalog/tests",
        headers={"X-Tenant-ID": tenant["id"]},
        json={"branch_id": branch["id"], "code": "CBC", "name": "Complete Blood Count"},
    )
    pharmacy = client.post(
        "/api/v1/pharmacy/medicines",
        headers={"X-Tenant-ID": tenant["id"]},
        json={"branch_id": branch["id"], "code": "PARA", "name": "Paracetamol"},
    )
    settings = client.put(
        "/api/v1/settings",
        headers={"X-Tenant-ID": tenant["id"]},
        json={
            "module": "queue",
            "key": "token.language",
            "value": "english",
            "scope": "tenant",
        },
    )
    assert patient.status_code == 201
    assert lab.status_code == 201
    assert pharmacy.status_code == 201
    assert settings.status_code == 200

    client.get(
        f"/api/v1/patients/{patient.json()['id']}",
        headers={"X-Tenant-ID": tenant["id"]},
    )
    audit = client.get(
        "/api/v1/audit-events", headers={"X-Tenant-ID": tenant["id"]}
    ).json()
    actions = {event["action"] for event in audit}

    assert {
        "patient.created",
        "patient.record.viewed",
        "lab_test.created",
        "medicine.created",
        "setting.upserted",
    }.issubset(actions)
