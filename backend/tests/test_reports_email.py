import json

from sqlmodel import Session

from app.modules.reports.models import ReportJob, ReportJobStatus
from app.modules.reports.service import process_report_job
from app.modules.tenants.models import Tenant


def test_monthly_report_email_sends_settlement_attachments(test_engine, monkeypatch):
    sent = {}
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

        def fake_send_report_email(**kwargs):
            sent.update(kwargs)
            return "message-1"

        monkeypatch.setattr(
            "app.modules.reports.services.job_service.send_report_email",
            fake_send_report_email,
        )

        processed = process_report_job(session, job.id)

    attachment_names = [filename for filename, _content in sent["attachments"]]
    assert processed.status == ReportJobStatus.SENT
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
