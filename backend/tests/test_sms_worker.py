"""Phase 3: SMS worker, delivery receipts, and queue administration."""

import hmac
import json
from datetime import timedelta
from hashlib import sha256

from fastapi import HTTPException
from sqlmodel import Session, select

from app.infrastructure.integrations.ports.sms import SmsSendResult
from app.modules.identity.models import User
from app.modules.integrations.sms import delivery_receipts as receipts
from app.modules.integrations.sms import queue_service as sms_queue_service
from app.modules.integrations.sms import service as sms_service
from app.modules.integrations.sms import test_send as sms_test_send
from app.modules.integrations.sms.delivery_receipts import (
    map_provider_status,
    record_delivery_receipt,
    verify_receipt_signature,
)
from app.modules.integrations.sms.schemas import SmsSettingsUpdate, SmsTestRequest
from app.modules.integrations.sms.usage import _counts
from app.modules.notifications import sms_processor
from app.modules.notifications.models import (
    NotificationEvent,
    NotificationEventType,
    NotificationProvider,
    NotificationStatus,
)
from app.modules.patients.models import Patient, SmsConsentStatus


TENANT = "tenant_sms_phase3"
WEBHOOK_SECRET = "sms-webhook-secret"


def ready_settings_payload() -> dict:
    return {
        "provider": "smscountry",
        "sms_country_api_mode": "rest",
        "enabled": True,
        "api_url": "https://restapi.smscountry.com/v0.1/Accounts/{auth_key}/SMSes/",
        "api_key": "auth-key-1234",
        "api_token": "auth-token-5678",
        "webhook_secret": WEBHOOK_SECRET,
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


def _second_template_for(flow_key: str, **overrides) -> dict:
    """A second, alternately-worded template for the same flow_key."""
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


class FakeGateway:
    """Records the request and returns a scripted result."""

    def __init__(self, result: SmsSendResult):
        self.result = result
        self.requests = []

    def send_sms(self, request, **kwargs):
        self.requests.append((request, kwargs))
        return self.result


def _disable_entitlements(monkeypatch):
    monkeypatch.setattr(sms_service, "_enforce_entitlement", lambda *_args: None)
    monkeypatch.setattr(sms_queue_service, "_enforce_access", lambda *_args: None)
    monkeypatch.setattr(
        sms_processor, "enforce_module_enabled", lambda *_args, **_kw: None
    )
    # Plan lookups are a Phase 5 concern; keep volume limits out of the way.
    monkeypatch.setattr(sms_processor, "enforce_sms_limits", lambda *_args, **_kw: None)


def _actor(session: Session, email: str) -> User:
    actor = User(
        name="SMS Admin",
        email=email,
        password_hash="test",
        is_super_admin=True,
    )
    session.add(actor)
    session.commit()
    session.refresh(actor)
    return actor


def _configure(session: Session, actor: User, *, tenant_id: str = TENANT) -> None:
    sms_service.update_sms_settings(
        session,
        tenant_id=tenant_id,
        payload=SmsSettingsUpdate.model_validate(ready_settings_payload()),
        actor=actor,
    )


def _queue_event(
    session: Session,
    *,
    tenant_id: str = TENANT,
    patient_id: str | None = None,
    recipient: str = "+919876543210",
    values: dict | None = None,
) -> NotificationEvent:
    event = NotificationEvent(
        tenant_id=tenant_id,
        provider=NotificationProvider.SMS,
        event_type=NotificationEventType.APPOINTMENT_REMINDER,
        recipient=recipient,
        message=json.dumps(values or {"patient_name": "Asha", "doctor_name": "Kumar"}),
        template_key="appointment_booked_patient",
        resource_type="patient" if patient_id else None,
        resource_id=patient_id,
    )
    session.add(event)
    session.commit()
    session.refresh(event)
    return event


# --------------------------------------------------------------------------
# Provider status mapping
# --------------------------------------------------------------------------


def test_provider_statuses_fold_into_the_internal_vocabulary():
    assert map_provider_status("Delivered") == "delivered"
    assert map_provider_status("DLVRD") == "delivered"
    assert map_provider_status("Undelivered") == "undelivered"
    assert map_provider_status("Expired") == "expired"
    assert map_provider_status("Rejected") == "rejected"
    assert map_provider_status("Invalid Number") == "rejected"
    assert map_provider_status("Submitted") == "accepted"
    assert map_provider_status("NDNC") == "blocked"
    assert map_provider_status("DND") == "blocked"
    assert map_provider_status("1") == "delivered"


def test_unknown_provider_status_is_not_guessed():
    assert map_provider_status("SOME_NEW_STATE") == "unknown"
    assert map_provider_status("") == "unknown"
    assert map_provider_status(None) == "unknown"


# --------------------------------------------------------------------------
# Webhook signature
# --------------------------------------------------------------------------


def test_receipt_signature_requires_a_matching_hmac():
    body = b'{"Status":"Delivered"}'
    signature = hmac.new(WEBHOOK_SECRET.encode(), body, sha256).hexdigest()

    assert verify_receipt_signature(
        secret=WEBHOOK_SECRET, raw_body=body, signature=signature
    )
    assert verify_receipt_signature(
        secret=WEBHOOK_SECRET, raw_body=body, signature=f"sha256={signature}"
    )
    assert not verify_receipt_signature(
        secret=WEBHOOK_SECRET, raw_body=body, signature="deadbeef"
    )
    assert not verify_receipt_signature(
        secret=WEBHOOK_SECRET, raw_body=b'{"Status":"Failed"}', signature=signature
    )


def test_a_tenant_without_a_secret_cannot_have_receipts_verified():
    body = b'{"Status":"Delivered"}'
    assert not verify_receipt_signature(secret=None, raw_body=body, signature="x")
    assert not verify_receipt_signature(
        secret=WEBHOOK_SECRET, raw_body=body, signature=None
    )


# --------------------------------------------------------------------------
# Delivery receipts
# --------------------------------------------------------------------------


def test_delivery_receipt_marks_the_message_delivered(test_engine, monkeypatch):
    _disable_entitlements(monkeypatch)
    with Session(test_engine) as session:
        event = _queue_event(session)
        event.provider_message_id = "sms-abc"
        event.status = NotificationStatus.SENT
        event.delivery_status = "accepted"
        session.add(event)
        session.commit()

        result = record_delivery_receipt(
            session,
            tenant_id=TENANT,
            payload={"MessageUUID": "sms-abc", "Status": "Delivered"},
        )
        session.refresh(event)

        assert result.matched is True
        assert result.delivery_status == "delivered"
        assert event.delivery_status == "delivered"
        assert event.delivered_at is not None
        assert event.status == NotificationStatus.SENT


def test_undelivered_receipt_fails_without_scheduling_a_retry(test_engine, monkeypatch):
    _disable_entitlements(monkeypatch)
    with Session(test_engine) as session:
        event = _queue_event(session)
        event.provider_message_id = "sms-undeliv"
        event.status = NotificationStatus.SENT
        event.delivery_status = "accepted"
        session.add(event)
        session.commit()

        record_delivery_receipt(
            session,
            tenant_id=TENANT,
            payload={"MessageUUID": "sms-undeliv", "Status": "Undelivered"},
        )
        session.refresh(event)

        assert event.delivery_status == "undelivered"
        assert event.status == NotificationStatus.FAILED
        # The gateway accepted it, so this is not a send failure to retry.
        assert event.attempt_count == 0


def test_duplicate_delivery_receipts_are_idempotent(test_engine, monkeypatch):
    _disable_entitlements(monkeypatch)
    with Session(test_engine) as session:
        event = _queue_event(session)
        event.provider_message_id = "sms-dup"
        event.status = NotificationStatus.SENT
        event.delivery_status = "accepted"
        session.add(event)
        session.commit()

        first = record_delivery_receipt(
            session,
            tenant_id=TENANT,
            payload={"MessageUUID": "sms-dup", "Status": "Delivered"},
        )
        session.refresh(event)
        delivered_at = event.delivered_at

        second = record_delivery_receipt(
            session,
            tenant_id=TENANT,
            payload={"MessageUUID": "sms-dup", "Status": "Failed"},
        )
        session.refresh(event)

        assert first.delivery_status == "delivered"
        assert second.matched is True
        # A late contradicting callback must not overwrite a final state.
        assert event.delivery_status == "delivered"
        assert event.delivered_at == delivered_at
        assert event.status == NotificationStatus.SENT


def test_receipt_matches_on_client_reference_when_message_id_is_absent(
    test_engine, monkeypatch
):
    _disable_entitlements(monkeypatch)
    with Session(test_engine) as session:
        event = _queue_event(session)
        event.status = NotificationStatus.SENT
        event.delivery_status = "accepted"
        session.add(event)
        session.commit()

        result = record_delivery_receipt(
            session,
            tenant_id=TENANT,
            payload={"ClientReference": event.id, "Status": "Delivered"},
        )
        session.refresh(event)

        assert result.matched is True
        assert event.delivery_status == "delivered"


def test_receipt_for_another_tenant_is_never_applied(test_engine, monkeypatch):
    _disable_entitlements(monkeypatch)
    with Session(test_engine) as session:
        event = _queue_event(session)
        event.provider_message_id = "sms-tenant-scope"
        event.status = NotificationStatus.SENT
        event.delivery_status = "accepted"
        session.add(event)
        session.commit()

        result = record_delivery_receipt(
            session,
            tenant_id="tenant_other",
            payload={"MessageUUID": "sms-tenant-scope", "Status": "Delivered"},
        )
        session.refresh(event)

        assert result.matched is False
        assert event.delivery_status == "accepted"


def test_unmatched_receipt_is_acknowledged_but_writes_nothing(test_engine, monkeypatch):
    _disable_entitlements(monkeypatch)
    with Session(test_engine) as session:
        result = record_delivery_receipt(
            session,
            tenant_id=TENANT,
            payload={"MessageUUID": "does-not-exist", "Status": "Delivered"},
        )
        assert result.accepted is True
        assert result.matched is False


def test_receipt_body_parses_json_and_form_encoding():
    assert receipts.parse_receipt_body(b'{"Status":"Delivered"}') == {
        "Status": "Delivered"
    }
    assert receipts.parse_receipt_body(b"Status=Delivered&MessageUUID=abc") == {
        "Status": "Delivered",
        "MessageUUID": "abc",
    }
    assert receipts.parse_receipt_body(b"") == {}
    assert receipts.parse_receipt_body(b"not json") == {}


# --------------------------------------------------------------------------
# Worker
# --------------------------------------------------------------------------


def test_worker_sends_a_due_message_and_records_acceptance(test_engine, monkeypatch):
    _disable_entitlements(monkeypatch)
    gateway = FakeGateway(
        SmsSendResult(
            True,
            "accepted",
            "SMS accepted by SMSCountry.",
            external_message_id="sms-sent-1",
        )
    )
    with Session(test_engine) as session:
        actor = _actor(session, "phase3.send@medizinhub.local")
        _configure(session, actor)
        event = _queue_event(session)

        processed = sms_processor.process_due_sms_notifications(
            session, gateway=gateway
        )
        session.refresh(event)

        assert processed == 1
        assert event.failure_reason is None, event.failure_reason
        assert event.status == NotificationStatus.SENT
        assert event.delivery_status == "accepted"
        assert event.provider_message_id == "sms-sent-1"
        assert event.sent_at is not None
        assert event.delivered_at is None
        assert event.sender_id == "MEDHUB"
        assert event.template_external_id == "1707160000000001"
        assert event.segment_count == 1
        assert event.attempt_count == 1

        sent_request, _kwargs = gateway.requests[0]
        assert sent_request.body == (
            "Hello Asha, your appointment with Dr. Kumar is confirmed."
        )
        # ClientReference lets an unmatched receipt still find its row.
        assert sent_request.client_reference == event.id


def test_successful_test_send_is_recorded_in_the_billable_sms_ledger(
    test_engine, monkeypatch
):
    _disable_entitlements(monkeypatch)
    monkeypatch.setattr(
        sms_test_send, "enforce_sms_limits", lambda *_args, **_kwargs: None
    )
    gateway = FakeGateway(
        SmsSendResult(
            True,
            "accepted",
            "SMS accepted by SMSCountry.",
            external_message_id="sms-test-ledger",
            segment_count=2,
        )
    )
    with Session(test_engine) as session:
        actor = _actor(session, "phase3.test-ledger@medizinhub.local")
        _configure(session, actor)

        result = sms_test_send.send_sms_test(
            session,
            tenant_id=TENANT,
            payload=SmsTestRequest(
                mobile="9876543210",
                flow_key="appointment_booked_patient",
                variables={
                    "patient_name": "Test Patient",
                    "doctor_name": "Kumar",
                },
            ),
            actor=actor,
            gateway=gateway,
        )
        event = session.exec(
            select(NotificationEvent).where(
                NotificationEvent.tenant_id == TENANT,
                NotificationEvent.resource_type == "sms_integration_test",
            )
        ).one()

        assert result.success is True
        assert event.status == NotificationStatus.SENT
        assert event.accepted_at is not None
        assert event.segment_count == 2
        assert event.provider_message_id == "sms-test-ledger"


def test_test_sends_are_rate_limited_per_tenant(test_engine, monkeypatch):
    """The one send path with no consent check and no volume ceiling of its own."""
    _disable_entitlements(monkeypatch)
    monkeypatch.setattr(
        sms_test_send, "enforce_sms_limits", lambda *_args, **_kwargs: None
    )
    gateway = FakeGateway(
        SmsSendResult(True, "accepted", "SMS accepted by SMSCountry.")
    )

    def _send(session, actor):
        return sms_test_send.send_sms_test(
            session,
            tenant_id=TENANT,
            payload=SmsTestRequest(
                mobile="9876543210",
                flow_key="appointment_booked_patient",
                variables={
                    "patient_name": "Test Patient",
                    "doctor_name": "Kumar",
                },
            ),
            actor=actor,
            gateway=gateway,
        )

    with Session(test_engine) as session:
        actor = _actor(session, "phase3.test-throttle@medizinhub.local")
        _configure(session, actor)

        for _ in range(sms_test_send.TEST_SENDS_PER_HOUR):
            _send(session, actor)

        try:
            _send(session, actor)
            raise AssertionError("The test send above the hourly cap must be refused")
        except HTTPException as exc:
            assert exc.status_code == 429
            assert "limit" in exc.detail

        assert len(gateway.requests) == sms_test_send.TEST_SENDS_PER_HOUR


def test_sms_usage_counts_only_provider_accepted_messages(test_engine):
    with Session(test_engine) as session:
        accepted = _queue_event(session)
        accepted.status = NotificationStatus.SENT
        accepted.accepted_at = sms_processor.now_utc()
        accepted.segment_count = 2
        rejected = _queue_event(session, recipient="+919876543211")
        rejected.status = NotificationStatus.FAILED
        rejected.segment_count = 3
        _queue_event(session, recipient="+919876543212")
        session.add(accepted)
        session.add(rejected)
        session.commit()

        messages, segments = _counts(
            session,
            TENANT,
            sms_processor.now_utc() - timedelta(days=1),
            sms_processor.now_utc() + timedelta(days=1),
        )

        assert messages == 1
        assert segments == 2


def test_worker_requeues_a_retryable_failure_with_backoff(test_engine, monkeypatch):
    _disable_entitlements(monkeypatch)
    gateway = FakeGateway(
        SmsSendResult(
            False,
            "service_unavailable",
            "SMSCountry is temporarily unavailable.",
            retryable=True,
        )
    )
    with Session(test_engine) as session:
        actor = _actor(session, "phase3.retry@medizinhub.local")
        _configure(session, actor)
        event = _queue_event(session)
        queued_next_attempt = event.next_attempt_at

        sms_processor.process_due_sms_notifications(session, gateway=gateway)
        session.refresh(event)

        assert event.status == NotificationStatus.QUEUED
        assert event.attempt_count == 1
        assert event.next_attempt_at > queued_next_attempt
        assert event.processing_started_at is None


def test_worker_defers_without_sending_when_tenant_throughput_is_reached(
    test_engine, monkeypatch
):
    _disable_entitlements(monkeypatch)
    gateway = FakeGateway(SmsSendResult(True, "accepted", "ok"))
    with Session(test_engine) as session:
        actor = _actor(session, "phase3.throughput@medizinhub.local")
        payload = ready_settings_payload()
        payload["throughput_limit_per_minute"] = 1
        sms_service.update_sms_settings(
            session,
            tenant_id=TENANT,
            payload=SmsSettingsUpdate.model_validate(payload),
            actor=actor,
        )
        accepted = _queue_event(session)
        accepted.status = NotificationStatus.SENT
        accepted.accepted_at = sms_processor.now_utc()
        session.add(accepted)
        session.commit()
        event = _queue_event(session, recipient="+919876543211")
        previous_attempt = event.next_attempt_at

        sms_processor.process_due_sms_notifications(session, gateway=gateway)
        session.refresh(event)

        assert event.status == NotificationStatus.QUEUED
        assert event.next_attempt_at > previous_attempt
        assert "throughput" in str(event.failure_reason).lower()
        assert event.attempt_count == 0
        assert gateway.requests == []


def test_worker_fails_permanently_on_a_rejected_request(test_engine, monkeypatch):
    _disable_entitlements(monkeypatch)
    gateway = FakeGateway(
        SmsSendResult(
            False,
            "request_rejected",
            "SMSCountry rejected the SMS request.",
            retryable=False,
        )
    )
    with Session(test_engine) as session:
        actor = _actor(session, "phase3.reject@medizinhub.local")
        _configure(session, actor)
        event = _queue_event(session)

        sms_processor.process_due_sms_notifications(session, gateway=gateway)
        session.refresh(event)

        assert event.status == NotificationStatus.FAILED
        assert event.attempt_count == 1


def test_worker_stops_retrying_at_max_attempts(test_engine, monkeypatch):
    _disable_entitlements(monkeypatch)
    gateway = FakeGateway(
        SmsSendResult(False, "send_failed", "Could not reach provider.", retryable=True)
    )
    with Session(test_engine) as session:
        actor = _actor(session, "phase3.maxattempts@medizinhub.local")
        _configure(session, actor)
        event = _queue_event(session)
        event.attempt_count = 4
        event.max_attempts = 5
        session.add(event)
        session.commit()

        sms_processor.process_due_sms_notifications(session, gateway=gateway)
        session.refresh(event)

        assert event.attempt_count == 5
        assert event.status == NotificationStatus.FAILED


def test_worker_cancels_for_a_patient_who_opted_out(test_engine, monkeypatch):
    _disable_entitlements(monkeypatch)
    gateway = FakeGateway(SmsSendResult(True, "accepted", "ok"))
    with Session(test_engine) as session:
        actor = _actor(session, "phase3.optout@medizinhub.local")
        _configure(session, actor)
        patient = Patient(
            tenant_id=TENANT,
            patient_number="P-PHASE3-1",
            full_name="Opted Out",
            mobile="+919876543210",
            sms_consent_status=SmsConsentStatus.OPTED_OUT,
        )
        session.add(patient)
        session.commit()
        session.refresh(patient)
        event = _queue_event(session, patient_id=patient.id)

        sms_processor.process_due_sms_notifications(session, gateway=gateway)
        session.refresh(event)

        assert event.status == NotificationStatus.CANCELLED
        assert gateway.requests == []


def test_worker_checks_consent_against_the_selected_language_template(
    test_engine, monkeypatch
):
    _disable_entitlements(monkeypatch)
    gateway = FakeGateway(SmsSendResult(True, "accepted", "ok"))
    with Session(test_engine) as session:
        actor = _actor(session, "phase3.language-consent@medizinhub.local")
        payload = ready_settings_payload()
        payload["flows"].append(
            _second_template_for(
                "appointment_booked_patient",
                id="sms_tpl_tamil_explicit",
                enabled=True,
                language="ta",
                classification="service_explicit",
                consent_basis="explicit_consent",
                registered_body="வணக்கம் {#var#}, appointment update.",
            )
        )
        sms_service.update_sms_settings(
            session,
            tenant_id=TENANT,
            payload=SmsSettingsUpdate.model_validate(payload),
            actor=actor,
        )
        patient = Patient(
            tenant_id=TENANT,
            patient_number="P-PHASE3-LANGUAGE",
            full_name="Explicit Consent Required",
            mobile="+919876543210",
            sms_preferred_language="ta",
            sms_consent_status=SmsConsentStatus.NOT_RECORDED,
        )
        session.add(patient)
        session.commit()
        session.refresh(patient)
        event = _queue_event(
            session,
            patient_id=patient.id,
            values={"patient_name": patient.full_name},
        )

        sms_processor.process_due_sms_notifications(session, gateway=gateway)
        session.refresh(event)

        assert event.status == NotificationStatus.CANCELLED
        assert gateway.requests == []


def test_worker_cancels_when_the_flow_was_disabled_after_queueing(
    test_engine, monkeypatch
):
    _disable_entitlements(monkeypatch)
    gateway = FakeGateway(SmsSendResult(True, "accepted", "ok"))
    with Session(test_engine) as session:
        actor = _actor(session, "phase3.disabled@medizinhub.local")
        _configure(session, actor)
        event = _queue_event(session)

        payload = ready_settings_payload()
        payload["flows"][0]["enabled"] = False
        sms_service.update_sms_settings(
            session,
            tenant_id=TENANT,
            payload=SmsSettingsUpdate.model_validate(payload),
            actor=actor,
        )

        sms_processor.process_due_sms_notifications(session, gateway=gateway)
        session.refresh(event)

        assert event.status == NotificationStatus.CANCELLED
        assert gateway.requests == []


def test_worker_cancels_when_the_integration_is_disabled(test_engine, monkeypatch):
    _disable_entitlements(monkeypatch)
    gateway = FakeGateway(SmsSendResult(True, "accepted", "ok"))
    with Session(test_engine) as session:
        actor = _actor(session, "phase3.off@medizinhub.local")
        payload = ready_settings_payload()
        payload["enabled"] = False
        sms_service.update_sms_settings(
            session,
            tenant_id=TENANT,
            payload=SmsSettingsUpdate.model_validate(payload),
            actor=actor,
        )
        event = _queue_event(session)

        sms_processor.process_due_sms_notifications(session, gateway=gateway)
        session.refresh(event)

        assert event.status == NotificationStatus.CANCELLED
        assert gateway.requests == []


def test_worker_claims_each_row_once(test_engine, monkeypatch):
    _disable_entitlements(monkeypatch)
    gateway = FakeGateway(SmsSendResult(True, "accepted", "ok"))
    with Session(test_engine) as session:
        actor = _actor(session, "phase3.claim@medizinhub.local")
        _configure(session, actor)
        _queue_event(session)
        _queue_event(session)

        first = sms_processor.process_due_sms_notifications(session, gateway=gateway)
        second = sms_processor.process_due_sms_notifications(session, gateway=gateway)

        assert first == 2
        # Everything is already sent, so a second pass finds nothing to claim.
        assert second == 0
        assert len(gateway.requests) == 2


def test_worker_leaves_other_tenants_alone(test_engine, monkeypatch):
    _disable_entitlements(monkeypatch)
    gateway = FakeGateway(SmsSendResult(True, "accepted", "ok"))
    with Session(test_engine) as session:
        actor = _actor(session, "phase3.isolation@medizinhub.local")
        _configure(session, actor)
        mine = _queue_event(session)
        # Another tenant has no SMS configuration at all.
        theirs = _queue_event(session, tenant_id="tenant_unconfigured")

        sms_processor.process_due_sms_notifications(session, gateway=gateway, limit=10)
        session.refresh(mine)
        session.refresh(theirs)

        assert mine.status == NotificationStatus.SENT
        assert theirs.status == NotificationStatus.CANCELLED
        assert len(gateway.requests) == 1


# --------------------------------------------------------------------------
# Queue administration
# --------------------------------------------------------------------------


def test_queue_listing_masks_the_recipient_and_scopes_to_the_tenant(
    test_engine, monkeypatch
):
    _disable_entitlements(monkeypatch)
    with Session(test_engine) as session:
        _queue_event(session)
        _queue_event(session, tenant_id="tenant_other", recipient="+919000000000")

        listing = sms_queue_service.list_sms_queue(session, tenant_id=TENANT)

        assert listing.total == 1
        assert listing.items[0].recipient_masked == "••••3210"
        assert listing.counts.queued == 1


def test_retry_is_refused_for_an_operator_blocked_message(test_engine, monkeypatch):
    _disable_entitlements(monkeypatch)
    monkeypatch.setattr(sms_queue_service, "enforce_sms_limits", lambda *_a, **_k: None)
    with Session(test_engine) as session:
        actor = _actor(session, "phase3.blocked@medizinhub.local")
        _configure(session, actor)
        event = _queue_event(session)
        event.status = NotificationStatus.FAILED
        event.delivery_status = "blocked"
        session.add(event)
        session.commit()

        try:
            sms_queue_service.retry_sms_notification(
                session, tenant_id=TENANT, event_id=event.id, actor=actor
            )
            raise AssertionError("A DND-blocked SMS must not be retried")
        except Exception as exc:  # HTTPException
            assert getattr(exc, "status_code", None) == 409


def test_retry_clears_previous_delivery_state(test_engine, monkeypatch):
    _disable_entitlements(monkeypatch)
    monkeypatch.setattr(sms_queue_service, "enforce_sms_limits", lambda *_a, **_k: None)
    with Session(test_engine) as session:
        actor = _actor(session, "phase3.retryclear@medizinhub.local")
        _configure(session, actor)
        event = _queue_event(session)
        event.status = NotificationStatus.FAILED
        event.delivery_status = "undelivered"
        event.provider_message_id = "sms-old"
        event.failure_reason = "previous failure"
        event.attempt_count = 3
        session.add(event)
        session.commit()

        sms_queue_service.retry_sms_notification(
            session, tenant_id=TENANT, event_id=event.id, actor=actor
        )
        session.refresh(event)

        assert event.status == NotificationStatus.QUEUED
        assert event.attempt_count == 0
        assert event.delivery_status is None
        assert event.provider_message_id is None
        assert event.failure_reason is None


def test_a_processing_message_cannot_be_cancelled(test_engine, monkeypatch):
    _disable_entitlements(monkeypatch)
    with Session(test_engine) as session:
        actor = _actor(session, "phase3.cancel@medizinhub.local")
        event = _queue_event(session)
        event.processing_started_at = event.created_at
        session.add(event)
        session.commit()

        try:
            sms_queue_service.cancel_sms_notification(
                session, tenant_id=TENANT, event_id=event.id, actor=actor
            )
            raise AssertionError("An in-flight SMS must not be cancellable")
        except Exception as exc:
            assert getattr(exc, "status_code", None) == 409


def test_queue_operations_reject_another_tenants_id(test_engine, monkeypatch):
    _disable_entitlements(monkeypatch)
    with Session(test_engine) as session:
        actor = _actor(session, "phase3.crosstenant@medizinhub.local")
        event = _queue_event(session)

        try:
            sms_queue_service.cancel_sms_notification(
                session, tenant_id="tenant_other", event_id=event.id, actor=actor
            )
            raise AssertionError("Cross-tenant access must 404")
        except Exception as exc:
            assert getattr(exc, "status_code", None) == 404


# --------------------------------------------------------------------------
# Phase 4: scheduled appointment reminders
# --------------------------------------------------------------------------


def test_worker_sends_using_whichever_template_is_currently_enabled(
    test_engine, monkeypatch
):
    """Send-time resolution: switching the enabled template after a message
    is queued must send under the new template, not a stale pinned one."""
    _disable_entitlements(monkeypatch)
    gateway = FakeGateway(SmsSendResult(True, "accepted", "ok"))
    with Session(test_engine) as session:
        actor = _actor(session, "phase4b.switch@medizinhub.local")
        _configure(session, actor)
        event = _queue_event(session)

        payload = ready_settings_payload()
        payload["flows"][0]["enabled"] = False
        payload["flows"].append(
            _second_template_for("appointment_booked_patient", enabled=True)
        )
        sms_service.update_sms_settings(
            session,
            tenant_id=TENANT,
            payload=SmsSettingsUpdate.model_validate(payload),
            actor=actor,
        )

        sms_processor.process_due_sms_notifications(session, gateway=gateway)
        session.refresh(event)

        assert event.status == NotificationStatus.SENT
        assert event.template_external_id == "1707160000000099"
        sent_request, _kwargs = gateway.requests[0]
        assert sent_request.body == "Namaste Asha, appointment update."
