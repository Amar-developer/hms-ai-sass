import hashlib
from pathlib import Path

from sqlmodel import Session

from app.core.config import get_settings
from app.modules.files.models import FileDocument
from app.modules.files.repositories import FileDocumentRepository
from app.modules.files.service import record_file_document
from app.modules.files.services.optimization_service import _read_file_bytes
from app.modules.files.storage.factory import get_storage_backend
from app.modules.files.storage.keys import build_storage_key
from app.modules.tenants.models import new_id, now_utc


class ArtifactService:
    def __init__(self, session: Session):
        self.session = session
        self.files = FileDocumentRepository(session)

    @staticmethod
    def read_bytes(row: FileDocument) -> bytes:
        return _read_file_bytes(row)

    def store_generated(
        self,
        *,
        tenant_id: str,
        file_name: str,
        data: bytes,
        content_type: str,
        category: str,
        source_module: str,
        attached_to_doctype: str,
        attached_to_name: str,
        attached_to_field: str,
        branch_id: str | None = None,
        patient_id: str | None = None,
        actor_user_id: str | None = None,
        notes: str | None = None,
    ) -> FileDocument:
        if not data:
            raise ValueError("Generated artifact cannot be empty")
        extension = Path(file_name).suffix.lower() or ".bin"
        checksum = hashlib.sha256(data).hexdigest()
        settings = get_settings()
        backend = get_storage_backend(settings)
        previous = self.files.find_attachment(
            tenant_id=tenant_id,
            file_url="",
            attached_to_doctype=attached_to_doctype,
            attached_to_name=attached_to_name,
            attached_to_field=attached_to_field,
            artifact_type="final",
        )
        document_id = new_id("file")
        version = int(previous.document_version or 1) + 1 if previous else 1
        key = build_storage_key(
            environment=settings.environment,
            tenant_id=tenant_id,
            module=source_module,
            document_type=category,
            entity_id=attached_to_name,
            extension=extension,
            prefix=settings.aws_s3_prefix,
        )
        stored = backend.put(
            key=key,
            data=data,
            content_type=content_type,
            checksum_sha256=checksum,
            metadata={
                "sha256": checksum,
                "tenant-id": tenant_id,
                "document-id": document_id,
                "artifact-type": "final",
            },
            tags={
                "artifact": "final",
                "retention": "permanent",
                "environment": settings.environment,
            },
        )
        try:
            row = record_file_document(
                self.session,
                document_id=document_id,
                tenant_id=tenant_id,
                branch_id=branch_id,
                patient_id=patient_id,
                file_name=file_name,
                file_url=(
                    f"/uploads/{stored.key}"
                    if backend.name == "local"
                    else f"/api/v1/files/{document_id}/download"
                ),
                file_size=stored.size,
                content_type=content_type,
                category=category,
                source_module=source_module,
                attached_to_doctype=attached_to_doctype,
                attached_to_name=attached_to_name,
                attached_to_field=attached_to_field,
                attached_to_label="Permanent generated report",
                folder="Reports" if category == "report" else None,
                notes=notes,
                uploaded_by_user_id=actor_user_id,
                is_private=True,
                storage_backend=backend.name,
                storage_key=stored.key,
                storage_bucket=stored.bucket,
                storage_region=stored.region,
                storage_version_id=stored.version_id,
                checksum_sha256=checksum,
                original_size_bytes=len(data),
                stored_size_bytes=stored.size,
                storage_class=stored.storage_class,
                document_status="ready",
                document_version=version,
                artifact_type="final",
                finalized_at=now_utc(),
                force_create=previous is not None,
            )
            if previous:
                previous.is_active = False
                previous.updated_at = now_utc()
                self.session.add(previous)
            self.session.commit()
            self.session.refresh(row)
            return row
        except Exception:
            self.session.rollback()
            try:
                backend.delete(key=stored.key, version_id=stored.version_id)
            except Exception:
                pass
            raise
