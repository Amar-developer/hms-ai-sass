import json
from datetime import date, datetime, time, timedelta, timezone
from decimal import Decimal
from types import SimpleNamespace
from urllib.parse import parse_qs, urlparse

import pytest
from sqlmodel import Session, select

from app.core.credentials import encrypt_credential
from app.modules.appointments.models import Appointment, AppointmentStatus
from app.modules.billing.models import CreditNote, Invoice, InvoiceItem, InvoiceStatus
from app.modules.consultations.models import Consultation
from app.modules.integrations.invoice_receipts import verify_invoice_receipt_signature
from app.modules.integrations import invoice_receipts
from app.modules.integrations.models import TenantIntegrationPlugin
from app.modules.files.models import FileDocument
from app.modules.integrations.whatsapp_field_catalog import default_field_order
from app.modules.integrations.whatsapp_gateway import WhatsAppGatewayResult
from app.modules.integrations.whatsapp_consent import patient_notification_language
from app.modules.integrations.whatsapp_templates import resolve_template_identifier
from app.modules.integrations.whatsapp_usage import read_whatsapp_usage
from app.modules.integrations.whatsapp_health import read_whatsapp_health
from app.modules.integrations import whatsapp_reminders
from app.modules.integrations import whatsapp_queue_service
from app.modules.identity.models import User
from app.modules.notifications.models import (
    NotificationEvent,
    NotificationEventType,
    NotificationProvider,
    NotificationStatus,
)
from app.modules.notifications.services import events
from app.modules.notifications import whatsapp_processor
from app.modules.patients.models import Patient, WhatsAppConsentStatus
from app.modules.patients.services.patient_service import PatientService
from app.modules.lab.models import LabOrder
from app.modules.practitioners.models import Practitioner
from app.modules.queue.models import QueueEntry, QueueEvent
from app.modules.queue.services import actions
from app.modules.subscriptions.models import SubscriptionPlan, TenantSubscription
from app.modules.tenants.models import Branch, Tenant


def _configured_tenant(session: Session):
    tenant = Tenant(name="Queue Test Clinic")
    session.add(tenant)
    session.commit()
    session.refresh(tenant)
    plan = SubscriptionPlan(
        key=f"queue_{tenant.id}",
        name="Queue Test Plan",
        monthly_patient_limit=1000,
        monthly_whatsapp_message_limit=1000,
        enabled_modules_json=json.dumps(["whatsapp"]),
    )
    session.add(plan)
    session.commit()
    session.refresh(plan)
    session.add(
        TenantSubscription(
            tenant_id=tenant.id,
            plan_id=plan.id,
            starts_on=date.today(),
        )
    )
    session.commit()
    branch = Branch(tenant_id=tenant.id, name="Main Branch", code="MAIN")
    patient = Patient(
        tenant_id=tenant.id,
        patient_number="P-QUEUE-1",
        full_name="Queue Patient",
        mobile="98765 43210",
    )
    session.add(branch)
    session.add(patient)
    session.commit()
    session.refresh(branch)
    session.refresh(patient)
    appointment = Appointment(
        tenant_id=tenant.id,
        branch_id=branch.id,
        patient_id=patient.id,
        appointment_date=date(2026, 7, 25),
        appointment_time=time(10, 30),
    )
    config = {
        "api_url": "https://gateway.example.com/messages",
        "public_media_base_url": "https://api.example.com",
        "appointment_view_url": "https://app.example.com/appointments",
        "default_country_code": "+91",
        "timeout_seconds": 15,
        "max_attempts": 3,
        "patient_notifications_enabled": True,
        "doctor_notifications_enabled": True,
        "templates": {
            "appointment_booked_patient": "patient_booking",
            "appointment_booked_doctor": "doctor_booking",
            "invoice_paid_patient": "invoice_paid",
            "payment_pending_patient": "payment_pending",
            "appointment_cancelled_patient": "appointment_cancelled_patient",
            "appointment_cancelled_doctor": "appointment_cancelled_doctor",
            "invoice_refunded_patient": "invoice_refunded_patient",
            "lab_report_ready_patient": "lab_report_ready_patient",
            "prescription_ready_patient": "prescription_ready_patient",
            "follow_up_advice_patient": "follow_up_advice_patient",
        },
        "flows": {
            "appointment_booked_patient": True,
            "appointment_booked_doctor": True,
            "invoice_paid_patient": True,
            "payment_pending_patient": True,
            "appointment_cancelled_patient": True,
            "appointment_cancelled_doctor": True,
            "invoice_refunded_patient": True,
            "lab_report_ready_patient": True,
            "prescription_ready_patient": True,
            "follow_up_advice_patient": True,
        },
    }
    integration = TenantIntegrationPlugin(
        tenant_id=tenant.id,
        plugin_key="whatsapp",
        enabled=True,
        config_json=json.dumps(config),
        secret_ciphertext=encrypt_credential("queue-secret-key"),
        secret_last_four="-key",
    )
    session.add(appointment)
    session.add(integration)
    session.commit()
    session.refresh(appointment)
    return tenant, branch, patient, appointment


def test_doctor_booking_template_uses_six_approved_values(test_engine):
    with Session(test_engine) as session:
        tenant, _branch, _patient, appointment = _configured_tenant(session)
        practitioner = Practitioner(
            tenant_id=tenant.id,
            full_name="Queue Doctor",
            mobile="91234 56789",
        )
        session.add(practitioner)
        session.commit()
        session.refresh(practitioner)
        appointment.practitioner_id = practitioner.id
        session.add(appointment)
        session.commit()

        event = NotificationEvent(
            tenant_id=tenant.id,
            provider=NotificationProvider.WHATSAPP,
            event_type=NotificationEventType.PATIENT_MESSAGE,
            recipient=practitioner.mobile,
            message="Template notification",
            template_key="appointment_booked_doctor",
            resource_type="appointment",
            resource_id=appointment.id,
        )
        recipient_name, context, media_url, media_name, _language = (
            whatsapp_processor._message_context(
                session,
                event,
                {"appointment_view_url": "https://app.example.com/appointments"},
            )
        )

        assert recipient_name == "Queue Doctor"
        approved = {
            "recipient_name": "Queue Doctor",
            "appointment_status": "booked",
            "appointment_id": appointment.id,
            "appointment_date": "25 July 2026",
            "appointment_time": "10:30 AM",
            "appointment_view_url": "https://app.example.com/appointments",
        }
        assert approved.items() <= context.items()
        # The context also carries every module field this flow exposes (so a
        # template can later pick, say, the doctor's specialty), but what the
        # flow *sends* is still only the six approved values above.
        assert default_field_order("appointment_booked_doctor") == list(approved)
        assert [context[field] for field in approved] == list(approved.values())
        assert media_url is None
        assert media_name is None


def test_queue_deduplicates_and_processor_sends_template(test_engine, monkeypatch):
    monkeypatch.setattr(
        events, "enforce_module_enabled", lambda _session, _tenant, _module: None
    )
    monkeypatch.setattr(
        whatsapp_processor,
        "enforce_module_enabled",
        lambda _session, _tenant, _module: None,
    )
    captured = {}

    class FakeGateway:
        def send_template(self, **kwargs):
            captured.update(kwargs)
            return WhatsAppGatewayResult(
                True, "sent", "Message sent.", 200, "provider-message-1"
            )

    with Session(test_engine) as session:
        tenant, branch, patient, appointment = _configured_tenant(session)
        patient.mobile = "invalid-primary"
        patient.alternate_mobile = "98765 43210"
        patient.whatsapp_preferred_language = "ta"
        integration = session.exec(
            select(TenantIntegrationPlugin).where(
                TenantIntegrationPlugin.tenant_id == tenant.id,
                TenantIntegrationPlugin.plugin_key == "whatsapp",
            )
        ).one()
        config = json.loads(integration.config_json)
        config["default_language"] = "en"
        config["localized_templates"] = {
            "ta": {"appointment_booked_patient": "patient_booking_ta"}
        }
        integration.config_json = json.dumps(config)
        session.add(patient)
        session.add(integration)
        session.commit()
        first = events.queue_whatsapp_template_if_allowed(
            session,
            tenant_id=tenant.id,
            branch_id=branch.id,
            flow_key="appointment_booked_patient",
            recipient=patient.mobile,
            resource_type="appointment",
            resource_id=appointment.id,
            dedupe_key=f"whatsapp:appointment:{appointment.id}:patient",
        )
        second = events.queue_whatsapp_template_if_allowed(
            session,
            tenant_id=tenant.id,
            branch_id=branch.id,
            flow_key="appointment_booked_patient",
            recipient=patient.mobile,
            resource_type="appointment",
            resource_id=appointment.id,
            dedupe_key=f"whatsapp:appointment:{appointment.id}:patient",
        )

        assert first and second and first.id == second.id
        assert first.max_attempts == 3
        assert (
            whatsapp_processor.process_due_whatsapp_notifications(
                session, gateway=FakeGateway()
            )
            == 1
        )
        session.refresh(first)
        assert first.status == NotificationStatus.SENT
        assert first.attempt_count == 1
        assert first.provider_message_id == "provider-message-1"
        assert captured["api_key"] == "queue-secret-key"
        assert first.recipient == "+919876543210"
        assert captured["campaign_name"] == "patient_booking_ta"
        assert captured["destination"] == "+919876543210"
        assert captured["template_parameters"] == [
            "Queue Patient",
            "25 July 2026",
            "10:30 AM",
        ]


def test_missing_localized_identifier_falls_back_to_tenant_default():
    identifier, language = resolve_template_identifier(
        {
            "default_language": "en",
            "templates": {"invoice_paid_patient": "invoice_paid_en"},
            "localized_templates": {"hi": {}},
        },
        flow_key="invoice_paid_patient",
        preferred_language="hi",
    )

    assert identifier == "invoice_paid_en"
    assert language == "en"


def test_legacy_patient_default_resolves_to_english_identifier():
    patient = SimpleNamespace(whatsapp_preferred_language="tenant_default")
    identifier, language = resolve_template_identifier(
        {
            "default_language": "ta",
            "templates": {"invoice_paid_patient": "invoice_paid_ta"},
            "localized_templates": {"en": {"invoice_paid_patient": "invoice_paid_en"}},
        },
        flow_key="invoice_paid_patient",
        preferred_language=patient_notification_language(patient),
    )

    assert identifier == "invoice_paid_en"
    assert language == "en"


def test_monthly_plan_limit_blocks_new_rows_without_breaking_existing_dedupe(
    test_engine, monkeypatch
):
    monkeypatch.setattr(
        events, "enforce_module_enabled", lambda _session, _tenant, _module: None
    )
    with Session(test_engine) as session:
        tenant, branch, patient, appointment = _configured_tenant(session)
        subscription_plan = session.exec(
            select(SubscriptionPlan).where(SubscriptionPlan.key == f"queue_{tenant.id}")
        ).one()
        subscription_plan.monthly_whatsapp_message_limit = 1
        session.add(subscription_plan)
        session.commit()

        first = events.queue_whatsapp_template_if_allowed(
            session,
            tenant_id=tenant.id,
            branch_id=branch.id,
            flow_key="appointment_booked_patient",
            recipient=patient.mobile,
            resource_type="appointment",
            resource_id=appointment.id,
            dedupe_key="quota:first",
        )
        duplicate = events.queue_whatsapp_template_if_allowed(
            session,
            tenant_id=tenant.id,
            branch_id=branch.id,
            flow_key="appointment_booked_patient",
            recipient=patient.mobile,
            resource_type="appointment",
            resource_id=appointment.id,
            dedupe_key="quota:first",
        )
        blocked = events.queue_whatsapp_template_if_allowed(
            session,
            tenant_id=tenant.id,
            branch_id=branch.id,
            flow_key="appointment_booked_patient",
            recipient=patient.mobile,
            resource_type="appointment",
            resource_id=appointment.id,
            dedupe_key="quota:second",
        )

        assert first is not None
        assert duplicate and duplicate.id == first.id
        assert blocked is None
        usage = read_whatsapp_usage(session, tenant_id=tenant.id)
        assert usage.monthly_limit == 1
        assert usage.used == 1
        assert usage.remaining == 0
        assert usage.limit_reached is True


def test_operational_health_detects_failures_backlog_and_stuck_jobs(test_engine):
    now = datetime(2026, 7, 24, 12, 0, tzinfo=timezone.utc)
    with Session(test_engine) as session:
        tenant, _branch, _patient, _appointment = _configured_tenant(session)
        for index in range(2):
            session.add(
                NotificationEvent(
                    tenant_id=tenant.id,
                    provider=NotificationProvider.WHATSAPP,
                    event_type=NotificationEventType.PATIENT_MESSAGE,
                    status=NotificationStatus.SENT,
                    recipient=f"+91900000000{index}",
                    message="Sent",
                    template_key="appointment_booked_patient",
                    created_at=now - timedelta(hours=1),
                    updated_at=now - timedelta(hours=1),
                    sent_at=now - timedelta(hours=1),
                )
            )
        for index in range(3):
            session.add(
                NotificationEvent(
                    tenant_id=tenant.id,
                    provider=NotificationProvider.WHATSAPP,
                    event_type=NotificationEventType.PATIENT_MESSAGE,
                    status=NotificationStatus.FAILED,
                    recipient=f"+91910000000{index}",
                    message="Failed",
                    template_key="appointment_booked_patient",
                    created_at=now - timedelta(hours=2),
                    updated_at=now - timedelta(hours=2),
                )
            )
        session.add(
            NotificationEvent(
                tenant_id=tenant.id,
                provider=NotificationProvider.WHATSAPP,
                event_type=NotificationEventType.PATIENT_MESSAGE,
                status=NotificationStatus.QUEUED,
                recipient="+919200000001",
                message="Queued",
                template_key="appointment_booked_patient",
                created_at=now - timedelta(minutes=70),
                updated_at=now - timedelta(minutes=70),
            )
        )
        session.add(
            NotificationEvent(
                tenant_id=tenant.id,
                provider=NotificationProvider.WHATSAPP,
                event_type=NotificationEventType.PATIENT_MESSAGE,
                status=NotificationStatus.QUEUED,
                recipient="+919200000002",
                message="Processing",
                template_key="appointment_booked_patient",
                created_at=now - timedelta(minutes=20),
                updated_at=now - timedelta(minutes=20),
                processing_started_at=now - timedelta(minutes=10),
                attempt_count=1,
            )
        )
        session.commit()

        health = read_whatsapp_health(session, tenant_id=tenant.id, now=now)

        assert health.status == "critical"
        assert health.sent_24h == 2
        assert health.failed_24h == 3
        assert health.failure_rate_24h == 60
        assert health.queued == 1
        assert health.retry_pending == 1
        assert health.stuck_processing == 1
        assert health.oldest_queued_age_minutes == 70
        assert len(health.alerts) == 3


def test_unexpected_worker_error_is_safely_retried(test_engine, monkeypatch):
    monkeypatch.setattr(
        events, "enforce_module_enabled", lambda _session, _tenant, _module: None
    )
    monkeypatch.setattr(
        whatsapp_processor,
        "enforce_module_enabled",
        lambda _session, _tenant, _module: None,
    )

    class UnexpectedGateway:
        def send_template(self, **_kwargs):
            raise RuntimeError("sensitive internal failure")

    with Session(test_engine) as session:
        tenant, branch, patient, appointment = _configured_tenant(session)
        event = events.queue_whatsapp_template_if_allowed(
            session,
            tenant_id=tenant.id,
            branch_id=branch.id,
            flow_key="appointment_booked_patient",
            recipient=patient.mobile,
            resource_type="appointment",
            resource_id=appointment.id,
            dedupe_key="hardening:unexpected-error",
        )
        assert event

        processed = whatsapp_processor.process_due_whatsapp_notifications(
            session, gateway=UnexpectedGateway()
        )
        session.refresh(event)

        assert processed == 1
        assert event.status == NotificationStatus.QUEUED
        assert event.attempt_count == 1
        assert event.processing_started_at is None
        assert event.failure_reason == "An unexpected delivery error occurred."


def test_processor_retries_temporary_failure_without_duplicate_row(
    test_engine, monkeypatch
):
    monkeypatch.setattr(
        events, "enforce_module_enabled", lambda _session, _tenant, _module: None
    )
    monkeypatch.setattr(
        whatsapp_processor,
        "enforce_module_enabled",
        lambda _session, _tenant, _module: None,
    )

    class FailingGateway:
        def send_template(self, **_kwargs):
            return WhatsAppGatewayResult(
                False, "service_unavailable", "Temporarily unavailable.", 503
            )

    with Session(test_engine) as session:
        tenant, branch, patient, appointment = _configured_tenant(session)
        event = events.queue_whatsapp_template_if_allowed(
            session,
            tenant_id=tenant.id,
            branch_id=branch.id,
            flow_key="appointment_booked_patient",
            recipient=patient.mobile,
            resource_type="appointment",
            resource_id=appointment.id,
            dedupe_key=f"whatsapp:appointment:{appointment.id}:patient",
        )
        assert event
        original_due = event.next_attempt_at

        whatsapp_processor.process_due_whatsapp_notifications(
            session, gateway=FailingGateway()
        )
        session.refresh(event)
        assert event.status == NotificationStatus.QUEUED
        assert event.attempt_count == 1
        assert event.next_attempt_at > original_due
        assert session.exec(select(NotificationEvent)).all() == [event]


def test_paid_invoice_job_serves_signed_stored_printed_receipt(
    test_engine, monkeypatch, tmp_path
):
    monkeypatch.setattr(
        events, "enforce_module_enabled", lambda _session, _tenant, _module: None
    )
    monkeypatch.setattr(
        whatsapp_processor,
        "enforce_module_enabled",
        lambda _session, _tenant, _module: None,
    )
    captured = {}

    class FakeGateway:
        def send_template(self, **kwargs):
            captured.update(kwargs)
            return WhatsAppGatewayResult(True, "sent", "Message sent.", 200)

    with Session(test_engine) as session:
        tenant, branch, patient, _appointment = _configured_tenant(session)
        invoice = Invoice(
            tenant_id=tenant.id,
            branch_id=branch.id,
            patient_id=patient.id,
            invoice_number="INV-QUEUE-1",
            status=InvoiceStatus.PAID,
            subtotal_amount=Decimal("1000"),
            total_amount=Decimal("1000"),
            paid_amount=Decimal("1000"),
            balance_amount=Decimal("0"),
        )
        session.add(invoice)
        session.commit()
        session.refresh(invoice)
        session.add(
            InvoiceItem(
                tenant_id=tenant.id,
                invoice_id=invoice.id,
                description="Consultation",
                quantity=1,
                unit_amount=Decimal("1000"),
                total_amount=Decimal("1000"),
            )
        )
        printed_pdf = b"%PDF-1.4\nprinted invoice layout\n%%EOF"
        (tmp_path / "printed-invoice.pdf").write_bytes(printed_pdf)
        monkeypatch.setattr(invoice_receipts, "UPLOADS_DIR", tmp_path)
        artifact = FileDocument(
            tenant_id=tenant.id,
            branch_id=branch.id,
            patient_id=patient.id,
            file_name="Queue-Patient-INV-QUEUE-1.pdf",
            file_url="/uploads/printed-invoice.pdf",
            content_type="application/pdf",
            artifact_type="final",
            document_version=1,
            is_private=True,
            category="invoice",
            source_module="billing",
            attached_to_doctype="Invoice",
            attached_to_name=invoice.id,
            attached_to_field="invoice_pdf",
        )
        session.add(artifact)
        session.commit()
        session.refresh(artifact)
        event = events.queue_whatsapp_template_if_allowed(
            session,
            tenant_id=tenant.id,
            branch_id=branch.id,
            flow_key="invoice_paid_patient",
            recipient=patient.mobile,
            resource_type="invoice",
            resource_id=invoice.id,
            dedupe_key=f"whatsapp:invoice:{invoice.id}:paid",
            artifact_file_id=artifact.id,
            artifact_version=artifact.document_version,
        )
        assert event

        whatsapp_processor.process_due_whatsapp_notifications(
            session, gateway=FakeGateway()
        )

        assert captured["media_filename"] == "invoice-INV-QUEUE-1.pdf"
        parsed = urlparse(captured["media_url"])
        query = parse_qs(parsed.query)
        assert parsed.netloc == "api.example.com"
        assert parsed.path.endswith(f"/{invoice.id}.pdf")
        assert query["file_id"] == [artifact.id]
        verify_invoice_receipt_signature(
            tenant_id=tenant.id,
            invoice_id=invoice.id,
            file_id=artifact.id,
            expires=int(query["expires"][0]),
            signature=query["signature"][0],
        )
        rendered, filename = invoice_receipts.render_invoice_receipt_pdf(
            session,
            tenant_id=tenant.id,
            invoice_id=invoice.id,
            file_id=artifact.id,
        )
        assert rendered == printed_pdf
        assert filename == "Queue-Patient-INV-QUEUE-1.pdf"


def test_s3_invoice_media_verifies_pdf_then_uses_signed_receipt_url(
    test_engine, monkeypatch
):
    calls = []

    class FakeStorage:
        def head(self, *, key):
            calls.append(("head", key))
            return SimpleNamespace(size=2048, content_type="application/pdf")

        def create_download_url(self, *, key, expires_in):
            # A raw S3 presigned URL is short-lived and WhatsApp providers
            # fetch media asynchronously, so this path must not be used for
            # WhatsApp delivery — only the app's own signed receipt endpoint.
            calls.append(("url", key, expires_in))
            return "https://documents.example.com/invoice.pdf?signature=test"

    with Session(test_engine) as session:
        tenant, branch, patient, _appointment = _configured_tenant(session)
        invoice = Invoice(
            tenant_id=tenant.id,
            branch_id=branch.id,
            patient_id=patient.id,
            invoice_number="INV-S3-1",
            status=InvoiceStatus.PAID,
            total_amount=Decimal("500"),
            paid_amount=Decimal("500"),
            balance_amount=Decimal("0"),
        )
        session.add(invoice)
        session.commit()
        session.refresh(invoice)
        artifact = FileDocument(
            tenant_id=tenant.id,
            branch_id=branch.id,
            patient_id=patient.id,
            file_name="invoice.pdf",
            file_url=f"/api/v1/files/{invoice.id}/download",
            content_type="application/pdf",
            storage_backend="s3",
            storage_key=f"invoices/{invoice.id}.pdf",
            storage_bucket="test-documents",
            document_status="ready",
            artifact_type="final",
            document_version=1,
            attached_to_doctype="Invoice",
            attached_to_name=invoice.id,
            attached_to_field="invoice_pdf",
        )
        session.add(artifact)
        session.commit()
        session.refresh(artifact)
        monkeypatch.setattr(
            whatsapp_processor,
            "get_storage_backend_for_document",
            lambda _row: FakeStorage(),
        )

        url, filename = whatsapp_processor._invoice_media(
            session,
            invoice,
            "https://api.example.com",
            artifact_file_id=artifact.id,
            artifact_version=1,
        )

        assert url.startswith(
            "https://api.example.com/api/v1/communications/public/invoice-receipts/"
        )
        assert filename == "invoice-INV-S3-1.pdf"
        assert calls == [("head", artifact.storage_key)]


def test_s3_invoice_media_preparation_failure_is_retryable(test_engine, monkeypatch):
    class UnavailableStorage:
        def head(self, *, key):
            raise RuntimeError(f"S3 unavailable for {key}")

    with Session(test_engine) as session:
        tenant, branch, patient, _appointment = _configured_tenant(session)
        invoice = Invoice(
            tenant_id=tenant.id,
            branch_id=branch.id,
            patient_id=patient.id,
            invoice_number="INV-S3-RETRY",
            status=InvoiceStatus.PAID,
            total_amount=Decimal("500"),
            paid_amount=Decimal("500"),
            balance_amount=Decimal("0"),
        )
        session.add(invoice)
        session.commit()
        session.refresh(invoice)
        artifact = FileDocument(
            tenant_id=tenant.id,
            branch_id=branch.id,
            patient_id=patient.id,
            file_name="invoice.pdf",
            file_url=f"/api/v1/files/{invoice.id}/download",
            content_type="application/pdf",
            storage_backend="s3",
            storage_key=f"invoices/{invoice.id}.pdf",
            storage_bucket="test-documents",
            document_status="ready",
            artifact_type="final",
            document_version=1,
            attached_to_doctype="Invoice",
            attached_to_name=invoice.id,
            attached_to_field="invoice_pdf",
        )
        session.add(artifact)
        session.commit()
        session.refresh(artifact)
        monkeypatch.setattr(
            whatsapp_processor,
            "get_storage_backend_for_document",
            lambda _row: UnavailableStorage(),
        )

        with pytest.raises(whatsapp_processor.NotificationRetryable):
            whatsapp_processor._invoice_media(
                session,
                invoice,
                "https://api.example.com",
                artifact_file_id=artifact.id,
                artifact_version=1,
            )


def test_queue_management_masks_recipient_and_supports_cancel_retry(
    test_engine, monkeypatch
):
    monkeypatch.setattr(
        events, "enforce_module_enabled", lambda _session, _tenant, _module: None
    )
    monkeypatch.setattr(
        whatsapp_queue_service,
        "enforce_module_enabled",
        lambda _session, _tenant, _module: None,
    )
    monkeypatch.setattr(
        "app.modules.patients.services.patient_service.enforce_entitlement",
        lambda _session, _tenant, _module: None,
    )
    with Session(test_engine) as session:
        tenant, branch, patient, appointment = _configured_tenant(session)
        actor = User(
            tenant_id=tenant.id,
            name="Queue Administrator",
            email="queue-administrator@example.com",
            user_type="tenant_admin",
        )
        session.add(actor)
        session.commit()
        session.refresh(actor)
        event = events.queue_whatsapp_template_if_allowed(
            session,
            tenant_id=tenant.id,
            branch_id=branch.id,
            flow_key="appointment_booked_patient",
            recipient=patient.mobile,
            resource_type="appointment",
            resource_id=appointment.id,
            dedupe_key=f"whatsapp:appointment:{appointment.id}:patient",
        )
        assert event

        listed = whatsapp_queue_service.list_whatsapp_queue(
            session,
            tenant_id=tenant.id,
            q="Queue Patient",
        )

        assert listed.total == 1
        assert listed.counts.queued == 1
        assert listed.items[0].recipient_name == "Queue Patient"
        assert listed.items[0].recipient_masked == "••••3210"
        assert "98765 43210" not in listed.model_dump_json()

        cancelled = whatsapp_queue_service.cancel_whatsapp_notification(
            session,
            tenant_id=tenant.id,
            event_id=event.id,
            actor=actor,
        )
        assert cancelled.status == "cancelled"
        retried = whatsapp_queue_service.retry_whatsapp_notification(
            session,
            tenant_id=tenant.id,
            event_id=event.id,
            actor=actor,
        )
        assert retried.status == "queued"
        assert retried.attempt_count == 0


def test_delivery_queue_includes_today_message_summary(test_engine, monkeypatch):
    monkeypatch.setattr(
        whatsapp_queue_service,
        "enforce_module_enabled",
        lambda _session, _tenant, _module: None,
    )
    monkeypatch.setattr(
        "app.modules.patients.services.patient_service.enforce_entitlement",
        lambda _session, _tenant, _module: None,
    )
    with Session(test_engine) as session:
        tenant, branch, patient, appointment = _configured_tenant(session)
        now = datetime.now(timezone.utc)
        yesterday = now - timedelta(days=1)
        session.add_all(
            [
                NotificationEvent(
                    tenant_id=tenant.id,
                    branch_id=branch.id,
                    provider=NotificationProvider.WHATSAPP,
                    event_type=NotificationEventType.PATIENT_MESSAGE,
                    status=NotificationStatus.SENT,
                    recipient=patient.mobile,
                    message="Sent today",
                    template_key="appointment_booked_patient",
                    resource_type="appointment",
                    resource_id=appointment.id,
                    sent_at=now,
                    updated_at=now,
                ),
                NotificationEvent(
                    tenant_id=tenant.id,
                    branch_id=branch.id,
                    provider=NotificationProvider.WHATSAPP,
                    event_type=NotificationEventType.PATIENT_MESSAGE,
                    status=NotificationStatus.SENT,
                    recipient=patient.mobile,
                    message="Second sent today",
                    template_key="invoice_paid_patient",
                    resource_type="appointment",
                    resource_id=appointment.id,
                    sent_at=now,
                    updated_at=now,
                ),
                NotificationEvent(
                    tenant_id=tenant.id,
                    branch_id=branch.id,
                    provider=NotificationProvider.WHATSAPP,
                    event_type=NotificationEventType.PATIENT_MESSAGE,
                    status=NotificationStatus.FAILED,
                    recipient=patient.mobile,
                    message="Failed today",
                    template_key="invoice_paid_patient",
                    resource_type="appointment",
                    resource_id=appointment.id,
                    updated_at=now,
                ),
                NotificationEvent(
                    tenant_id=tenant.id,
                    branch_id=branch.id,
                    provider=NotificationProvider.WHATSAPP,
                    event_type=NotificationEventType.PATIENT_MESSAGE,
                    status=NotificationStatus.SENT,
                    recipient="919999999999",
                    message="Sent yesterday",
                    template_key="invoice_paid_patient",
                    resource_type="appointment",
                    resource_id=appointment.id,
                    sent_at=yesterday,
                    updated_at=yesterday,
                ),
            ]
        )
        session.commit()

        listed = whatsapp_queue_service.list_whatsapp_queue(
            session, tenant_id=tenant.id
        )

        assert listed.today.sent == 2
        assert listed.today.failed == 1
        assert listed.today.patient_recipients == 1


def test_patient_communications_include_all_patient_whatsapp_templates(
    test_engine, monkeypatch
):
    monkeypatch.setattr(
        whatsapp_queue_service,
        "enforce_module_enabled",
        lambda _session, _tenant, _module: None,
    )
    monkeypatch.setattr(
        "app.modules.patients.services.patient_service.enforce_entitlement",
        lambda _session, _tenant, _module: None,
    )
    with Session(test_engine) as session:
        tenant, branch, patient, appointment = _configured_tenant(session)
        now = datetime.now(timezone.utc)
        invoice = Invoice(
            tenant_id=tenant.id,
            branch_id=branch.id,
            patient_id=patient.id,
            invoice_number="MHB-INV-001",
            total_amount=500,
            payable_amount=500,
            balance_amount=0,
            status=InvoiceStatus.PAID,
        )
        session.add(invoice)
        other_patient = Patient(
            tenant_id=tenant.id,
            branch_id=branch.id,
            patient_number="PAT-OTHER",
            full_name="Other Patient",
            mobile="919999993456",
        )
        session.add(other_patient)
        session.flush()
        other_invoice = Invoice(
            tenant_id=tenant.id,
            branch_id=branch.id,
            patient_id=other_patient.id,
            invoice_number="MHB-INV-OTHER",
            total_amount=700,
            payable_amount=700,
            balance_amount=0,
            status=InvoiceStatus.PAID,
        )
        session.add(other_invoice)
        session.flush()
        session.add_all(
            [
                NotificationEvent(
                    tenant_id=tenant.id,
                    branch_id=branch.id,
                    provider=NotificationProvider.WHATSAPP,
                    event_type=NotificationEventType.PATIENT_MESSAGE,
                    status=NotificationStatus.SENT,
                    recipient=patient.mobile,
                    message="Invoice sent",
                    template_key="invoice_paid_patient",
                    resource_type="invoice",
                    resource_id=invoice.id,
                    sent_at=now,
                    updated_at=now,
                ),
                NotificationEvent(
                    tenant_id=tenant.id,
                    branch_id=branch.id,
                    provider=NotificationProvider.WHATSAPP,
                    event_type=NotificationEventType.PATIENT_MESSAGE,
                    status=NotificationStatus.SENT,
                    recipient=patient.mobile,
                    message="Appointment sent",
                    template_key="appointment_booked_patient",
                    resource_type="appointment",
                    resource_id=appointment.id,
                    sent_at=now,
                    updated_at=now,
                ),
                NotificationEvent(
                    tenant_id=tenant.id,
                    branch_id=branch.id,
                    provider=NotificationProvider.WHATSAPP,
                    event_type=NotificationEventType.PATIENT_MESSAGE,
                    status=NotificationStatus.SENT,
                    recipient=other_patient.mobile,
                    message="Other invoice sent",
                    template_key="invoice_paid_patient",
                    resource_type="invoice",
                    resource_id=other_invoice.id,
                    sent_at=now,
                    updated_at=now,
                ),
            ]
        )
        session.commit()

        rows = PatientService(session).patient_communications(
            tenant_id=tenant.id, patient_id=patient.id
        )

        assert {row.template_key for row in rows} >= {
            "invoice_paid_patient",
            "appointment_booked_patient",
        }
        assert all(row.recipient_masked == "••••3210" for row in rows)
        assert all(row.resource_id != other_invoice.id for row in rows)


def test_phase_seven_flows_resolve_authoritative_template_values(
    test_engine, monkeypatch
):
    monkeypatch.setattr(
        events, "enforce_module_enabled", lambda _session, _tenant, _module: None
    )
    monkeypatch.setattr(
        whatsapp_processor,
        "enforce_module_enabled",
        lambda _session, _tenant, _module: None,
    )
    deliveries = {}

    class FakeGateway:
        def send_template(self, **kwargs):
            deliveries[kwargs["campaign_name"]] = kwargs["template_parameters"]
            return WhatsAppGatewayResult(True, "sent", "Message sent.", 200)

    with Session(test_engine) as session:
        tenant, branch, patient, appointment = _configured_tenant(session)
        practitioner = Practitioner(
            tenant_id=tenant.id,
            full_name="Queue Doctor",
            mobile="91234 56789",
        )
        session.add(practitioner)
        session.commit()
        session.refresh(practitioner)
        appointment.practitioner_id = practitioner.id
        appointment.status = AppointmentStatus.CANCELLED
        session.add(appointment)
        entry = QueueEntry(
            tenant_id=tenant.id,
            branch_id=branch.id,
            appointment_id=appointment.id,
            patient_id=patient.id,
            token_number="N-007",
            status=AppointmentStatus.CALLED,
        )
        session.add(entry)
        session.commit()
        session.refresh(entry)
        session.add(
            QueueEvent(
                tenant_id=tenant.id,
                branch_id=branch.id,
                queue_entry_id=entry.id,
                appointment_id=appointment.id,
                action="appointment.cancelled",
                to_status=AppointmentStatus.CANCELLED,
                reason="Doctor unavailable",
            )
        )
        invoice = Invoice(
            tenant_id=tenant.id,
            branch_id=branch.id,
            patient_id=patient.id,
            invoice_number="INV-REFUND-1",
            status=InvoiceStatus.PARTIALLY_REFUNDED,
            total_amount=Decimal("1000"),
            paid_amount=Decimal("500"),
            balance_amount=Decimal("0"),
        )
        session.add(invoice)
        lab_order = LabOrder(
            tenant_id=tenant.id,
            branch_id=branch.id,
            patient_id=patient.id,
            lab_order_number="LAB-007",
            tests="Complete blood count",
        )
        session.add(lab_order)
        session.commit()
        session.refresh(lab_order)
        session.add(
            FileDocument(
                tenant_id=tenant.id,
                branch_id=branch.id,
                patient_id=patient.id,
                file_name="lab-report.pdf",
                file_url="https://files.example.com/lab-report.pdf",
                category="lab_report",
                source_module="lab",
                attached_to_doctype="LabOrder",
                attached_to_name=lab_order.id,
                attached_to_field="report_url",
                attached_to_label="Lab Report",
                document_status="ready",
                is_active=True,
            )
        )
        consultation = Consultation(
            tenant_id=tenant.id,
            branch_id=branch.id,
            appointment_id=appointment.id,
            patient_id=patient.id,
            practitioner_id=practitioner.id,
            prescription_text="Medication prescribed",
            follow_up_advice="Return after seven days",
        )
        session.add(consultation)
        session.commit()
        session.refresh(invoice)
        session.refresh(lab_order)
        session.refresh(consultation)
        credit = CreditNote(
            tenant_id=tenant.id,
            branch_id=branch.id,
            invoice_id=invoice.id,
            credit_note_number="CN-007",
            amount=Decimal("500"),
            reason="Partial refund",
        )
        session.add(credit)
        session.commit()

        flow_resources = [
            (
                "appointment_cancelled_patient",
                patient.mobile,
                "appointment",
                appointment.id,
            ),
            (
                "appointment_cancelled_doctor",
                practitioner.mobile,
                "appointment",
                appointment.id,
            ),
            ("invoice_refunded_patient", patient.mobile, "credit_note", credit.id),
            ("lab_report_ready_patient", patient.mobile, "lab_order", lab_order.id),
            (
                "prescription_ready_patient",
                patient.mobile,
                "consultation",
                consultation.id,
            ),
            (
                "follow_up_advice_patient",
                patient.mobile,
                "consultation",
                consultation.id,
            ),
        ]
        for index, (flow, recipient, resource_type, resource_id) in enumerate(
            flow_resources
        ):
            assert events.queue_whatsapp_template_if_allowed(
                session,
                tenant_id=tenant.id,
                branch_id=branch.id,
                flow_key=flow,
                recipient=recipient,
                resource_type=resource_type,
                resource_id=resource_id,
                dedupe_key=f"phase-seven:{index}",
            )

        assert (
            whatsapp_processor.process_due_whatsapp_notifications(
                session, limit=10, gateway=FakeGateway()
            )
            == 6
        )
        assert deliveries["appointment_cancelled_patient"][-1] == "Doctor unavailable"
        assert deliveries["appointment_cancelled_doctor"][0] == "Queue Doctor"
        assert deliveries["invoice_refunded_patient"] == [
            "Queue Patient",
            "INV-REFUND-1",
            "500",
        ]
        assert deliveries["lab_report_ready_patient"] == [
            "Queue Patient",
            "Complete blood count",
            tenant.name,
            lab_order.created_at.strftime("%d %B %Y"),
        ]
        assert deliveries["prescription_ready_patient"][2] == "Queue Doctor"
        assert deliveries["follow_up_advice_patient"] == [
            "Queue Patient",
            "Return after seven days",
        ]


class _CancellationFakeSession:
    def __init__(self, patient, practitioner):
        self.patient = patient
        self.practitioner = practitioner

    def get(self, model, _row_id):
        if model is Patient:
            return self.patient
        if model is Practitioner:
            return self.practitioner
        return None


def test_cancellation_queues_patient_and_doctor_templates(monkeypatch):
    appointment = SimpleNamespace(
        id="appointment-1",
        patient_id="patient-1",
        practitioner_id="practitioner-1",
    )
    entry = SimpleNamespace(
        id="queue-1",
        branch_id="branch-1",
        token_number="N-001",
    )
    patient = SimpleNamespace(mobile="9876543210")
    practitioner = SimpleNamespace(mobile="9123456789")
    actor = SimpleNamespace(id="user-1")
    queued = []
    monkeypatch.setattr(
        actions,
        "authorize_entry",
        lambda *_args, **_kwargs: (entry, appointment),
    )
    monkeypatch.setattr(actions, "sync_transition", lambda *_args, **_kwargs: entry)
    monkeypatch.setattr(
        actions, "notify_appointment_status", lambda *_args, **_kwargs: None
    )
    monkeypatch.setattr(
        actions,
        "queue_whatsapp_template_if_allowed",
        lambda *_args, **kwargs: queued.append(kwargs),
    )

    actions.cancel(
        _CancellationFakeSession(patient, practitioner),
        tenant_id="tenant-1",
        entry_id=entry.id,
        reason="Doctor unavailable",
        actor_user_id=actor.id,
        actor=actor,
    )

    assert [item["flow_key"] for item in queued] == [
        "appointment_cancelled_patient",
        "appointment_cancelled_doctor",
    ]
    assert [item["recipient"] for item in queued] == [
        "9876543210",
        "9123456789",
    ]


def test_scheduler_queues_due_reminder_once_and_skips_cancelled(
    test_engine, monkeypatch
):
    monkeypatch.setattr(
        events, "enforce_module_enabled", lambda _session, _tenant, _module: None
    )
    monkeypatch.setattr(
        whatsapp_processor,
        "enforce_module_enabled",
        lambda _session, _tenant, _module: None,
    )
    captured = {}

    class FakeGateway:
        def send_template(self, **kwargs):
            captured.update(kwargs)
            return WhatsAppGatewayResult(True, "sent", "Message sent.", 200)

    with Session(test_engine) as session:
        tenant, _branch, _patient, appointment = _configured_tenant(session)
        integration = session.exec(
            select(TenantIntegrationPlugin).where(
                TenantIntegrationPlugin.tenant_id == tenant.id,
                TenantIntegrationPlugin.plugin_key == "whatsapp",
            )
        ).one()
        config = json.loads(integration.config_json)
        config["templates"]["appointment_reminder_patient"] = (
            "appointment_reminder_patient"
        )
        config["flows"]["appointment_reminder_patient"] = True
        config["appointment_reminder_24h_enabled"] = True
        config["appointment_reminder_2h_enabled"] = True
        integration.config_json = json.dumps(config)
        session.add(integration)
        session.commit()

        reminder_time = datetime(2026, 7, 24, 5, 0, tzinfo=timezone.utc)
        assert (
            whatsapp_reminders.queue_due_whatsapp_appointment_reminders(
                session, now=reminder_time
            )
            == 1
        )
        assert (
            whatsapp_reminders.queue_due_whatsapp_appointment_reminders(
                session, now=reminder_time
            )
            == 0
        )
        assert (
            whatsapp_processor.process_due_whatsapp_notifications(
                session, limit=5, gateway=FakeGateway()
            )
            == 1
        )
        assert captured["campaign_name"] == "appointment_reminder_patient"
        assert captured["template_parameters"] == [
            "Queue Patient",
            "25 July 2026",
            "10:30 AM",
        ]

        appointment.status = AppointmentStatus.CANCELLED
        session.add(appointment)
        session.commit()
        two_hour_time = datetime(2026, 7, 25, 3, 0, tzinfo=timezone.utc)
        assert (
            whatsapp_reminders.queue_due_whatsapp_appointment_reminders(
                session, now=two_hour_time
            )
            == 0
        )


def test_patient_opt_out_blocks_patient_flows_but_not_doctor_flows(
    test_engine, monkeypatch
):
    monkeypatch.setattr(
        events, "enforce_module_enabled", lambda _session, _tenant, _module: None
    )
    monkeypatch.setattr(
        whatsapp_processor,
        "enforce_module_enabled",
        lambda _session, _tenant, _module: None,
    )
    with Session(test_engine) as session:
        tenant, branch, patient, appointment = _configured_tenant(session)
        patient.whatsapp_consent_status = WhatsAppConsentStatus.OPTED_OUT
        patient.whatsapp_consent_source = "patient_verbal"
        session.add(patient)
        session.commit()

        blocked = events.queue_whatsapp_template_if_allowed(
            session,
            tenant_id=tenant.id,
            branch_id=branch.id,
            flow_key="appointment_booked_patient",
            recipient=patient.mobile,
            resource_type="appointment",
            resource_id=appointment.id,
            dedupe_key="consent:blocked-patient",
        )
        doctor = events.queue_whatsapp_template_if_allowed(
            session,
            tenant_id=tenant.id,
            branch_id=branch.id,
            flow_key="appointment_booked_doctor",
            recipient="9123456789",
            resource_type="appointment",
            resource_id=appointment.id,
            dedupe_key="consent:doctor-unaffected",
        )
        assert blocked is None
        assert doctor is not None

        patient.whatsapp_consent_status = WhatsAppConsentStatus.OPTED_IN
        session.add(patient)
        session.commit()
        queued = events.queue_whatsapp_template_if_allowed(
            session,
            tenant_id=tenant.id,
            branch_id=branch.id,
            flow_key="appointment_booked_patient",
            recipient=patient.mobile,
            resource_type="appointment",
            resource_id=appointment.id,
            dedupe_key="consent:queued-before-opt-out",
        )
        assert queued is not None

        patient.whatsapp_consent_status = WhatsAppConsentStatus.OPTED_OUT
        session.add(patient)
        session.commit()
        whatsapp_processor.process_due_whatsapp_notifications(session, limit=5)
        session.refresh(queued)
        assert queued.status == NotificationStatus.CANCELLED
        assert "opted out" in str(queued.failure_reason).lower()
