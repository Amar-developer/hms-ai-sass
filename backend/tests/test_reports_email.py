import json

from sqlmodel import Session, select

from app.modules.files.models import FileDocument
from app.modules.notifications.email_processor import process_due_email_deliveries
from app.modules.notifications.models import DocumentDelivery
from app.modules.identity.models import User
from app.modules.reports.models import ReportJob, ReportJobStatus
from app.modules.reports.schemas import ReportResendRequest
from app.modules.reports.service import process_report_job, resend_monthly_report_job
from app.modules.tenants.models import Tenant


def test_monthly_report_email_sends_settlement_attachments(test_engine):
    sent = {}

    class Sender:
        def send(self, **kwargs):
            sent.update(kwargs)
            return "message-1"

    with Session(test_engine) as session:
        tenant = Tenant(name="Email Settlement Clinic")
        session.add(tenant)
        session.commit()
        session.refresh(tenant)
        job = ReportJob(
            tenant_id=tenant.id,
            status=ReportJobStatus.QUEUED,
            period_start="2026-04-01",
            period_end="2026-04-30",
            recipients_json=json.dumps(["owner@clinic.test"]),
            cc_json=json.dumps([]),
            filters_json=json.dumps(
                {"overall": True, "doctor": True, "department": True, "invoice": True}
            ),
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
