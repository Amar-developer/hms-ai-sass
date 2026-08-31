import json
from datetime import timedelta

from sqlmodel import Session, select

from app.modules.files.models import FileDocument
from app.modules.notifications.email_processor import process_due_email_deliveries
from app.modules.notifications.models import DocumentDelivery
from app.modules.identity.models import User
from app.modules.reports.models import ReportJob, ReportJobStatus
from app.modules.reports.queue import (
    dequeue_monthly_report_job,
    enqueue_monthly_report_job,
)
from app.modules.reports.schemas import ReportResendRequest
from app.modules.reports.service import process_report_job, resend_monthly_report_job
from app.modules.reports.worker import recover_stale_report_jobs
from app.modules.tenants.models import Tenant, now_utc


def test_monthly_report_email_sends_settlement_attachments(test_engine):
    sent = {}

    class Sender:
        def send(self, **kwargs):
            sent.update(kwargs)
            return "message-1"

    with Session(test_engine) as session:
        tenant = Tenant(name="Email Settlement Clinic")
        actor = User(
            tenant_id=tenant.id,
            name="Tenant Admin",
            email="tenant.admin@clinic.test",
            user_type="tenant_admin",
        )
        session.add(tenant)
        session.add(actor)
        session.commit()
        session.refresh(tenant)
        session.refresh(actor)
        job = ReportJob(
            tenant_id=tenant.id,
            status=ReportJobStatus.QUEUED,
            period_start="2026-04-01",
            period_end="2026-04-30",
            recipients_json=json.dumps(["owner@clinic.test"]),
            cc_json=json.dumps(["accounts@clinic.test"]),
            filters_json=json.dumps(
                {"overall": True, "doctor": True, "department": True, "invoice": True}
            ),
            queued_by_user_id=actor.id,
        )
        session.add(job)
        session.commit()
        session.refresh(job)

        processed = process_report_job(session, job.id)
        artifact_ids = json.loads(processed.artifact_file_ids_json)
        artifact_names = [
            session.get(FileDocument, file_id).file_name for file_id in artifact_ids
        ]

        assert processed.status == ReportJobStatus.DELIVERING
        assert process_due_email_deliveries(session, sender=Sender()) == 1
        session.refresh(processed)

    attachment_names = [filename for filename, *_rest in sent["attachments"]]
    assert sent["recipient"] == "owner@clinic.test"
    assert sent["cc"] == ["accounts@clinic.test"]
    assert sent["reply_to"] == "tenant.admin@clinic.test"
    # The tenant's own admin is the sender, so a clinic's reports arrive from
    # the clinic rather than from the shared platform address.
    assert sent["from_email"] == "tenant.admin@clinic.test"
    assert sent["from_name"] == "Email Settlement Clinic"
    assert processed.status == ReportJobStatus.SENT
    assert artifact_names == attachment_names
    assert attachment_names[0].startswith(
        "monthly-revenue-report-2026-04-01-2026-04-30"
    )
    assert any(
        filename.startswith("doctor-settlement-") for filename in attachment_names
    )
    assert any(filename.startswith("lab-settlement-") for filename in attachment_names)
    assert any(
        filename.startswith("pharmacy-settlement-") for filename in attachment_names
    )
    assert any(
        filename.startswith("invoice-profit-details-") for filename in attachment_names
    )
    report_files = {
        filename: content.decode("utf-8")
        for filename, _content_type, content in sent["attachments"]
        if filename.endswith(".xls")
    }
    for filename, content in report_files.items():
        assert "Mode of Payment" in content, filename
        if filename.startswith("doctor-settlement-"):
            assert "Doctor Fee %" in content, filename
            assert "Settlement %" not in content, filename
        elif not filename.startswith("monthly-revenue-report-"):
            assert "Settlement %" in content, filename


def test_manual_monthly_report_defaults_to_actor_email(test_engine):
    from app.modules.reports.schemas import MonthlyReportSendRequest
    from app.modules.reports.service import queue_monthly_report

    with Session(test_engine) as session:
        tenant = Tenant(name="Manual Report Clinic")
        actor = User(
            tenant_id=tenant.id,
            name="Tenant Admin",
            email="manual.admin@clinic.test",
            user_type="tenant_admin",
        )
        session.add(tenant)
        session.add(actor)
        session.commit()
        session.refresh(tenant)
        session.refresh(actor)

        job = queue_monthly_report(
            session,
            tenant_id=tenant.id,
            payload=MonthlyReportSendRequest(recipients=[], cc=[]),
            actor=actor,
        )

        assert job.recipients == ["manual.admin@clinic.test"]
        assert job.queued_by_user_id == actor.id


def test_report_resend_reuses_permanent_artifacts(test_engine):
    with Session(test_engine) as session:
        tenant = Tenant(name="Report Resend Clinic")
        actor = User(
            tenant_id=tenant.id,
            name="Report Administrator",
            email="reports@example.com",
            is_super_admin=True,
        )
        session.add(tenant)
        session.add(actor)
        session.commit()
        job = ReportJob(
            tenant_id=tenant.id,
            status=ReportJobStatus.QUEUED,
            period_start="2026-05-01",
            period_end="2026-05-31",
            recipients_json=json.dumps(["owner@clinic.test"]),
            cc_json="[]",
            filters_json=json.dumps({"overall": True}),
            queued_by_user_id=actor.id,
        )
        session.add(job)
        session.commit()
        session.refresh(job)
        process_report_job(session, job.id)
        artifact_ids = json.loads(job.artifact_file_ids_json)
        file_count = len(session.exec(select(FileDocument)).all())

        resent = resend_monthly_report_job(
            session,
            tenant_id=tenant.id,
            job_id=job.id,
            payload=ReportResendRequest(idempotency_key="manual-resend-1"),
            actor=actor,
        )

        deliveries = session.exec(select(DocumentDelivery)).all()
        assert resent.status == ReportJobStatus.DELIVERING
        assert len(deliveries) == 2
        assert json.loads(deliveries[-1].artifact_file_ids_json) == artifact_ids
        assert len(session.exec(select(FileDocument)).all()) == file_count


def test_report_job_recovery_reuses_existing_delivery_and_artifacts(test_engine):
    with Session(test_engine) as session:
        tenant = Tenant(name="Duplicate Wakeup Clinic")
        session.add(tenant)
        session.commit()
        job = ReportJob(
            tenant_id=tenant.id,
            period_start="2026-06-01",
            period_end="2026-06-30",
            recipients_json='["owner@clinic.test"]',
            cc_json="[]",
            filters_json='{"overall": true}',
        )
        session.add(job)
        session.commit()
        session.refresh(job)

        first = process_report_job(session, job.id)
        file_count = len(session.exec(select(FileDocument)).all())
        delivery_count = len(session.exec(select(DocumentDelivery)).all())
        # Simulate a process exit after the delivery transaction committed but
        # before the report job's final DELIVERING transition committed.
        first.status = ReportJobStatus.RUNNING
        first.started_at = now_utc() - timedelta(hours=1)
        session.add(first)
        session.commit()
        assert recover_stale_report_jobs(session) == 1
        second = process_report_job(session, job.id)

        assert first.status == ReportJobStatus.DELIVERING
        assert second.status == ReportJobStatus.DELIVERING
        assert len(session.exec(select(FileDocument)).all()) == file_count
        assert len(session.exec(select(DocumentDelivery)).all()) == delivery_count


def test_stale_running_report_job_is_requeued(test_engine):
    with Session(test_engine) as session:
        tenant = Tenant(name="Worker Recovery Clinic")
        session.add(tenant)
        session.commit()
        job = ReportJob(
            tenant_id=tenant.id,
            status=ReportJobStatus.RUNNING,
            period_start="2026-06-01",
            period_end="2026-06-30",
            recipients_json="[]",
            cc_json="[]",
            filters_json="{}",
            started_at=now_utc() - timedelta(hours=1),
        )
        session.add(job)
        session.commit()

        assert recover_stale_report_jobs(session) == 1
        session.refresh(job)
        assert job.status == ReportJobStatus.QUEUED
        assert job.started_at is None


def test_report_queue_deduplicates_wakeup_hints(monkeypatch):
    class FakeCache:
        def __init__(self):
            self.values = {}
            self.items = []

        def set(self, key, value, **kwargs):
            if kwargs.get("nx") and key in self.values:
                return False
            self.values[key] = value
            return True

        def lpush(self, key, value):
            self.items.insert(0, (key, value))

        def brpop(self, key, timeout=0):
            if not self.items:
                return None
            queue_name, value = self.items.pop()
            return queue_name, value

        def delete(self, *keys):
            for key in keys:
                self.values.pop(key, None)

    cache = FakeCache()
    monkeypatch.setattr(
        "app.modules.reports.queue.get_cache_store", lambda _settings: cache
    )

    assert enqueue_monthly_report_job("reportjob_1") is True
    assert enqueue_monthly_report_job("reportjob_1") is False
    assert len(cache.items) == 1
    assert dequeue_monthly_report_job(timeout=0) == "reportjob_1"
    assert enqueue_monthly_report_job("reportjob_1") is True


def test_smtp_sender_falls_back_to_the_configured_identity_and_sets_a_message_id():
    """A tenant with no admin address on file must still send, and every message
    needs an id the provider's logs can be traced by."""
    from unittest.mock import patch

    from app.core.config import Settings
    from app.infrastructure.integrations.adapters.email.smtp import SmtpEmailAdapter
    from app.infrastructure.integrations.ports.email import EmailMessageRequest

    captured = {}

    class FakeSmtp:
        def __init__(self, *_args, **_kwargs):
            pass

        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return False

        def starttls(self):
            pass

        def login(self, *_args):
            pass

        def send_message(self, message):
            captured["message"] = message

    settings = Settings(
        smtp_host="mail.example.com",
        smtp_from_email="reports@medizinhub.local",
        smtp_from_name="MedizinHub HMS Reports",
    )
    adapter = SmtpEmailAdapter(settings)
    with patch("smtplib.SMTP", FakeSmtp):
        tenant_id = adapter.send_message(
            EmailMessageRequest(
                recipients=["owner@clinic.test"],
                subject="Monthly report",
                body="body",
                from_email="admin@sunrise.test",
                from_name="Sunrise Clinic",
            )
        )
        assert captured["message"]["From"] == "Sunrise Clinic <admin@sunrise.test>"
        assert tenant_id.startswith("<") and "sunrise.test" in tenant_id

        fallback_id = adapter.send_message(
            EmailMessageRequest(
                recipients=["owner@clinic.test"], subject="x", body="body"
            )
        )
        assert (
            captured["message"]["From"]
            == "MedizinHub HMS Reports <reports@medizinhub.local>"
        )
        assert fallback_id.startswith("<")
