from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from uuid import uuid4

import httpx


def unique_value(prefix: str) -> str:
    return f"{prefix}-{uuid4().hex[:10]}"


def assert_status(
    response: httpx.Response, expected_status: int | tuple[int, ...]
) -> httpx.Response:
    expected = (
        expected_status if isinstance(expected_status, tuple) else (expected_status,)
    )
    assert response.status_code in expected, (
        f"{response.request.method} {response.request.url} returned "
        f"{response.status_code}; expected {expected}. Body: {response.text}"
    )
    return response


@dataclass(frozen=True)
class AuthContext:
    token: str
    tenant_id: str
    user_id: str
    email: str
    password: str

    def headers(self, tenant_id: str | None = None) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {self.token}",
            "X-Tenant-ID": tenant_id or self.tenant_id,
        }


@dataclass(frozen=True)
class TenantContext:
    tenant_id: str
    branch_id: str
    admin: AuthContext


@dataclass(frozen=True)
class ClinicalContext:
    tenant: TenantContext
    department_id: str
    practitioner_id: str
    patient_id: str
    appointment_id: str
    queue_entry_id: str
    consultation_id: str


def login(
    client: httpx.Client,
    *,
    email: str,
    password: str,
    tenant_id: str | None = None,
) -> AuthContext:
    payload: dict[str, str] = {"email": email, "password": password}
    if tenant_id:
        payload["tenant_id"] = tenant_id
    response = assert_status(client.post("/auth/login", json=payload), 200)
    body = response.json()
    user = body["user"]
    resolved_tenant_id = user.get("tenant_id") or tenant_id
    assert resolved_tenant_id, "Authenticated user did not resolve a tenant"
    return AuthContext(
        token=body["access_token"],
        tenant_id=resolved_tenant_id,
        user_id=user["id"],
        email=email,
        password=password,
    )


def onboard_tenant(
    client: httpx.Client,
    super_admin: AuthContext,
    *,
    name_prefix: str,
    enabled_modules: list[str] | None = None,
) -> TenantContext:
    suffix = uuid4().hex[:10]
    admin_email = f"admin.{suffix}@e2e.medizinhub.local"
    admin_password = "TenantE2EPass123"
    plans_response = assert_status(
        client.get("/subscription-plans", headers=super_admin.headers()), 200
    )
    if enabled_modules is None:
        selected_plan = next(
            plan for plan in plans_response.json() if plan["key"] == "starter"
        )
    else:
        plan_key = f"e2e_{suffix}"
        selected_plan = assert_status(
            client.post(
                "/subscription-plans",
                headers=super_admin.headers(),
                json={
                    "key": plan_key,
                    "name": f"E2E Plan {suffix}",
                    "monthly_patient_limit": 1000,
                    "included_branches": 5,
                    "included_doctors": 10,
                    "price_inr_monthly": 0,
                    "enabled_modules": list(dict.fromkeys(enabled_modules)),
                },
            ),
            201,
        ).json()
    response = assert_status(
        client.post(
            "/tenants/onboard",
            headers=super_admin.headers(),
            json={
                "tenant": {
                    "name": f"{name_prefix} {suffix}",
                    "email": f"clinic.{suffix}@e2e.medizinhub.local",
                    "tenant_type": "clinic",
                    "status": "active",
                },
                "branches": [
                    {
                        "name": "Main Branch",
                        "code": "MAIN",
                        "city": "Chennai",
                    }
                ],
                "subscription_plan_id": selected_plan["id"],
                "subscription_starts_on": date.today().isoformat(),
                "admin_user": {
                    "name": f"{name_prefix} Admin",
                    "email": admin_email,
                    "password": admin_password,
                    "must_change_password": False,
                },
            },
        ),
        201,
    )
    body = response.json()
    tenant_id = body["tenant"]["id"]
    admin = login(
        client,
        email=admin_email,
        password=admin_password,
        tenant_id=tenant_id,
    )
    assert (
        "tenant_admin"
        in assert_status(client.get("/auth/me", headers=admin.headers()), 200).json()[
            "roles"
        ]
    )
    return TenantContext(
        tenant_id=tenant_id,
        branch_id=body["branches"][0]["id"],
        admin=admin,
    )


def create_role_user(
    client: httpx.Client,
    tenant: TenantContext,
    *,
    permission_keys: list[str],
    role_prefix: str,
) -> AuthContext:
    suffix = uuid4().hex[:10]
    role_key = f"{role_prefix}_{suffix}"
    role_response = assert_status(
        client.post(
            "/identity/roles",
            headers=tenant.admin.headers(),
            json={
                "name": f"{role_prefix.replace('_', ' ').title()} E2E",
                "key": role_key,
                "permission_keys": permission_keys,
            },
        ),
        201,
    )
    assert role_response.json()["permission_keys"] == permission_keys

    email = f"{role_key}@e2e.medizinhub.local"
    password = "RestrictedE2EPass123"
    assert_status(
        client.post(
            "/identity/users",
            headers=tenant.admin.headers(),
            json={
                "name": f"{role_prefix.replace('_', ' ').title()} User",
                "email": email,
                "password": password,
                "branch_id": tenant.branch_id,
                "role_keys": [role_key],
                "must_change_password": False,
            },
        ),
        201,
    )
    return login(
        client,
        email=email,
        password=password,
        tenant_id=tenant.tenant_id,
    )


def create_patient(
    client: httpx.Client,
    tenant: TenantContext,
    *,
    name: str,
    mobile: str | None = None,
) -> dict:
    payload: dict[str, object] = {
        "branch_id": tenant.branch_id,
        "full_name": name,
    }
    if mobile:
        payload["mobile"] = mobile
    return assert_status(
        client.post("/patients", headers=tenant.admin.headers(), json=payload),
        201,
    ).json()


def create_clinical_context(
    client: httpx.Client,
    super_admin: AuthContext,
    *,
    name_prefix: str,
    enabled_modules: list[str] | None = None,
    fee_amount: int | None = None,
    sign_consultation: bool = True,
    prescription_text: str = "Paracetamol 500mg twice daily for 3 days",
    lab_referral_text: str = "Complete Blood Count",
) -> ClinicalContext:
    modules = enabled_modules or [
        "patients",
        "appointments",
        "queue",
        "practitioners",
        "scheduling",
        "consultations",
        "billing_basic",
        "billing_advanced",
    ]
    tenant = onboard_tenant(
        client,
        super_admin,
        name_prefix=name_prefix,
        enabled_modules=modules,
    )
    headers = tenant.admin.headers()
    suffix = uuid4().hex[:10]
    department = assert_status(
        client.post(
            f"/tenants/{tenant.tenant_id}/departments",
            headers=headers,
            json={
                "name": "General Medicine",
                "code": f"GEN_{suffix}".upper(),
                "branch_id": tenant.branch_id,
            },
        ),
        201,
    ).json()
    practitioner = assert_status(
        client.post(
            "/practitioners",
            headers=headers,
            json={
                "full_name": f"Dr {name_prefix}",
                "practitioner_type": "doctor",
                "primary_specialty": "General Medicine",
                "registration_number": f"REG-{suffix}",
                "branch_ids": [tenant.branch_id],
                "department_ids": [department["id"]],
            },
        ),
        201,
    ).json()
    assert_status(
        client.post(
            f"/practitioners/{practitioner['id']}/schedules",
            headers=headers,
            json={
                "branch_id": tenant.branch_id,
                "department_id": department["id"],
                "mode": "custom",
                "weekdays": [date.today().weekday()],
                "start_time": "09:00:00",
                "end_time": "17:00:00",
                "slot_minutes": 15,
            },
        ),
        201,
    )
    patient = create_patient(
        client,
        tenant,
        name=f"{name_prefix} Patient",
        mobile=f"9{uuid4().int % 10**9:09d}",
    )
    booking = assert_status(
        client.post(
            "/appointments",
            headers=headers,
            json={
                "branch_id": tenant.branch_id,
                "patient_id": patient["id"],
                "department_id": department["id"],
                "practitioner_id": practitioner["id"],
                "appointment_type": "op",
                "appointment_date": date.today().isoformat(),
                "reason": f"{name_prefix} E2E visit",
            },
        ),
        201,
    ).json()
    consultation = assert_status(
        client.post(
            "/consultations",
            headers=headers,
            json={
                "appointment_id": booking["appointment"]["id"],
                "treatment_type": "general_consultation",
                "chief_complaint": "Fever and body pain",
                "diagnosis": "Viral fever",
                "clinical_notes": "Hydration and rest advised",
                "prescription_text": prescription_text,
                "lab_referral_text": lab_referral_text,
            },
        ),
        201,
    ).json()
    if sign_consultation:
        assert_status(
            client.post(
                f"/consultations/{consultation['id']}/sign",
                headers=headers,
                json={},
            ),
            200,
        )
    if fee_amount is not None:
        assert_status(
            client.post(
                "/billing/doctor-fee-rules",
                headers=headers,
                json={
                    "appointment_type": "op",
                    "fee_amount": fee_amount,
                    "share_type": "percentage",
                    "doctor_share_percentage": 60,
                    "branch_id": tenant.branch_id,
                    "practitioner_id": practitioner["id"],
                    "department_id": department["id"],
                    "treatment_type": "general_consultation",
                },
            ),
            201,
        )
    return ClinicalContext(
        tenant=tenant,
        department_id=department["id"],
        practitioner_id=practitioner["id"],
        patient_id=patient["id"],
        appointment_id=booking["appointment"]["id"],
        queue_entry_id=booking["queue_entry"]["id"],
        consultation_id=consultation["id"],
    )


def create_consultation_invoice(
    client: httpx.Client,
    clinical: ClinicalContext,
) -> dict:
    return assert_status(
        client.post(
            "/billing/invoices/from-consultation",
            headers=clinical.tenant.admin.headers(),
            json={"consultation_id": clinical.consultation_id},
        ),
        201,
    ).json()


def audit_actions(client: httpx.Client, tenant: TenantContext) -> set[str]:
    return {
        event["action"]
        for event in assert_status(
            client.get("/audit-events", headers=tenant.admin.headers()), 200
        ).json()
    }
