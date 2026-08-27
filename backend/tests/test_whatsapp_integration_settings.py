import json

import pytest
from sqlmodel import Session, select

from app.core.credentials import decrypt_credential
from app.modules.audit.models import AuditEvent
from app.modules.integrations.models import TenantIntegrationPlugin
from app.modules.integrations import whatsapp_service
from app.modules.integrations.whatsapp_gateway import WhatsAppGatewayResult
from app.modules.integrations.whatsapp_schemas import (
    WhatsAppFlowSettings,
    WhatsAppHealthRead,
    WhatsAppIntegrationRead,
    WhatsAppIntegrationUpdate,
    WhatsAppTemplateSettings,
    WhatsAppTestRequest,
    WhatsAppUsageRead,
)
from app.modules.integrations.whatsapp_readiness import evaluate_whatsapp_readiness
from app.modules.identity.models import User
from app.modules.subscriptions.services.serialization import (
    modules_from_json,
    modules_to_json,
)
from app.modules.subscriptions.services.tenant_subscriptions import (
    get_active_subscription,
)
from app.modules.tenants.models import Tenant


def test_provider_campaign_identifiers_have_no_tenant_specific_defaults():
    assert WhatsAppTemplateSettings().admin_daily_report == ""


def test_membership_benefit_template_enforces_six_parameter_contract():
    legacy = [
        "recipient_name",
        "membership_plan_name",
        "membership_plan.name",
        "expiry_date",
        "days_remaining",
        "unused_consultations",
        "unused_lab_tests",
        "unused_medicines",
        "unused_benefits_summary",
        "clinic_name",
    ]
    normalized = WhatsAppIntegrationUpdate.model_validate(
        {"template_field_mappings": {"unused_benefit_patient": legacy}}
    )
    assert normalized.template_field_mappings["unused_benefit_patient"] == [
        "recipient_name",
        "membership_plan_name",
        "clinic_name",
        "unused_benefits_summary",
        "expiry_date",
        "clinic.phone",
    ]

    with pytest.raises(ValueError, match="approved six template fields"):
        WhatsAppIntegrationUpdate.model_validate(
            {"template_field_mappings": {"unused_benefit_patient": ["recipient_name"]}}
        )


@pytest.mark.parametrize(
    "flow_key", ["home_care_booking_patient", "home_visit_booking_patient"]
)
def test_home_booking_template_enforces_six_parameter_contract(flow_key):
    with pytest.raises(ValueError, match="approved six template fields"):
        WhatsAppIntegrationUpdate.model_validate(
            {"template_field_mappings": {flow_key: ["recipient_name"]}}
        )


def test_disabled_home_booking_empty_mappings_restore_approved_contract():
    settings = WhatsAppIntegrationUpdate.model_validate(
        {
            "flows": {
                "home_care_booking_patient": False,
                "home_visit_booking_patient": False,
            },
            "template_field_mappings": {
                "home_care_booking_patient": [],
                "home_visit_booking_patient": [],
            },
        }
    )

    expected = [
        "recipient_name",
        "clinic_name",
        "service_description",
        "booking_start_date",
        "booking_end_date",
        "clinic_name",
    ]
    assert settings.template_field_mappings["home_care_booking_patient"] == expected
    assert settings.template_field_mappings["home_visit_booking_patient"] == expected


def create_tenant(client, name="WhatsApp Settings Clinic"):
    return client.post("/api/v1/tenants", json={"name": name}).json()


def enable_whatsapp_module(test_engine, tenant_id: str) -> None:
    with Session(test_engine) as session:
        _subscription, plan = get_active_subscription(session, tenant_id)
        enabled = modules_from_json(plan.enabled_modules_json)
        plan.enabled_modules_json = modules_to_json([*enabled, "whatsapp"])
        session.add(plan)
        session.commit()


def enabled_payload(api_key="phase-two-secret-key-1234"):
    return {
        "enabled": True,
        "api_url": "https://gateway.example.com/messages",
        "public_media_base_url": "https://api.example.com",
        "api_key": api_key,
        "default_country_code": "+91",
        "timeout_seconds": 20,
        "max_attempts": 4,
        "patient_notifications_enabled": True,
        "doctor_notifications_enabled": False,
        "default_language": "en",
        "templates": {
            "appointment_booked_patient": "patient_booking_approved",
            "appointment_booked_doctor": "doctor_booking_approved",
            "invoice_paid_patient": "invoice_paid_approved",
            "payment_pending_patient": "payment_pending_approved",
        },
        "localized_templates": {
            "hi": {
                "appointment_booked_patient": "patient_booking_hi_approved",
                "invoice_paid_patient": "invoice_paid_hi_approved",
            }
        },
        "flows": {
            "appointment_booked_patient": True,
            "appointment_booked_doctor": False,
            "invoice_paid_patient": True,
            "payment_pending_patient": False,
        },
    }


def readiness_settings() -> WhatsAppIntegrationRead:
    payload = WhatsAppIntegrationUpdate.model_validate(enabled_payload())
    return WhatsAppIntegrationRead(
        enabled=True,
        api_url=str(payload.api_url),
        public_media_base_url=str(payload.public_media_base_url),
        api_key_masked="••••••••1234",
        has_api_key=True,
        default_country_code=payload.default_country_code,
        timeout_seconds=payload.timeout_seconds,
        max_attempts=payload.max_attempts,
        patient_notifications_enabled=payload.patient_notifications_enabled,
        doctor_notifications_enabled=payload.doctor_notifications_enabled,
        appointment_reminder_24h_enabled=False,
        appointment_reminder_2h_enabled=False,
        default_language=payload.default_language,
        templates=payload.templates,
        localized_templates=payload.localized_templates,
        flows=payload.flows,
        usage=WhatsAppUsageRead(
            plan_name="Growth Clinic",
            monthly_limit=1000,
            used=10,
            remaining=990,
            usage_percentage=1,
            limit_reached=False,
            period_start="2026-07-01T00:00:00+00:00",
            period_end="2026-08-01T00:00:00+00:00",
        ),
        health=WhatsAppHealthRead(
            status="healthy",
            sent_24h=1,
            failed_24h=0,
            failure_rate_24h=0,
            queued=0,
            retry_pending=0,
            stuck_processing=0,
            oldest_queued_age_minutes=None,
            last_sent_at="2026-07-24T10:00:00+00:00",
            alerts=[],
        ),
    )


def test_final_rollout_readiness_distinguishes_ready_and_blocked_settings():
    ready = readiness_settings()
    result = evaluate_whatsapp_readiness(ready)

    assert result.status == "ready"
    assert result.blockers == 0
    assert result.warnings == 0
    assert result.passed == 9

    blocked = ready.model_copy(
        update={
            "has_api_key": False,
            "usage": ready.usage.model_copy(
                update={"remaining": 0, "limit_reached": True}
            ),
            "health": ready.health.model_copy(update={"status": "critical"}),
        }
    )
    blocked_result = evaluate_whatsapp_readiness(blocked)

    assert blocked_result.status == "not_ready"
    assert blocked_result.blockers == 3


def test_service_persists_and_replaces_masked_credential(test_engine, monkeypatch):
    monkeypatch.setattr(
        whatsapp_service,
        "_enforce_entitlement",
        lambda _session, _tenant_id: None,
    )
    monkeypatch.setattr(
        whatsapp_service,
        "read_whatsapp_usage",
        lambda _session, *, tenant_id: None,
    )
    with Session(test_engine) as session:
        tenant = Tenant(name="Direct Service Clinic")
        session.add(tenant)
        session.commit()
        session.refresh(tenant)
        actor = User(
            tenant_id=tenant.id,
            name="Direct Service Admin",
            email="direct-service-admin@example.com",
            user_type="tenant_admin",
        )
        session.add(actor)
        session.commit()
        session.refresh(actor)

        saved = whatsapp_service.update_whatsapp_integration(
            session,
            tenant_id=tenant.id,
            payload=WhatsAppIntegrationUpdate.model_validate(enabled_payload()),
            actor=actor,
        )
        assert saved.has_api_key is True
        assert saved.api_key_masked == "••••••••1234"
        assert saved.default_language == "en"
        assert (
            saved.localized_templates["hi"].appointment_booked_patient
            == "patient_booking_hi_approved"
        )

        row = session.exec(
            select(TenantIntegrationPlugin).where(
                TenantIntegrationPlugin.tenant_id == tenant.id
            )
        ).one()
        first_ciphertext = row.secret_ciphertext
        assert first_ciphertext
        assert decrypt_credential(first_ciphertext) == "phase-two-secret-key-1234"

        without_new_key = enabled_payload()
        without_new_key.pop("api_key")
        without_new_key["timeout_seconds"] = 25
        updated = whatsapp_service.update_whatsapp_integration(
            session,
            tenant_id=tenant.id,
            payload=WhatsAppIntegrationUpdate.model_validate(without_new_key),
            actor=actor,
        )
        assert updated.timeout_seconds == 25
        session.refresh(row)
        assert row.secret_ciphertext == first_ciphertext
        audits = session.exec(
            select(AuditEvent).where(
                AuditEvent.tenant_id == tenant.id,
                AuditEvent.action == "communication.whatsapp_settings_updated",
            )
        ).all()
        assert len(audits) == 2
        assert all(
            "phase-two-secret-key-1234" not in audit.metadata_json for audit in audits
        )


def test_service_preserves_deleted_builtin_template_field_mapping(
    test_engine, monkeypatch
):
    monkeypatch.setattr(
        whatsapp_service,
        "_enforce_entitlement",
        lambda _session, _tenant_id: None,
    )
    monkeypatch.setattr(
        whatsapp_service,
        "read_whatsapp_usage",
        lambda _session, *, tenant_id: None,
    )
    with Session(test_engine) as session:
        tenant = Tenant(name="Deleted Builtin Template Clinic")
        session.add(tenant)
        session.commit()
        session.refresh(tenant)
        actor = User(
            tenant_id=tenant.id,
            name="Template Admin",
            email="template-admin@example.com",
            user_type="tenant_admin",
        )
        session.add(actor)
        session.commit()
        session.refresh(actor)

        payload = enabled_payload()
        payload["templates"]["appointment_booked_patient"] = ""
        payload["localized_templates"]["hi"]["appointment_booked_patient"] = ""
        payload["flows"]["appointment_booked_patient"] = False
        payload["template_field_mappings"] = {"appointment_booked_patient": []}

        saved = whatsapp_service.update_whatsapp_integration(
            session,
            tenant_id=tenant.id,
            payload=WhatsAppIntegrationUpdate.model_validate(payload),
            actor=actor,
        )

        assert saved.templates.appointment_booked_patient == ""
        assert saved.localized_templates["hi"].appointment_booked_patient == ""
        assert saved.flows.appointment_booked_patient is False
        assert saved.template_field_mappings["appointment_booked_patient"] == []


def test_service_sends_test_with_decrypted_key_and_safe_audit(test_engine, monkeypatch):
    monkeypatch.setattr(
        whatsapp_service,
        "_enforce_entitlement",
        lambda _session, _tenant_id: None,
    )
    monkeypatch.setattr(
        whatsapp_service,
        "read_whatsapp_usage",
        lambda _session, *, tenant_id: None,
    )
    captured = {}

    class FakeGateway:
        def send_template(self, **kwargs):
            captured.update(kwargs)
            return WhatsAppGatewayResult(
                True, "sent", "Test message sent successfully.", 200, "msg-123"
            )

    with Session(test_engine) as session:
        tenant = Tenant(name="Test Message Clinic")
        session.add(tenant)
        session.commit()
        session.refresh(tenant)
        actor = User(
            tenant_id=tenant.id,
            name="Test Message Admin",
            email="test-message-admin@example.com",
            user_type="tenant_admin",
        )
        session.add(actor)
        session.commit()
        session.refresh(actor)
        whatsapp_service.update_whatsapp_integration(
            session,
            tenant_id=tenant.id,
            payload=WhatsAppIntegrationUpdate.model_validate(enabled_payload()),
            actor=actor,
        )

        result = whatsapp_service.test_whatsapp_integration(
            session,
            tenant_id=tenant.id,
            payload=WhatsAppTestRequest(
                mobile="98765 43210",
                recipient_name="Test Patient",
                flow_key="appointment_booked_patient",
                language="hi",
                template_parameters=[
                    "Test Patient",
                    "25 July 2026",
                    "10:30 AM",
                ],
            ),
            actor=actor,
            gateway=FakeGateway(),
        )

        assert result.success is True
        assert captured["api_key"] == "phase-two-secret-key-1234"
        assert captured["campaign_name"] == "patient_booking_hi_approved"
        assert captured["destination"] == "+919876543210"
        audit = session.exec(
            select(AuditEvent).where(
                AuditEvent.tenant_id == tenant.id,
                AuditEvent.action == "communication.whatsapp_test_sent",
            )
        ).one()
        assert "phase-two-secret-key-1234" not in audit.metadata_json
        assert "+919876543210" not in audit.metadata_json
        assert json.loads(audit.metadata_json)["destination_masked"] == "••••3210"
        assert json.loads(audit.metadata_json)["language"] == "hi"


def test_settings_are_subscription_gated(client):
    tenant = create_tenant(client)

    response = client.get(
        "/api/v1/communications/whatsapp/settings",
        headers={"X-Tenant-ID": tenant["id"]},
    )

    assert response.status_code == 403
    assert "not enabled" in response.json()["detail"]


def test_api_key_is_encrypted_and_masked(client, test_engine):
    tenant = create_tenant(client)
    enable_whatsapp_module(test_engine, tenant["id"])
    raw_key = "phase-two-secret-key-1234"

    saved = client.put(
        "/api/v1/communications/whatsapp/settings",
        headers={"X-Tenant-ID": tenant["id"]},
        json=enabled_payload(raw_key),
    )
    loaded = client.get(
        "/api/v1/communications/whatsapp/settings",
        headers={"X-Tenant-ID": tenant["id"]},
    )

    assert saved.status_code == 200, saved.text
    assert saved.json()["api_key_masked"] == "••••••••1234"
    assert "api_key" not in saved.json()
    assert loaded.status_code == 200
    assert loaded.json()["has_api_key"] is True
    assert loaded.json()["api_key_masked"] == "••••••••1234"

    with Session(test_engine) as session:
        row = session.exec(
            select(TenantIntegrationPlugin).where(
                TenantIntegrationPlugin.tenant_id == tenant["id"]
            )
        ).one()
        assert row.secret_ciphertext != raw_key
        assert raw_key not in row.config_json
        assert decrypt_credential(row.secret_ciphertext or "") == raw_key

        audit = session.exec(
            select(AuditEvent).where(
                AuditEvent.tenant_id == tenant["id"],
                AuditEvent.action == "communication.whatsapp_settings_updated",
            )
        ).one()
        assert raw_key not in audit.metadata_json
        assert json.loads(audit.metadata_json)["credential_changed"] is True


def test_blank_api_key_keeps_existing_encrypted_secret(client, test_engine):
    tenant = create_tenant(client)
    enable_whatsapp_module(test_engine, tenant["id"])
    first = client.put(
        "/api/v1/communications/whatsapp/settings",
        headers={"X-Tenant-ID": tenant["id"]},
        json=enabled_payload(),
    )
    assert first.status_code == 200, first.text

    with Session(test_engine) as session:
        original = session.exec(
            select(TenantIntegrationPlugin).where(
                TenantIntegrationPlugin.tenant_id == tenant["id"]
            )
        ).one()
        original_ciphertext = original.secret_ciphertext

    update = enabled_payload()
    update.pop("api_key")
    update["timeout_seconds"] = 30
    second = client.put(
        "/api/v1/communications/whatsapp/settings",
        headers={"X-Tenant-ID": tenant["id"]},
        json=update,
    )

    assert second.status_code == 200, second.text
    assert second.json()["timeout_seconds"] == 30
    assert second.json()["api_key_masked"] == "••••••••1234"
    with Session(test_engine) as session:
        persisted = session.exec(
            select(TenantIntegrationPlugin).where(
                TenantIntegrationPlugin.tenant_id == tenant["id"]
            )
        ).one()
        assert persisted.secret_ciphertext == original_ciphertext


def test_settings_are_isolated_by_tenant(client, test_engine):
    first_tenant = create_tenant(client, "First WhatsApp Clinic")
    second_tenant = create_tenant(client, "Second WhatsApp Clinic")
    enable_whatsapp_module(test_engine, first_tenant["id"])
    enable_whatsapp_module(test_engine, second_tenant["id"])

    saved = client.put(
        "/api/v1/communications/whatsapp/settings",
        headers={"X-Tenant-ID": first_tenant["id"]},
        json=enabled_payload(),
    )
    second = client.get(
        "/api/v1/communications/whatsapp/settings",
        headers={"X-Tenant-ID": second_tenant["id"]},
    )

    assert saved.status_code == 200
    assert second.status_code == 200
    assert second.json()["enabled"] is False
    assert second.json()["has_api_key"] is False


def test_readiness_blocks_when_saved_credential_cannot_be_decrypted():
    """Stored-but-unreadable must block, not pass.

    The ciphertext is present, so the old check reported "credential saved"
    and passed while every send failed hours later. This is what happens
    after MEDIZINHUB_CREDENTIAL_ENCRYPTION_KEY changes, or after restoring a
    database from an environment that used a different one.
    """
    settings = WhatsAppIntegrationRead(
        enabled=True,
        api_url="https://gateway.example.com/messages",
        public_media_base_url="https://api.example.com",
        api_key_masked="••••••••-key",
        has_api_key=True,
        default_country_code="+91",
        timeout_seconds=15,
        max_attempts=5,
        patient_notifications_enabled=True,
        doctor_notifications_enabled=True,
        appointment_reminder_24h_enabled=False,
        appointment_reminder_2h_enabled=False,
        default_language="en",
        templates=WhatsAppTemplateSettings(),
        localized_templates={},
        flows=WhatsAppFlowSettings(),
    )

    def credential_check(readiness):
        return next(item for item in readiness.checks if item.key == "credential_saved")

    unreadable = credential_check(
        evaluate_whatsapp_readiness(settings, credential_readable=False)
    )
    assert unreadable.status == "block"
    assert "cannot be decrypted" in unreadable.message
    assert "Re-enter" in unreadable.message

    readable = credential_check(
        evaluate_whatsapp_readiness(settings, credential_readable=True)
    )
    assert readable.status == "pass"

    # Unknown (not yet checked) must not invent a failure.
    unknown = credential_check(evaluate_whatsapp_readiness(settings))
    assert unknown.status == "pass"

    missing = credential_check(
        evaluate_whatsapp_readiness(
            settings.model_copy(update={"has_api_key": False}),
            credential_readable=None,
        )
    )
    assert missing.status == "block"
    assert "Save an API credential" in missing.message
