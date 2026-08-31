import json

from sqlmodel import Session, select

from app.modules.audit.models import AuditEvent
from app.modules.identity.models import User
from app.modules.integrations.models import TenantIntegrationPlugin
from app.modules.integrations import sms_service
from app.modules.integrations.sms_readiness import P0_SMS_FLOWS, evaluate_sms_readiness
from app.modules.integrations.sms_schemas import (
    SmsFlowReadiness,
    SmsReadinessUpdate,
    SmsSettingsUpdate,
)


def ready_payload() -> dict:
    return {
        "provider": "smscountry",
        "sms_country_api_mode": "rest",
        "account_confirmed": True,
        "dpa_confirmed": True,
        "pricing_confirmed": True,
        "delivery_receipts_confirmed": True,
        "callback_contract_confirmed": True,
        "static_ip_allowlisting_confirmed": True,
        "dlt_entity_id": "1101000012345678901",
        "default_sender_id": "MEDHUB",
        "throughput_limit_per_minute": 1200,
        "retention_days": 180,
        "notes": "SMSCountry readiness confirmed with account manager.",
        "flows": [
            {
                "flow_key": flow_key,
                "enabled": True,
                "classification": "service_implicit",
                "consent_basis": "patient_transaction",
                "dlt_template_id": f"17071600000000{index:02d}",
                "registered_body": f"Registered body for {flow_key} with {{#var#}}.",
                "variable_keys": ["clinic_name", "patient_name"],
                "approved_by_provider": True,
            }
            for index, flow_key in enumerate(sorted(P0_SMS_FLOWS), start=1)
        ],
    }


def test_sms_readiness_can_be_saved_without_enabling_sms_sending(
    test_engine, monkeypatch
):
    monkeypatch.setattr(sms_service, "_enforce_entitlement", lambda *_args: None)

    with Session(test_engine) as session:
        actor = User(
            name="SMS Admin",
            email="sms.admin@medizinhub.local",
            password_hash="test",
            is_super_admin=True,
        )
        session.add(actor)
        session.commit()
        session.refresh(actor)

        saved = sms_service.update_sms_readiness(
            session,
            tenant_id="tenant_sms_ready",
            payload=SmsReadinessUpdate.model_validate(ready_payload()),
            actor=actor,
        )
        loaded = sms_service.get_sms_readiness(session, tenant_id="tenant_sms_ready")

        assert saved.status == "ready"
        assert saved.blockers == 0
        assert loaded.default_sender_id == "MEDHUB"

        row = session.exec(
            select(TenantIntegrationPlugin).where(
                TenantIntegrationPlugin.tenant_id == "tenant_sms_ready",
                TenantIntegrationPlugin.plugin_key == "sms",
            )
        ).one()
        assert row.enabled is False
        assert json.loads(row.config_json)["provider"] == "smscountry"

        audit = session.exec(
            select(AuditEvent).where(
                AuditEvent.tenant_id == "tenant_sms_ready",
                AuditEvent.action == "communication.sms_readiness_updated",
            )
        ).one()
        metadata = json.loads(audit.metadata_json)
        assert metadata["provider"] == "smscountry"
        assert metadata["readiness_status"] == "ready"


def test_sms_readiness_blocks_when_p0_templates_are_missing():
    payload = SmsReadinessUpdate(
        provider="smscountry",
        sms_country_api_mode="rest",
        account_confirmed=True,
        dpa_confirmed=True,
        pricing_confirmed=True,
        delivery_receipts_confirmed=True,
        callback_contract_confirmed=True,
        static_ip_allowlisting_confirmed=True,
        dlt_entity_id="1101000012345678901",
        default_sender_id="MEDHUB",
        throughput_limit_per_minute=1200,
        retention_days=180,
        flows=[
            SmsFlowReadiness(
                flow_key="appointment_booked_patient",
                enabled=True,
                dlt_template_id="1707160000000001",
                registered_body="Registered appointment body.",
                approved_by_provider=True,
            )
        ],
    )

    result = evaluate_sms_readiness(payload)

    assert result.status == "not_ready"
    assert any(check.key == "p0_templates" for check in result.checks)


def test_sms_readiness_update_preserves_operational_settings(test_engine, monkeypatch):
    monkeypatch.setattr(sms_service, "_enforce_entitlement", lambda *_args: None)

    with Session(test_engine) as session:
        actor = User(
            name="SMS Admin",
            email="sms.preserve@medizinhub.local",
            password_hash="test",
            is_super_admin=True,
        )
        session.add(actor)
        session.commit()
        session.refresh(actor)

        sms_service.update_sms_settings(
            session,
            tenant_id="tenant_sms_preserve",
            payload=SmsSettingsUpdate(
                api_url="https://sms.example.com/send",
                default_country_code="+44",
                timeout_seconds=27,
                max_attempts=7,
                max_segments_per_message=4,
                daily_message_limit=321,
                monthly_segment_limit=6543,
                patient_notifications_enabled=False,
                staff_notifications_enabled=True,
                default_language="hi",
                cost_per_segment_paise=19,
            ),
            actor=actor,
        )

        sms_service.update_sms_readiness(
            session,
            tenant_id="tenant_sms_preserve",
            payload=SmsReadinessUpdate.model_validate(ready_payload()),
            actor=actor,
        )
        saved = sms_service.get_sms_settings_model(
            session, tenant_id="tenant_sms_preserve"
        )

        assert str(saved.api_url) == "https://sms.example.com/send"
        assert saved.default_country_code == "+44"
        assert saved.timeout_seconds == 27
        assert saved.max_attempts == 7
        assert saved.max_segments_per_message == 4
        assert saved.daily_message_limit == 321
        assert saved.monthly_segment_limit == 6543
        assert saved.patient_notifications_enabled is False
        assert saved.staff_notifications_enabled is True
        assert saved.default_language == "hi"
        assert saved.cost_per_segment_paise == 19
