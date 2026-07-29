import asyncio
from io import BytesIO
import hashlib

import pikepdf
import pytest
from fastapi import HTTPException
from PIL import Image
from sqlmodel import Session

from app.core.config import Settings
from app.modules.files.models import FileDocument
from app.modules.files.optimization.images import optimize_image
from app.modules.files.optimization.pdfs import optimize_pdf
from app.modules.files.optimization.profiles import (
    LAB_SCAN_DELIVERY,
    PATIENT_PHOTO,
    select_optimization_profile,
)
from app.modules.files.optimization.service import OptimizationError, optimize_document
from app.modules.files.repositories import FileDocumentRepository
from app.modules.files.services.file_service import FileService
from app.modules.files.services.optimization_service import FileOptimizationService
from app.modules.files.storage.local import LocalStorageBackend
from app.modules.identity.models import User


def _jpeg_bytes(width: int = 2200, height: int = 1200) -> bytes:
    image = Image.new("RGB", (width, height), (120, 80, 40))
    output = BytesIO()
    image.save(output, format="JPEG", quality=100)
    return output.getvalue()


def _pdf_bytes(*, encrypted: bool = False) -> bytes:
    output = BytesIO()
    pdf = pikepdf.Pdf.new()
    pdf.add_blank_page(page_size=(595, 842))
    pdf.docinfo["/Author"] = "Sensitive test metadata"
    encryption = (
        pikepdf.Encryption(owner="owner", user="patient") if encrypted else False
    )
    pdf.save(output, encryption=encryption)
    return output.getvalue()


def test_profile_selection_distinguishes_invoice_and_lab():
    invoice = select_optimization_profile(
        category="invoice",
        source_module="billing",
        attached_to_field="invoice_pdf",
        content_type="application/pdf",
    )
    lab = select_optimization_profile(
        category="lab_report",
        source_module="lab",
        attached_to_field=None,
        content_type="image/jpeg",
    )

    assert invoice.name == "invoice_pdf"
    assert invoice.preserve_original is False
    assert lab == LAB_SCAN_DELIVERY
    assert lab.preserve_original is True


def test_patient_photo_is_resized_and_metadata_free():
    source = _jpeg_bytes()
    optimized, content_type, extension = optimize_image(source, PATIENT_PHOTO)

    assert content_type == "image/jpeg"
    assert extension == ".jpg"
    assert len(optimized) < len(source)
    with Image.open(BytesIO(optimized)) as image:
        assert max(image.size) == 1600
        assert not image.getexif()


def test_corrupted_image_is_rejected():
    with pytest.raises(ValueError, match="corrupted"):
        optimize_image(b"not-an-image", PATIENT_PHOTO)


def test_pdf_is_reopenable_and_page_count_is_preserved():
    optimized = optimize_pdf(_pdf_bytes())
    with pikepdf.Pdf.open(BytesIO(optimized)) as pdf:
        assert len(pdf.pages) == 1
        assert "/Author" not in pdf.docinfo


def test_password_protected_pdf_is_rejected():
    with pytest.raises(ValueError, match="Password-protected"):
        optimize_pdf(_pdf_bytes(encrypted=True))


def test_small_lab_pdf_does_not_create_unhelpful_rendition():
    source = _pdf_bytes()
    result = optimize_document(
        data=source,
        content_type="application/pdf",
        profile=select_optimization_profile(
            category="lab_report",
            source_module="lab",
            attached_to_field=None,
            content_type="application/pdf",
        ),
    )

    assert result.changed is False
    assert result.data == source


def test_unsupported_optimization_profile_error_is_safe():
    with pytest.raises(OptimizationError, match="corrupted"):
        optimize_document(
            data=b"invalid",
            content_type="image/jpeg",
            profile=PATIENT_PHOTO,
        )


def test_rendition_repository_versions_include_inactive_rows(test_engine):
    with Session(test_engine) as session:
        original = FileDocument(
            tenant_id="tenant-1",
            file_name="original.jpg",
            file_url="/uploads/original.jpg",
            artifact_type="original",
        )
        session.add(original)
        session.commit()
        session.refresh(original)
        session.add(
            FileDocument(
                tenant_id="tenant-1",
                file_name="delivery.jpg",
                file_url="/uploads/delivery.jpg",
                original_file_id=original.id,
                artifact_type="delivery",
                document_version=1,
                is_active=False,
            )
        )
        session.commit()

        assert (
            FileDocumentRepository(session).next_rendition_version(
                tenant_id="tenant-1", original_file_id=original.id
            )
            == 2
        )


def test_optimization_creates_one_idempotent_delivery_rendition(
    test_engine, tmp_path, monkeypatch
):
    from app.modules.files.services import optimization_service as module

    backend = LocalStorageBackend(tmp_path)
    source = _jpeg_bytes()
    checksum = hashlib.sha256(source).hexdigest()
    stored = backend.put(
        key="local/tenants/tenant-1/patients/patient-photo/patient-1/source.jpg",
        data=source,
        content_type="image/jpeg",
        checksum_sha256=checksum,
    )
    monkeypatch.setattr(module, "get_storage_backend", lambda settings: backend)
    monkeypatch.setattr(module, "get_storage_backend_for_document", lambda row: backend)
    monkeypatch.setattr(
        module,
        "get_settings",
        lambda: Settings(uploads_dir=tmp_path, environment="local"),
    )

    with Session(test_engine) as session:
        original = FileDocument(
            tenant_id="tenant-1",
            file_name="patient.jpg",
            file_url=f"/uploads/{stored.key}",
            content_type="image/jpeg",
            file_size=len(source),
            storage_key=stored.key,
            checksum_sha256=checksum,
            category="patient_photo",
            source_module="patients",
            attached_to_name="patient-1",
            artifact_type="original",
        )
        actor = User(
            id="user-1",
            name="Storage Admin",
            email="storage-admin@example.test",
            password_hash="unused",
            is_super_admin=True,
        )
        session.add(original)
        session.commit()
        session.refresh(original)

        service = FileOptimizationService(session)
        first = service.optimize_file(
            tenant_id="tenant-1", file_id=original.id, actor=actor
        )
        second = service.optimize_file(
            tenant_id="tenant-1", file_id=original.id, actor=actor
        )
        renditions = FileDocumentRepository(session).list_renditions(
            tenant_id="tenant-1", original_file_id=original.id
        )

        assert first.status == "ready"
        assert first.delivery_file_id == second.delivery_file_id
        assert first.stored_size_bytes < first.original_size_bytes
        assert len(renditions) == 1
        assert backend.get_bytes(key=stored.key) == source


def test_original_cannot_be_deleted_while_rendition_is_active(test_engine):
    with Session(test_engine) as session:
        original = FileDocument(
            tenant_id="tenant-1",
            file_name="original.pdf",
            file_url="/uploads/original.pdf",
            artifact_type="original",
        )
        session.add(original)
        session.commit()
        session.refresh(original)
        session.add(
            FileDocument(
                tenant_id="tenant-1",
                file_name="delivery.pdf",
                file_url="/uploads/delivery.pdf",
                artifact_type="delivery",
                original_file_id=original.id,
            )
        )
        session.commit()
        actor = User(
            id="user-1",
            name="Storage Admin",
            email="storage-admin@example.test",
            password_hash="unused",
            is_super_admin=True,
        )

        with pytest.raises(HTTPException) as blocked:
            FileService(session).delete_file(
                tenant_id="tenant-1", file_id=original.id, actor=actor
            )

        assert blocked.value.status_code == 409


def test_replacing_attachment_creates_immutable_version(
    test_engine, tmp_path, monkeypatch
):
    from app.modules.files.services import file_service as module

    backend = LocalStorageBackend(tmp_path)
    monkeypatch.setattr(module, "get_storage_backend", lambda settings: backend)
    monkeypatch.setattr(
        module,
        "get_settings",
        lambda: Settings(uploads_dir=tmp_path, environment="local"),
    )
    actor = User(
        id="user-1",
        name="Storage Admin",
        email="storage-admin@example.test",
        password_hash="unused",
        is_super_admin=True,
    )

    class AsyncUpload:
        filename = "document.pdf"

        def __init__(self, payload: bytes):
            self.stream = BytesIO(payload)

        async def read(self, size: int = -1) -> bytes:
            return self.stream.read(size)

    def upload(session: Session, payload: bytes) -> FileDocument:
        return asyncio.run(
            FileService(session).upload_file(
                tenant_id="tenant-1",
                file=AsyncUpload(payload),
                branch_id=None,
                patient_id=None,
                category="general",
                source_module="files",
                attached_to_doctype="Patient",
                attached_to_name="patient-1",
                attached_to_field="document",
                attached_to_label="Document",
                folder="Documents",
                notes=None,
                is_private=True,
                actor=actor,
            )
        )

    with Session(test_engine) as session:
        first = upload(session, b"%PDF-1.4\nfirst version")
        first_key = first.storage_key
        second = upload(session, b"%PDF-1.4\nsecond version")
        first_from_db = session.get(FileDocument, first.id)

        assert second.id != first.id
        assert second.document_version == 2
        assert first_from_db.is_active is False
        assert backend.exists(key=first_key)
        assert backend.exists(key=second.storage_key)
