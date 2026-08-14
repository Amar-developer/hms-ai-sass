from sqlmodel import SQLModel, Session, create_engine
from sqlmodel.pool import StaticPool

from app.main import create_app
from app.modules.settings.models import SettingKey, SettingScope
from app.modules.settings.numbering import next_document_number
from app.modules.settings.service import upsert_setting
from app.modules.tenants.models import Branch, Tenant


def create_tenant_and_branch(client):
    tenant = client.post("/api/v1/tenants", json={"name": "Settings Clinic"}).json()
    branch = client.post(
        f"/api/v1/tenants/{tenant['id']}/branches",
        json={"name": "Main Branch", "code": "MAIN"},
    ).json()
    return tenant, branch


def test_resolve_default_setting_when_not_configured(client):
    tenant, _branch = create_tenant_and_branch(client)

    response = client.get(
        "/api/v1/settings/resolve?module=queue&key=queue.requeue_after_patients",
        headers={"X-Tenant-ID": tenant["id"]},
    )

    assert response.status_code == 200
    assert response.json()["value"] == 3
    assert response.json()["source_scope"] is None


def test_upsert_tenant_setting_and_resolve_it(client):
    tenant, _branch = create_tenant_and_branch(client)

    upsert = client.put(
        "/api/v1/settings",
        headers={"X-Tenant-ID": tenant["id"]},
        json={
            "scope": "tenant",
            "module": "invoice",
            "key": "invoice.prefix",
            "value": "MZH",
            "actor_user_id": "admin_user",
        },
    )
    resolved = client.get(
        "/api/v1/settings/resolve?module=invoice&key=invoice.prefix",
        headers={"X-Tenant-ID": tenant["id"]},
    )

    assert upsert.status_code == 200
    assert upsert.json()["scope_id"] == tenant["id"]
    assert resolved.status_code == 200
    assert resolved.json()["value"] == "MZH"
    assert resolved.json()["source_scope"] == "tenant"


def test_branch_setting_overrides_tenant_setting(client):
    tenant, branch = create_tenant_and_branch(client)
    client.put(
        "/api/v1/settings",
        headers={"X-Tenant-ID": tenant["id"]},
        json={
            "scope": "tenant",
            "module": "token",
            "key": "token.language",
            "value": "en-IN",
        },
    )
    client.put(
        "/api/v1/settings",
        headers={"X-Tenant-ID": tenant["id"]},
        json={
            "scope": "branch",
            "scope_id": branch["id"],
            "module": "token",
            "key": "token.language",
            "value": "ta-IN",
        },
    )

    resolved = client.get(
        f"/api/v1/settings/resolve?module=token&key=token.language&branch_id={branch['id']}",
        headers={"X-Tenant-ID": tenant["id"]},
    )

    assert resolved.status_code == 200
    assert resolved.json()["value"] == "ta-IN"
    assert resolved.json()["source_scope"] == "branch"
    assert resolved.json()["source_scope_id"] == branch["id"]


def test_payment_methods_and_communication_providers_can_be_configured(client):
    tenant, _branch = create_tenant_and_branch(client)

    payment = client.put(
        "/api/v1/settings",
        headers={"X-Tenant-ID": tenant["id"]},
        json={
            "scope": "tenant",
            "module": "payment",
            "key": "payment.methods_enabled",
            "value": ["cash", "upi", "gpay", "paytm"],
        },
    )
    communication = client.put(
        "/api/v1/settings",
        headers={"X-Tenant-ID": tenant["id"]},
        json={
            "scope": "tenant",
            "module": "communication",
            "key": "communication.providers_enabled",
            "value": ["whatsapp", "sms"],
        },
    )

    assert payment.status_code == 200
    assert payment.json()["value"] == ["cash", "upi", "gpay", "paytm"]
    assert communication.status_code == 200
    assert communication.json()["value"] == ["whatsapp", "sms"]


def test_invalid_branch_scope_is_rejected(client):
    first, _branch = create_tenant_and_branch(client)
    _second, other_branch = create_tenant_and_branch(client)

    response = client.put(
        "/api/v1/settings",
        headers={"X-Tenant-ID": first["id"]},
        json={
            "scope": "branch",
            "scope_id": other_branch["id"],
            "module": "queue",
            "key": "queue.auto_no_show_after_missed_calls",
            "value": 2,
        },
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "Invalid branch scope"


def test_default_document_numbering_keeps_legacy_formats():
    create_app()
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    SQLModel.metadata.create_all(engine)

    with Session(engine) as session:
        tenant = Tenant(name="Numbering Clinic")
        session.add(tenant)
        session.commit()
        session.refresh(tenant)

        branch = Branch(tenant_id=tenant.id, name="Main Branch", code="MAIN")
        session.add(branch)
        session.commit()
        session.refresh(branch)

        upsert_setting(
            session,
            tenant_id=tenant.id,
            scope=SettingScope.BRANCH,
            scope_id=branch.id,
            module="invoice",
            key=SettingKey.INVOICE_PREFIX,
            value="MZH",
        )
        patient_number = next_document_number(
            session,
            tenant_id=tenant.id,
            branch_id=branch.id,
            entity="patient",
        )
        appointment_number = next_document_number(
            session,
            tenant_id=tenant.id,
            branch_id=branch.id,
            entity="appointment",
        )
        invoice_number = next_document_number(
            session,
            tenant_id=tenant.id,
            branch_id=branch.id,
            entity="invoice",
        )
        admission_number = next_document_number(
            session,
            tenant_id=tenant.id,
            branch_id=branch.id,
            entity="ip_admission",
        )
        case_number = next_document_number(
            session,
            tenant_id=tenant.id,
            branch_id=branch.id,
            entity="physiotherapy_case",
        )

        assert patient_number == "PAT-000001"
        assert appointment_number == "APT-000001"
        assert invoice_number == "MZH-000001"
        assert admission_number == "IP-000001"
        assert case_number == "PHY-000001"


def test_settings_bundle_returns_operational_defaults_and_overrides(client):
    tenant, branch = create_tenant_and_branch(client)
    client.put(
        "/api/v1/settings",
        headers={"X-Tenant-ID": tenant["id"]},
        json={
            "scope": "branch",
            "scope_id": branch["id"],
            "module": "queue",
            "key": "queue.requeue_after_patients",
            "value": 5,
        },
    )

    response = client.get(
        f"/api/v1/settings/bundle?module=queue&branch_id={branch['id']}",
        headers={"X-Tenant-ID": tenant["id"]},
    )

    assert response.status_code == 200
    settings = {row["key"]: row for row in response.json()["settings"]}
    assert settings["queue.requeue_after_patients"]["value"] == 5
    assert settings["queue.requeue_after_patients"]["source_scope"] == "branch"
    assert settings["queue.auto_no_show_after_missed_calls"]["value"] == 3


def test_setting_upsert_writes_audit_event(client):
    tenant, _branch = create_tenant_and_branch(client)

    client.put(
        "/api/v1/settings",
        headers={"X-Tenant-ID": tenant["id"]},
        json={
            "scope": "tenant",
            "module": "follow_up",
            "key": "follow_up.validity_days",
            "value": 14,
            "actor_user_id": "admin_user",
        },
    )
    audit = client.get(
        "/api/v1/audit-events", headers={"X-Tenant-ID": tenant["id"]}
    ).json()
    actions = [event["action"] for event in audit]

    assert "setting.upserted" in actions
