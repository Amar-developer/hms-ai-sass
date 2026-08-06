from datetime import datetime, timezone
from decimal import Decimal
from urllib.parse import parse_qs, urlparse

import pytest
from fastapi import HTTPException
from sqlmodel import Session

from app.modules.billing.models import Invoice, InvoiceItem, InvoiceStatus
from app.modules.files.models import FileDocument
from app.modules.integrations import invoice_receipts
from app.modules.integrations.invoice_receipts import (
    create_signed_invoice_receipt_url,
    render_invoice_receipt_pdf,
    verify_invoice_receipt_signature,
)
from app.modules.patients.models import Patient
from app.modules.tenants.models import Branch, Tenant


def _invoice_fixture(session: Session):
    tenant = Tenant(
        name="Receipt Clinic",
        legal_name="Receipt Clinic Private Limited",
        address="Main Road",
        phone="9876543210",
    )
    session.add(tenant)
    session.commit()
    session.refresh(tenant)
    branch = Branch(tenant_id=tenant.id, name="Main Branch", code="MAIN")
    patient = Patient(
        tenant_id=tenant.id,
        patient_number="P-RECEIPT-1",
        full_name="Receipt Patient",
        mobile="9876543210",
    )
    session.add(branch)
    session.add(patient)
    session.commit()
    session.refresh(branch)
    session.refresh(patient)
    invoice = Invoice(
        tenant_id=tenant.id,
        branch_id=branch.id,
        patient_id=patient.id,
        invoice_number="INV-2026-001",
        status=InvoiceStatus.PAID,
        subtotal_amount=Decimal("1000.00"),
        tax_amount=Decimal("50.00"),
        total_amount=Decimal("1050.00"),
        paid_amount=Decimal("1050.00"),
        balance_amount=Decimal("0.00"),
        created_at=datetime(2026, 7, 24, tzinfo=timezone.utc),
    )
    session.add(invoice)
    session.commit()
    session.refresh(invoice)
    session.add(
        InvoiceItem(
            tenant_id=tenant.id,
            invoice_id=invoice.id,
            description="Doctor consultation",
            quantity=1,
            unit_amount=Decimal("1000.00"),
            total_amount=Decimal("1000.00"),
        )
    )
    session.commit()
    return tenant, invoice


def test_signed_receipt_url_verifies_and_rejects_tampering():
    url = create_signed_invoice_receipt_url(
        public_base_url="https://api.example.com/",
        tenant_id="tenant-1",
        invoice_id="invoice-1",
        now_timestamp=1_000,
        ttl_seconds=300,
    )
    parsed = urlparse(url)
    query = parse_qs(parsed.query)

    assert parsed.path.endswith("/invoice-1.pdf")
    verify_invoice_receipt_signature(
        tenant_id="tenant-1",
        invoice_id="invoice-1",
        expires=int(query["expires"][0]),
        signature=query["signature"][0],
        now_timestamp=1_100,
    )
    with pytest.raises(HTTPException) as tampered:
        verify_invoice_receipt_signature(
            tenant_id="tenant-1",
            invoice_id="invoice-2",
            expires=int(query["expires"][0]),
            signature=query["signature"][0],
            now_timestamp=1_100,
        )
    assert tampered.value.status_code == 404
    with pytest.raises(HTTPException) as expired:
        verify_invoice_receipt_signature(
            tenant_id="tenant-1",
            invoice_id="invoice-1",
            expires=int(query["expires"][0]),
            signature=query["signature"][0],
            now_timestamp=1_301,
        )
    assert expired.value.status_code == 410


def test_signed_receipt_url_pins_and_authenticates_artifact_id():
    url = create_signed_invoice_receipt_url(
        public_base_url="https://api.example.com",
        tenant_id="tenant-1",
        invoice_id="invoice-1",
        file_id="file-final-v2",
        now_timestamp=1_000,
        ttl_seconds=300,
    )
    query = parse_qs(urlparse(url).query)

    assert query["file_id"] == ["file-final-v2"]
    verify_invoice_receipt_signature(
        tenant_id="tenant-1",
        invoice_id="invoice-1",
        file_id="file-final-v2",
        expires=int(query["expires"][0]),
        signature=query["signature"][0],
        now_timestamp=1_100,
    )
    with pytest.raises(HTTPException) as tampered:
        verify_invoice_receipt_signature(
            tenant_id="tenant-1",
            invoice_id="invoice-1",
            file_id="file-final-v1",
            expires=int(query["expires"][0]),
            signature=query["signature"][0],
            now_timestamp=1_100,
        )
    assert tampered.value.status_code == 404


def test_serves_tenant_scoped_stored_printed_invoice_pdf(
    test_engine, monkeypatch, tmp_path
):
    with Session(test_engine) as session:
        tenant, invoice = _invoice_fixture(session)
        printed_pdf = b"%PDF-1.4\nfull printed invoice design\n%%EOF"
        (tmp_path / "printed-invoice.pdf").write_bytes(printed_pdf)
        monkeypatch.setattr(invoice_receipts, "UPLOADS_DIR", tmp_path)
        session.add(
            FileDocument(
                tenant_id=tenant.id,
                branch_id=invoice.branch_id,
                patient_id=invoice.patient_id,
                file_name="Receipt-Patient-INV-2026-001.pdf",
                file_url="/uploads/printed-invoice.pdf",
                content_type="application/pdf",
                is_private=True,
                category="invoice",
                source_module="billing",
                attached_to_doctype="Invoice",
                attached_to_name=invoice.id,
                attached_to_field="invoice_pdf",
            )
        )
        session.commit()

        pdf, filename = render_invoice_receipt_pdf(
            session, tenant_id=tenant.id, invoice_id=invoice.id
        )

        assert pdf == printed_pdf
        assert filename == "Receipt-Patient-INV-2026-001.pdf"
        with pytest.raises(HTTPException) as wrong_tenant:
            render_invoice_receipt_pdf(
                session, tenant_id="tenant-other", invoice_id=invoice.id
            )
        assert wrong_tenant.value.status_code == 404


def test_serves_exact_historical_final_artifact_after_regeneration(
    test_engine, monkeypatch, tmp_path
):
    with Session(test_engine) as session:
        tenant, invoice = _invoice_fixture(session)
        first_pdf = b"%PDF-1.4\nfinal invoice v1\n%%EOF"
        second_pdf = b"%PDF-1.4\nfinal invoice v2\n%%EOF"
        (tmp_path / "invoice-v1.pdf").write_bytes(first_pdf)
        (tmp_path / "invoice-v2.pdf").write_bytes(second_pdf)
        monkeypatch.setattr(invoice_receipts, "UPLOADS_DIR", tmp_path)
        first = FileDocument(
            tenant_id=tenant.id,
            branch_id=invoice.branch_id,
            patient_id=invoice.patient_id,
            file_name="invoice-v1.pdf",
            file_url="/uploads/invoice-v1.pdf",
            content_type="application/pdf",
            artifact_type="final",
            document_version=1,
            is_active=False,
            is_private=True,
            category="invoice",
            source_module="billing",
            attached_to_doctype="Invoice",
            attached_to_name=invoice.id,
            attached_to_field="invoice_pdf",
        )
        second = FileDocument(
            tenant_id=tenant.id,
            branch_id=invoice.branch_id,
            patient_id=invoice.patient_id,
            file_name="invoice-v2.pdf",
            file_url="/uploads/invoice-v2.pdf",
            content_type="application/pdf",
            artifact_type="final",
            document_version=2,
            is_active=True,
            is_private=True,
            category="invoice",
            source_module="billing",
            attached_to_doctype="Invoice",
            attached_to_name=invoice.id,
            attached_to_field="invoice_pdf",
        )
        session.add(first)
        session.add(second)
        session.commit()

        historical, historical_name = render_invoice_receipt_pdf(
            session,
            tenant_id=tenant.id,
            invoice_id=invoice.id,
            file_id=first.id,
        )
        current, current_name = render_invoice_receipt_pdf(
            session, tenant_id=tenant.id, invoice_id=invoice.id
        )

        assert (historical, historical_name) == (first_pdf, "invoice-v1.pdf")
        assert (current, current_name) == (second_pdf, "invoice-v2.pdf")
