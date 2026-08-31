import base64
import json
import re
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from sqlmodel import Session, select

from app.core.credentials import decrypt_credential
from app.infrastructure.integrations.adapters.sms import smscountry
from app.infrastructure.integrations.adapters.sms.smscountry import SmsCountryGateway
from app.infrastructure.integrations.ports.sms import (
    SmsGatewayCredentials,
    SmsSendRequest,
    SmsTemplateReference,
)
from app.modules.audit.models import AuditEvent
from app.modules.identity.models import User
from app.modules.integrations.sms import service as sms_service
from app.modules.integrations.models import TenantIntegrationPlugin
from app.modules.integrations.sms.schemas import SmsSettingsUpdate
from app.modules.integrations.sms.templates import (
    estimate_sms_segments,
    render_sms_template,
    resolve_sms_template,
)
from app.modules.patients.models import Patient, SmsConsentStatus


def sms_request() -> SmsSendRequest:
    return SmsSendRequest(
        destination="+919876543210",
        body="Hello Patient, your appointment is confirmed.",
        template=SmsTemplateReference(
            flow_key="appointment_booked_patient",
            dlt_entity_id="",
            dlt_template_id="1707160000000001",
            sender_id="MEDHUB",
            classification="service_implicit",
        ),
        client_reference="notification_123",
        campaign_name="appointment_booked_patient",
        callback_url="https://api.example.com/sms/dlr",
    )


def ready_settings_payload() -> dict:
    return {
        "provider": "smscountry",
        "sms_country_api_mode": "rest",
        "enabled": True,
        "api_url": "https://restapi.smscountry.com/v0.1/Accounts/{auth_key}/SMSes/",
        "api_key": "auth-key-1234",
        "api_token": "auth-token-5678",
        "webhook_secret": "sms-webhook-secret",
        "account_confirmed": True,
        "dpa_confirmed": True,
        "pricing_confirmed": True,
        "delivery_receipts_confirmed": True,
        "callback_contract_confirmed": True,
        "static_ip_allowlisting_confirmed": True,
        "default_sender_id": "MEDHUB",
        "throughput_limit_per_minute": 1200,
        "retention_days": 180,
        "flows": [
            {
                "flow_key": "appointment_booked_patient",
                "enabled": True,
                "classification": "service_implicit",
                "consent_basis": "patient_transaction",
                "dlt_template_id": "1707160000000001",
                "registered_body": (
                    "Hello {#var#}, your appointment with Dr. {#var#} is confirmed."
                ),
                "variable_keys": ["patient_name", "doctor_name"],
                "approved_by_provider": True,
            }
        ],
    }


def test_smscountry_rest_adapter_sends_expected_payload(monkeypatch):
    captured = {}
    monkeypatch.setattr(smscountry, "validate_public_https_url", lambda _url: None)

    class FakeResponse:
        status = 200

        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return False

        def read(self, _limit):
            return b'{"status":"Success","messageId":"sms-123"}'

    def fake_urlopen(request, timeout):
        captured["url"] = request.full_url
        captured["payload"] = json.loads(request.data)
        captured["headers"] = dict(request.header_items())
        captured["timeout"] = timeout
        return FakeResponse()

    monkeypatch.setattr(smscountry, "urlopen", fake_urlopen)

    result = SmsCountryGateway().send_sms(
        sms_request(),
        credentials=SmsGatewayCredentials(
            auth_key="auth-key-1234",
            auth_token="auth-token-5678",
        ),
        mode="rest",
        api_url="https://restapi.smscountry.com/v0.1/Accounts/{auth_key}/SMSes/",
        timeout_seconds=12,
    )

    expected_auth = base64.b64encode(b"auth-key-1234:auth-token-5678").decode("ascii")
    assert result.success is True
    assert result.status == "accepted"
    assert result.external_message_id == "sms-123"
    assert captured["url"].endswith("/Accounts/auth-key-1234/SMSes/")
    assert captured["headers"]["Authorization"] == f"Basic {expected_auth}"
    assert captured["payload"] == {
        "Text": "Hello Patient, your appointment is confirmed.",
        "Number": "919876543210",
        "SenderId": "MEDHUB",
        "Tool": "API",
        "NameOfCampaign": "appointment_booked_patient",
        "ClientReference": "notification_123",
        "DltTemplateId": "1707160000000001",
        "DRNotifyUrl": "https://api.example.com/sms/dlr",
        "DRNotifyHttpMethod": "POST",
    }
    assert captured["timeout"] == 12


def test_smscountry_legacy_adapter_sends_expected_query(monkeypatch):
    captured = {}
    monkeypatch.setattr(smscountry, "validate_public_https_url", lambda _url: None)

    class FakeResponse:
        status = 200

        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return False

        def read(self, _limit):
            return b"OK:515789649"

    def fake_urlopen(request, timeout):
        captured["url"] = request.full_url
        captured["timeout"] = timeout
        return FakeResponse()

    monkeypatch.setattr(smscountry, "urlopen", fake_urlopen)

    result = SmsCountryGateway().send_sms(
        sms_request(),
        credentials=SmsGatewayCredentials(username="legacyuser", password="legacypass"),
        mode="http_legacy",
        api_url="https://api.smscountry.com/SMSCwebservice_bulk.aspx",
        timeout_seconds=9,
    )

    query = parse_qs(urlparse(captured["url"]).query)
    assert result.success is True
    assert result.external_message_id == "515789649"
    assert query["User"] == ["legacyuser"]
    assert query["passwd"] == ["legacypass"]
    assert query["mobilenumber"] == ["919876543210"]
    assert query["sid"] == ["MEDHUB"]
    assert query["DR"] == ["Y"]
    assert captured["timeout"] == 9


def test_sms_settings_encrypt_credentials_and_runtime_decrypts(
    test_engine, monkeypatch
):
    monkeypatch.setattr(sms_service, "_enforce_entitlement", lambda *_args: None)

    with Session(test_engine) as session:
        actor = User(
            name="SMS Admin",
            email="sms.phase2@medizinhub.local",
            password_hash="test",
            is_super_admin=True,
        )
        session.add(actor)
        session.commit()
        session.refresh(actor)

        saved = sms_service.update_sms_settings(
            session,
            tenant_id="tenant_sms_phase2",
            payload=SmsSettingsUpdate.model_validate(ready_settings_payload()),
            actor=actor,
        )
        runtime = sms_service.get_sms_gateway_runtime_settings(
            session, tenant_id="tenant_sms_phase2"
        )

        assert saved.enabled is True
        assert saved.has_credentials is True
        assert saved.has_webhook_secret is True
        assert saved.credential_last_four == "1234"
        assert runtime.credentials.auth_key == "auth-key-1234"
        assert runtime.credentials.auth_token == "auth-token-5678"
        assert runtime.webhook_secret == "sms-webhook-secret"

        row = session.exec(
            select(TenantIntegrationPlugin).where(
                TenantIntegrationPlugin.tenant_id == "tenant_sms_phase2",
                TenantIntegrationPlugin.plugin_key == "sms",
            )
        ).one()
        assert "auth-token-5678" not in row.config_json
        assert "sms-webhook-secret" not in row.config_json
        assert "auth-token-5678" in decrypt_credential(row.secret_ciphertext or "")

        audit = session.exec(
            select(AuditEvent).where(
                AuditEvent.tenant_id == "tenant_sms_phase2",
                AuditEvent.action == "communication.sms_settings_updated",
            )
        ).one()
        assert "auth-token-5678" not in audit.metadata_json
        assert "sms-webhook-secret" not in audit.metadata_json
        assert json.loads(audit.metadata_json)["credential_changed"] is True


def test_new_tenant_starts_with_only_registration_and_booking_templates(
    test_engine, monkeypatch
):
    monkeypatch.setattr(sms_service, "_enforce_entitlement", lambda *_args: None)

    with Session(test_engine) as session:
        settings = sms_service.get_sms_settings(
            session, tenant_id="tenant_sms_starter_templates"
        )

        assert [flow.flow_key for flow in settings.flows] == [
            "patient_registered_patient",
            "appointment_booked_patient",
        ]
        registration, booking = settings.flows
        assert registration.variable_keys == ["patient_name", "patient_number"]
        assert booking.variable_keys == [
            "patient_name",
            "doctor_name",
            "consultation_type",
            "appointment_date",
            "appointment_time",
            "appointment_id",
        ]
        assert registration.enabled is False
        assert booking.enabled is False


def test_sms_template_resolution_and_segment_estimate():
    settings = SmsSettingsUpdate.model_validate(ready_settings_payload())

    resolved = resolve_sms_template(
        settings,
        flow_key="appointment_booked_patient",
        values={"patient_name": "Anita", "doctor_name": "Kumar"},
    )

    assert resolved.body == "Hello Anita, your appointment with Dr. Kumar is confirmed."
    assert resolved.template.dlt_template_id == "1707160000000001"
    assert resolved.segment_estimate.encoding == "gsm7"
    assert resolved.segment_estimate.segments == 1
    assert len(resolved.body_hash) == 64
    assert estimate_sms_segments("नमस्ते").encoding == "unicode"


def test_patient_model_has_independent_sms_consent_fields():
    patient = Patient(
        tenant_id="tenant_sms",
        patient_number="PAT-001",
        full_name="SMS Patient",
    )

    assert patient.sms_consent_status == SmsConsentStatus.NOT_RECORDED
    assert patient.sms_preferred_language == "en"


def test_sms_foundation_migration_seeds_orm_readable_consent_status():
    migration = (
        Path(__file__).parents[1]
        / "alembic"
        / "versions"
        / "20260830_0130_sms_foundation.py"
    ).read_text()
    readable = set(Patient.__table__.c.sms_consent_status.type.enums)
    seeded = set(re.findall(r"sms_consent_status, '([^']+)'", migration))

    assert seeded
    assert seeded <= readable


# --------------------------------------------------------------------------
# No hardcoded provider URL: the adapter and the settings schema both require
# api_url from tenant configuration, matching how the WhatsApp adapter works.
# --------------------------------------------------------------------------


def test_smscountry_rest_adapter_requires_a_configured_api_url():
    try:
        SmsCountryGateway().send_sms(
            sms_request(),
            credentials=SmsGatewayCredentials(
                auth_key="auth-key-1234", auth_token="auth-token-5678"
            ),
            mode="rest",
            api_url=None,
        )
        raise AssertionError("Sending without a configured API URL must fail")
    except ValueError as exc:
        assert "API URL" in str(exc)


def test_smscountry_legacy_adapter_requires_a_configured_api_url():
    try:
        SmsCountryGateway().send_sms(
            sms_request(),
            credentials=SmsGatewayCredentials(username="user", password="pass"),
            mode="http_legacy",
            api_url=None,
        )
        raise AssertionError("Sending without a configured API URL must fail")
    except ValueError as exc:
        assert "API URL" in str(exc)


def test_smscountry_adapter_rejects_a_non_public_api_url(monkeypatch):
    try:
        SmsCountryGateway().send_sms(
            sms_request(),
            credentials=SmsGatewayCredentials(
                auth_key="auth-key-1234", auth_token="auth-token-5678"
            ),
            mode="rest",
            api_url="https://localhost/SMSes/",
        )
        raise AssertionError("A localhost API URL must be rejected")
    except ValueError:
        pass


def test_smscountry_adapter_has_no_baked_in_provider_url():
    """Guards against the URL fallback constants ever coming back."""
    assert not hasattr(smscountry, "REST_SEND_URL")
    assert not hasattr(smscountry, "LEGACY_SEND_URL")


def test_sms_settings_require_api_url_when_enabled():
    payload = ready_settings_payload()
    payload["api_url"] = None
    try:
        SmsSettingsUpdate.model_validate(payload)
        raise AssertionError("Enabling SMS without an API URL must fail validation")
    except Exception as exc:
        assert "API URL" in str(exc)


def test_sms_settings_allow_a_missing_api_url_while_disabled():
    payload = ready_settings_payload()
    payload["enabled"] = False
    payload["api_url"] = None
    # Must not raise: a tenant mid-setup can save partial config while off.
    SmsSettingsUpdate.model_validate(payload)


def test_sms_settings_keep_the_auth_key_placeholder_unescaped():
    """A pydantic URL type percent-encodes the braces, which silently breaks the
    adapter's substitution and surfaces an hour later as an opaque 401."""
    settings = SmsSettingsUpdate.model_validate(ready_settings_payload())

    assert "{auth_key}" in settings.api_url
    assert "%7B" not in settings.api_url
    assert settings.api_url.format(auth_key="KEY").endswith("/Accounts/KEY/SMSes/")


def test_sms_settings_reject_a_rest_url_that_names_no_account():
    payload = ready_settings_payload()
    payload["api_url"] = "https://restapi.smscountry.com/v0.1/SMSes/"
    try:
        SmsSettingsUpdate.model_validate(payload)
        raise AssertionError("A REST URL without an account segment must fail")
    except Exception as exc:
        assert "/Accounts/" in str(exc)


def test_sms_settings_reject_a_rest_url_with_an_empty_account_segment():
    payload = ready_settings_payload()
    payload["api_url"] = "https://restapi.smscountry.com/v0.1/Accounts//SMSes/"
    try:
        SmsSettingsUpdate.model_validate(payload)
        raise AssertionError("A REST URL with an empty account segment must fail")
    except Exception as exc:
        assert "account" in str(exc).lower()


def test_registration_template_accepts_legacy_patient_id_alias():
    """Older saved registration templates used patient_id for Patient Number.

    Normalize it to patient_number so existing tenant settings do not break patient
    registration when the SMS config is loaded.
    """
    from app.modules.integrations.sms.schemas import SmsFlowReadiness

    entry = SmsFlowReadiness(
        flow_key="patient_registered_patient",
        enabled=True,
        dlt_template_id="1707160000000001",
        approved_by_provider=True,
        registered_body="Dear {#var#}, your Patient ID is {#var#}.",
        variable_keys=["patient_name", "patient_id"],
    )

    assert entry.variable_keys == ["patient_name", "patient_number"]


def test_registration_template_legacy_alias_renders_with_patient_number():
    settings = SmsSettingsUpdate.model_validate(
        {
            **ready_settings_payload(),
            "flows": [
                {
                    "flow_key": "patient_registered_patient",
                    "enabled": True,
                    "classification": "service_implicit",
                    "consent_basis": "patient_transaction",
                    "dlt_template_id": "1707160000000001",
                    "registered_body": "Dear {#var#}, your Patient ID is {#var#}.",
                    "variable_keys": ["patient_name", "patient_id"],
                    "approved_by_provider": True,
                }
            ],
        }
    )

    resolved = resolve_sms_template(
        settings,
        flow_key="patient_registered_patient",
        values={"patient_name": "Rahul", "patient_number": "SMC-PAT-00125"},
    )

    assert resolved.body == "Dear Rahul, your Patient ID is SMC-PAT-00125."


def test_a_template_may_declare_any_subset_of_the_supplied_variables():
    from app.modules.integrations.sms.schemas import SmsFlowReadiness

    entry = SmsFlowReadiness(
        flow_key="appointment_booked_patient",
        enabled=True,
        dlt_template_id="1707160000000002",
        approved_by_provider=True,
        registered_body="Dear {#var#}, your appointment is on {#var#}.",
        variable_keys=["patient_name", "appointment_date"],
    )
    assert entry.variable_keys == ["patient_name", "appointment_date"]


def test_template_settings_do_not_block_custom_variable_names():
    from app.modules.integrations.sms.schemas import SmsFlowReadiness

    entry = SmsFlowReadiness(
        flow_key="patient_registered_patient",
        enabled=True,
        dlt_template_id="1707160000000003",
        approved_by_provider=True,
        registered_body="Dear {#var#}, your Patient ID is {#var#}.",
        variable_keys=["patient_name", "patient_num"],
    )

    assert entry.variable_keys == ["patient_name", "patient_num"]


def test_template_renders_from_exact_event_field_names():
    body, values = render_sms_template(
        "Dear {#var#}, your Patient ID is {#var#}.",
        ["patient_name", "patient_number"],
        {"patient_name": "Rahul", "patient_number": "SMC-PAT-00125"},
    )

    assert body == "Dear Rahul, your Patient ID is SMC-PAT-00125."
    assert values == ["Rahul", "SMC-PAT-00125"]


def test_template_rendering_rejects_a_key_that_event_data_does_not_contain():
    try:
        render_sms_template(
            "Dear {#var#}, your Patient ID is {#var#}.",
            ["patient_name", "patient_num"],
            {"patient_name": "Rahul", "patient_number": "SMC-PAT-00125"},
        )
        raise AssertionError("Unknown variable keys must not render by position")
    except ValueError as exc:
        assert "patient_num" in str(exc)


def test_sms_settings_reject_a_literal_auth_key_in_the_api_url():
    """The auth key is a credential: it belongs in the encrypted secret bundle,
    not in plaintext config that every settings read returns."""
    payload = ready_settings_payload()
    payload["api_url"] = (
        "https://restapi.smscountry.com/v0.1/Accounts/auth-key-1234/SMSes/"
    )
    try:
        SmsSettingsUpdate.model_validate(payload)
        raise AssertionError("A literal auth key in the URL must be rejected")
    except Exception as exc:
        assert "{auth_key}" in str(exc)


# --------------------------------------------------------------------------
# Multiple named templates per flow, add/delete, mirroring WhatsApp's
# custom_templates: a tenant can register several DLT templates for the same
# workflow and switch which one is enabled, or drop one entirely.
# --------------------------------------------------------------------------


def _second_template_for(flow_key: str, **overrides) -> dict:
    template = {
        "id": "sms_tpl_alt_variant",
        "flow_key": flow_key,
        "name": "Alternate wording",
        "enabled": False,
        "classification": "service_implicit",
        "consent_basis": "patient_transaction",
        "dlt_template_id": "1707160000000099",
        "registered_body": "Namaste {#var#}, appointment update.",
        "variable_keys": ["patient_name"],
        "approved_by_provider": True,
    }
    template.update(overrides)
    return template


def test_multiple_templates_can_be_registered_for_one_flow():
    payload = ready_settings_payload()
    payload["flows"].append(_second_template_for("appointment_booked_patient"))
    settings = SmsSettingsUpdate.model_validate(payload)
    assert len(settings.flows) == 2
    assert {flow.flow_key for flow in settings.flows} == {"appointment_booked_patient"}


def test_only_one_enabled_template_allowed_per_flow():
    payload = ready_settings_payload()
    payload["flows"].append(
        _second_template_for("appointment_booked_patient", enabled=True)
    )
    try:
        SmsSettingsUpdate.model_validate(payload)
        raise AssertionError("Two enabled templates for the same flow must be rejected")
    except Exception as exc:
        assert "one enabled" in str(exc).lower()


def test_template_ids_must_be_unique_even_across_flows():
    payload = ready_settings_payload()
    duplicate = dict(payload["flows"][0])
    duplicate["id"] = "sms_tpl_shared_id"
    payload["flows"][0]["id"] = "sms_tpl_shared_id"
    duplicate["flow_key"] = "patient_registered_patient"
    duplicate["enabled"] = False
    payload["flows"].append(duplicate)
    try:
        SmsSettingsUpdate.model_validate(payload)
        raise AssertionError("Duplicate template ids must be rejected")
    except Exception as exc:
        assert "unique" in str(exc).lower()


def test_a_new_template_gets_a_generated_id_when_none_is_given():
    from app.modules.integrations.sms.schemas import SmsFlowReadiness

    entry = SmsFlowReadiness(flow_key="appointment_booked_patient")
    assert entry.id.startswith("sms_tpl_")


def test_disabling_the_live_template_and_enabling_the_alternate_switches_atomically(
    test_engine, monkeypatch
):
    """Deleting/disabling one template and enabling another in the same save
    is the normal 'switch template' workflow and must not trip the
    one-enabled-per-flow rule against its own previous state."""
    monkeypatch.setattr(sms_service, "_enforce_entitlement", lambda *_args: None)
    with Session(test_engine) as session:
        actor = User(
            name="Template Switcher",
            email="template.switch@medizinhub.local",
            password_hash="test",
            is_super_admin=True,
        )
        session.add(actor)
        session.commit()
        session.refresh(actor)

        first_save = sms_service.update_sms_settings(
            session,
            tenant_id="tenant_sms_template_switch",
            payload=SmsSettingsUpdate.model_validate(ready_settings_payload()),
            actor=actor,
        )
        assert len(first_save.flows) == 1
        assert first_save.flows[0].enabled is True

        payload = ready_settings_payload()
        payload["flows"][0]["enabled"] = False
        payload["flows"].append(
            _second_template_for("appointment_booked_patient", enabled=True)
        )
        switched = sms_service.update_sms_settings(
            session,
            tenant_id="tenant_sms_template_switch",
            payload=SmsSettingsUpdate.model_validate(payload),
            actor=actor,
        )
        enabled_ids = [flow.id for flow in switched.flows if flow.enabled]
        assert enabled_ids == ["sms_tpl_alt_variant"]


def test_deleting_a_template_removes_it_from_saved_settings(test_engine, monkeypatch):
    monkeypatch.setattr(sms_service, "_enforce_entitlement", lambda *_args: None)
    with Session(test_engine) as session:
        actor = User(
            name="Template Deleter",
            email="template.delete@medizinhub.local",
            password_hash="test",
            is_super_admin=True,
        )
        session.add(actor)
        session.commit()
        session.refresh(actor)

        payload = ready_settings_payload()
        payload["flows"].append(_second_template_for("appointment_booked_patient"))
        sms_service.update_sms_settings(
            session,
            tenant_id="tenant_sms_template_delete",
            payload=SmsSettingsUpdate.model_validate(payload),
            actor=actor,
        )

        payload_without_alt = ready_settings_payload()
        after_delete = sms_service.update_sms_settings(
            session,
            tenant_id="tenant_sms_template_delete",
            payload=SmsSettingsUpdate.model_validate(payload_without_alt),
            actor=actor,
        )
        assert len(after_delete.flows) == 1
        assert "sms_tpl_alt_variant" not in {flow.id for flow in after_delete.flows}
