from urllib.parse import parse_qs, urlparse

import pytest
from fastapi import HTTPException
from sqlmodel import Session

from app.modules.files.models import FileDocument
from app.modules.files.services.file_service import FileService
from app.modules.identity.models import User
from app.modules.integrations.document_links import (
    create_signed_document_url,
    verify_document_signature,
)
from app.modules.notifications.email_processor import process_due_email_deliveries
from app.modules.notifications.models import (
    DocumentDeliveryChannel,
    DocumentDeliveryStatus,
)
from app.modules.notifications.services.document_delivery import queue_document_delivery
from app.modules.lab.models import LabOrder, LabOrderStatus
from app.modules.lab.services.delivery_service import queue_lab_report_delivery
from app.modules.notifications.schemas import DocumentDeliveryRequest
from app.modules.patients.models import Patient
from app.modules.tenants.models import Tenant


def _artifact(session: Session):
    tenant = Tenant(name="Delivery Clinic")
    session.add(tenant)
    session.commit()
    session.refresh(tenant)
    artifact = FileDocument(
        tenant_id=tenant.id,
        file_name="invoice.pdf",
        file_url="private://invoice.pdf",
        content_type="application/pdf",
        file_size=20,
        category="invoice",
        artifact_type="final",
        document_version=3,
    )
    session.add(artifact)
    session.commit()
    session.refresh(artifact)
    return tenant, artifact


def test_email_delivery_is_idempotent_and_uses_exact_inactive_artifact(
    test_engine, monkeypatch
):
    captured = {}

    class Sender:
        def send(self, **kwargs):
            captured.update(kwargs)
            return "provider-email-1"

    monkeypatch.setattr(
        "app.modules.notifications.email_processor.ArtifactService.read_bytes",
        lambda _row: b"%PDF exact version three",
    )
    with Session(test_engine) as session:
        tenant, artifact = _artifact(session)
        first = queue_document_delivery(
            session,
            tenant_id=tenant.id,
            branch_id=None,
            channel=DocumentDeliveryChannel.EMAIL,
            resource_type="invoice",
            resource_id="invoice-1",
            artifact_file_id=artifact.id,
            artifact_version=3,
            recipient="patient@example.com",
            subject="Invoice",
            idempotency_key="invoice-email-123",
        )
        second = queue_document_delivery(
            session,
            tenant_id=tenant.id,
            branch_id=None,
            channel=DocumentDeliveryChannel.EMAIL,
            resource_type="invoice",
            resource_id="invoice-1",
            artifact_file_id=artifact.id,
            artifact_version=3,
            recipient="patient@example.com",
            idempotency_key="invoice-email-123",
        )
        artifact.is_active = False
        session.add(artifact)
        session.commit()

        assert first.id == second.id
        assert process_due_email_deliveries(session, sender=Sender()) == 1
        session.refresh(first)
        assert first.status == DocumentDeliveryStatus.SENT
        assert first.provider_message_id == "provider-email-1"
        assert captured["attachments"] == [
            ("invoice.pdf", "application/pdf", b"%PDF exact version three")
        ]


def test_email_delivery_retries_temporary_failure(test_engine, monkeypatch):
    class Sender:
        def send(self, **_kwargs):
            raise RuntimeError("SMTP temporarily unavailable")

    monkeypatch.setattr(
        "app.modules.notifications.email_processor.ArtifactService.read_bytes",
        lambda _row: b"document",
    )
    with Session(test_engine) as session:
        tenant, artifact = _artifact(session)
        delivery = queue_document_delivery(
            session,
            tenant_id=tenant.id,
            branch_id=None,
            channel=DocumentDeliveryChannel.EMAIL,
            resource_type="invoice",
            resource_id="invoice-1",
            artifact_file_id=artifact.id,
            artifact_version=3,
            recipient="patient@example.com",
            idempotency_key="invoice-email-retry",
        )
        process_due_email_deliveries(session, sender=Sender())
        session.refresh(delivery)

        assert delivery.status == DocumentDeliveryStatus.QUEUED
        assert delivery.attempt_count == 1
        assert "temporarily unavailable" in delivery.failure_reason


def test_delivery_idempotency_key_cannot_cross_resource_boundary(test_engine):
    with Session(test_engine) as session:
        tenant, artifact = _artifact(session)
        queue_document_delivery(
            session,
            tenant_id=tenant.id,
            branch_id=None,
            channel=DocumentDeliveryChannel.EMAIL,
            resource_type="invoice",
            resource_id="invoice-1",
            artifact_file_id=artifact.id,
            artifact_version=3,
            recipient="patient@example.com",
            idempotency_key="shared-client-key",
        )

        with pytest.raises(HTTPException, match="another delivery"):
            queue_document_delivery(
                session,
                tenant_id=tenant.id,
                branch_id=None,
                channel=DocumentDeliveryChannel.EMAIL,
                resource_type="invoice",
                resource_id="invoice-2",
                artifact_file_id=artifact.id,
                artifact_version=3,
                recipient="other@example.com",
                idempotency_key="shared-client-key",
            )


def test_generic_document_link_authenticates_exact_file_id():
    url = create_signed_document_url(
        public_base_url="https://api.example.com",
        tenant_id="tenant-1",
        file_id="file-1",
    )
    query = parse_qs(urlparse(url).query)
    verify_document_signature(
        tenant_id="tenant-1",
        file_id="file-1",
        expires=int(query["expires"][0]),
        signature=query["signature"][0],
    )
    with pytest.raises(HTTPException):
        verify_document_signature(
            tenant_id="tenant-1",
            file_id="file-2",
            expires=int(query["expires"][0]),
            signature=query["signature"][0],
        )


def test_lab_email_delivery_prefers_ready_optimized_artifact(test_engine):
    with Session(test_engine) as session:
        tenant = Tenant(name="Lab Delivery Clinic")
        actor = User(
            tenant_id=tenant.id,
            name="Lab Administrator",
            email="lab-admin@example.com",
            is_super_admin=True,
        )
        patient = Patient(
            tenant_id=tenant.id,
            branch_id="branch-lab",
            patient_number="LAB-001",
            full_name="Lab Patient",
            mobile="9999999999",
            email="patient@example.com",
        )
        order = LabOrder(
            tenant_id=tenant.id,
            branch_id="branch-lab",
            patient_id=patient.id,
            lab_order_number="LAB-2026-001",
            status=LabOrderStatus.RESULT_READY,
            tests="Complete blood count",
        )
        original = FileDocument(
            tenant_id=tenant.id,
            branch_id="branch-lab",
            patient_id=patient.id,
            file_name="lab-report.png",
            file_url="private://lab-report.png",
            file_size=500,
            content_type="image/png",
            category="lab_report",
            attached_to_doctype="LabOrder",
            attached_to_name=order.id,
            artifact_type="original",
            optimization_status="ready",
        )
        optimized = FileDocument(
            tenant_id=tenant.id,
            branch_id="branch-lab",
            patient_id=patient.id,
            file_name="lab-report.webp",
            file_url="private://lab-report.webp",
            file_size=100,
            content_type="image/webp",
            category="lab_report",
            attached_to_doctype="LabOrder",
            attached_to_name=order.id,
            artifact_type="delivery",
            original_file_id=original.id,
        )
        session.add_all([tenant, actor, patient, order, original, optimized])
        session.commit()

        delivery = queue_lab_report_delivery(
            session,
            tenant_id=tenant.id,
            order_id=order.id,
            payload=DocumentDeliveryRequest(
                channel=DocumentDeliveryChannel.EMAIL,
                idempotency_key="lab-email-delivery-1",
            ),
            actor=actor,
        )

        assert delivery.artifact_file_id == optimized.id
        assert delivery.artifact_version == optimized.document_version
        assert delivery.recipient == "patient@example.com"


def test_legal_hold_blocks_document_deactivation(test_engine):
    with Session(test_engine) as session:
        tenant, artifact = _artifact(session)
        artifact.legal_hold = True
        actor = User(
            tenant_id=tenant.id,
            name="Records Administrator",
            email="records@example.com",
            is_super_admin=True,
        )
        session.add(artifact)
        session.add(actor)
        session.commit()

        with pytest.raises(HTTPException, match="legal hold"):
            FileService(session).delete_file(
                tenant_id=tenant.id, file_id=artifact.id, actor=actor
            )
