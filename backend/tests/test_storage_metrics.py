from sqlmodel import Session

from app.modules.files.models import FileDocument
from app.modules.files.services.storage_metrics import read_storage_metrics
from app.modules.notifications.models import (
    NotificationEvent,
    NotificationEventType,
    NotificationProvider,
)
from app.modules.tenants.models import Tenant


def test_storage_metrics_track_versions_optimization_and_pinned_delivery(test_engine):
    with Session(test_engine) as session:
        tenant = Tenant(name="Storage Metrics Clinic")
        session.add(tenant)
        session.commit()
        session.refresh(tenant)
        final = FileDocument(
            tenant_id=tenant.id,
            file_name="invoice.pdf",
            file_url="/api/v1/files/final/download",
            content_type="application/pdf",
            file_size=700,
            stored_size_bytes=700,
            original_size_bytes=1000,
            storage_backend="s3",
            artifact_type="final",
            category="invoice",
            attached_to_doctype="Invoice",
            attached_to_name="invoice-1",
            attached_to_field="invoice_pdf",
        )
        inactive = FileDocument(
            tenant_id=tenant.id,
            file_name="invoice-v0.pdf",
            file_url="/api/v1/files/old/download",
            content_type="application/pdf",
            file_size=900,
            stored_size_bytes=900,
            original_size_bytes=1000,
            storage_backend="s3",
            artifact_type="final",
            category="invoice",
            attached_to_doctype="Invoice",
            attached_to_name="invoice-1",
            attached_to_field="invoice_pdf",
            is_active=False,
        )
        session.add(final)
        session.add(inactive)
        session.commit()
        session.refresh(final)
        session.add(
            NotificationEvent(
                tenant_id=tenant.id,
                provider=NotificationProvider.WHATSAPP,
                event_type=NotificationEventType.PATIENT_MESSAGE,
                recipient="919876543210",
                message="Invoice queued",
                template_key="invoice_paid_patient",
                resource_type="invoice",
                resource_id="invoice-1",
                artifact_file_id=final.id,
                artifact_version=1,
            )
        )
        session.commit()

        metrics = read_storage_metrics(session, tenant_id=tenant.id)

        assert metrics["total_documents"] == 2
        assert metrics["active_documents"] == 1
        assert metrics["total_stored_bytes"] == 1600
        assert metrics["optimization_saved_bytes"] == 400
        assert metrics["pinned_invoice_deliveries"] == 1
        assert metrics["legacy_unpinned_invoice_deliveries"] == 0
        assert metrics["duplicate_active_invoice_artifacts"] == 0
        assert metrics["by_storage_backend"]["s3"] == {
            "documents": 2,
            "stored_bytes": 1600,
        }
