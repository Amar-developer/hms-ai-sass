import hashlib
from pathlib import Path

from fastapi import HTTPException, status
from sqlmodel import Session

from app.core.access_control import require_user_branch_access
from app.core.config import get_settings
from app.core import uploads as uploads_module
from app.modules.audit.service import record_audit_event
from app.modules.files.models import FileDocument
from app.modules.files.optimization import (
    OptimizationError,
    optimize_document,
    select_optimization_profile,
)
from app.modules.files.repositories import FileDocumentRepository
from app.modules.files.schemas import FileOptimizationRead
from app.modules.files.service import record_file_document
from app.modules.files.storage.factory import (
    get_storage_backend,
    get_storage_backend_for_document,
)
from app.modules.files.storage.keys import build_storage_key
from app.modules.identity.models import User
from app.modules.tenants.models import new_id, now_utc


def _original_row(
    repository: FileDocumentRepository, *, tenant_id: str, file_id: str
) -> FileDocument:
    row = repository.get_for_tenant(tenant_id, file_id)
    if not row or not row.is_active:
        raise HTTPException(status_code=404, detail="File not found")
    if row.original_file_id:
        original = repository.get_for_tenant(tenant_id, row.original_file_id)
        if not original or not original.is_active:
            raise HTTPException(status_code=404, detail="Original file not found")
        return original
    return row


def _read_file_bytes(row: FileDocument) -> bytes:
    if row.file_url.startswith("private://"):
        filename = row.file_url.removeprefix("private://")
        if not filename or "/" in filename or "\\" in filename:
            raise HTTPException(status_code=404, detail="File not found")
        path = (uploads_module.PRIVATE_UPLOADS_DIR / filename).resolve()
        try:
            path.relative_to(uploads_module.PRIVATE_UPLOADS_DIR.resolve())
        except ValueError as exc:
            raise HTTPException(status_code=404, detail="File not found") from exc
        if not path.is_file():
            raise HTTPException(status_code=404, detail="File not found")
        return path.read_bytes()
    key = row.storage_key
    if not key and row.file_url.startswith("/uploads/"):
        key = row.file_url.removeprefix("/uploads/")
    if not key:
        raise HTTPException(status_code=404, detail="File not found")
    try:
        return get_storage_backend_for_document(row).get_bytes(key=key)
    except Exception as exc:
        raise HTTPException(status_code=404, detail="File not found") from exc


def _optimization_read(
    original: FileDocument, delivery: FileDocument | None = None
) -> FileOptimizationRead:
    selected = delivery or original
    original_size = int(
        original.original_size_bytes or original.file_size or selected.file_size or 0
    )
    stored_size = int(selected.stored_size_bytes or selected.file_size or original_size)
    saved = max(original_size - stored_size, 0)
    reduction = round((saved / original_size) * 100, 2) if original_size else 0.0
    return FileOptimizationRead(
        original_file_id=original.id,
        delivery_file_id=selected.id,
        status=original.optimization_status,
        profile=original.optimization_profile,
        original_size_bytes=original_size,
        stored_size_bytes=stored_size,
        saved_bytes=saved,
        reduction_percent=reduction,
    )


class FileOptimizationService:
    def __init__(self, session: Session):
        self.session = session
        self.files = FileDocumentRepository(session)

    def list_renditions(
        self, *, tenant_id: str, file_id: str, actor: User
    ) -> list[FileDocument]:
        original = _original_row(self.files, tenant_id=tenant_id, file_id=file_id)
        require_user_branch_access(actor, original.branch_id)
        return [
            original,
            *self.files.list_renditions(
                tenant_id=tenant_id, original_file_id=original.id
            ),
        ]

    def read_status(
        self, *, tenant_id: str, file_id: str, actor: User
    ) -> FileOptimizationRead:
        original = _original_row(self.files, tenant_id=tenant_id, file_id=file_id)
        require_user_branch_access(actor, original.branch_id)
        delivery = self.files.find_ready_rendition(
            tenant_id=tenant_id, original_file_id=original.id
        )
        return _optimization_read(original, delivery)

    def optimize_file(
        self, *, tenant_id: str, file_id: str, actor: User
    ) -> FileOptimizationRead:
        original = _original_row(self.files, tenant_id=tenant_id, file_id=file_id)
        require_user_branch_access(actor, original.branch_id)
        existing = self.files.find_ready_rendition(
            tenant_id=tenant_id, original_file_id=original.id
        )
        if existing:
            return _optimization_read(original, existing)
        if original.optimization_status == "processing":
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="File optimization is already in progress",
            )

        profile = select_optimization_profile(
            category=original.category,
            source_module=original.source_module,
            attached_to_field=original.attached_to_field,
            content_type=original.content_type,
        )
        if not profile:
            original.optimization_status = "not_required"
            original.optimization_profile = None
            original.updated_at = now_utc()
            self.session.add(original)
            self.session.commit()
            self.session.refresh(original)
            return _optimization_read(original)
        if (
            profile.name == "invoice_pdf"
            and original.optimization_profile == profile.name
            and original.optimization_status in {"ready", "not_required"}
        ):
            return _optimization_read(original)

        original.optimization_status = "processing"
        original.optimization_profile = profile.name
        original.updated_at = now_utc()
        self.session.add(original)
        self.session.commit()
        self.session.refresh(original)

        stored_object = None
        backend = None
        try:
            source = _read_file_bytes(original)
            result = optimize_document(
                data=source,
                content_type=original.content_type or "application/octet-stream",
                profile=profile,
            )
            if not result.changed:
                original.optimization_status = "not_required"
                original.original_size_bytes = len(source)
                original.stored_size_bytes = len(source)
                original.updated_at = now_utc()
                self.session.add(original)
                self.session.commit()
                self.session.refresh(original)
                return _optimization_read(original)

            settings = get_settings()
            backend = get_storage_backend(settings)
            delivery_id = new_id("file")
            storage_key = build_storage_key(
                environment=settings.environment,
                tenant_id=tenant_id,
                module=original.source_module,
                document_type=f"{original.category}-delivery",
                entity_id=original.attached_to_name or original.id,
                extension=result.extension,
                prefix=settings.aws_s3_prefix,
            )
            checksum = hashlib.sha256(result.data).hexdigest()
            stored_object = backend.put(
                key=storage_key,
                data=result.data,
                content_type=result.content_type,
                checksum_sha256=checksum,
                metadata={
                    "sha256": checksum,
                    "tenant-id": tenant_id,
                    "document-id": delivery_id,
                    "original-file-id": original.id,
                    "artifact-type": "delivery",
                },
                tags={
                    "artifact": "delivery",
                    "retention": "permanent",
                    "environment": settings.environment,
                },
            )
            file_name = f"{Path(original.file_name).stem}-optimized{result.extension}"
            file_url = (
                f"/uploads/{stored_object.key}"
                if backend.name == "local"
                else f"/api/v1/files/{delivery_id}/download"
            )
            delivery = record_file_document(
                self.session,
                document_id=delivery_id,
                tenant_id=tenant_id,
                branch_id=original.branch_id,
                patient_id=original.patient_id,
                file_name=file_name,
                file_url=file_url,
                content_type=result.content_type,
                file_size=stored_object.size,
                category=f"{original.category}_delivery",
                source_module=original.source_module,
                attached_to_doctype=original.attached_to_doctype,
                attached_to_name=original.attached_to_name,
                attached_to_field=original.attached_to_field,
                attached_to_label=f"{original.attached_to_label or 'Document'} Delivery",
                folder=original.folder,
                notes="Optimized delivery rendition",
                uploaded_by_user_id=actor.id,
                is_private=True,
                storage_backend=backend.name,
                storage_key=stored_object.key,
                storage_bucket=stored_object.bucket,
                storage_region=stored_object.region,
                storage_version_id=stored_object.version_id,
                checksum_sha256=checksum,
                original_size_bytes=len(source),
                stored_size_bytes=stored_object.size,
                storage_class=stored_object.storage_class,
                document_status="ready",
                document_version=self.files.next_rendition_version(
                    tenant_id=tenant_id,
                    original_file_id=original.id,
                    minimum=original.document_version,
                ),
                artifact_type="delivery",
                original_file_id=original.id,
                finalized_at=now_utc(),
                optimization_profile=result.profile,
                optimization_status="ready",
                force_create=True,
            )
            original.optimization_status = "ready"
            original.original_size_bytes = len(source)
            original.optimization_profile = result.profile
            original.updated_at = now_utc()
            self.session.add(original)
            self.session.commit()
            self.session.refresh(original)
            self.session.refresh(delivery)
            record_audit_event(
                self.session,
                tenant_id=tenant_id,
                branch_id=original.branch_id,
                actor_user_id=actor.id,
                action="file.optimized",
                resource_type="file",
                resource_id=original.id,
                purpose="document_delivery_optimization",
            )
            return _optimization_read(original, delivery)
        except HTTPException:
            self.session.rollback()
            raise
        except (OptimizationError, OSError, ValueError) as exc:
            self.session.rollback()
            original.optimization_status = "failed"
            original.updated_at = now_utc()
            self.session.add(original)
            self.session.commit()
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=str(exc),
            ) from exc
        except Exception as exc:
            self.session.rollback()
            original.optimization_status = "failed"
            original.updated_at = now_utc()
            self.session.add(original)
            self.session.commit()
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Could not optimize file",
            ) from exc
        finally:
            if stored_object and backend and original.optimization_status != "ready":
                try:
                    backend.delete(
                        key=stored_object.key, version_id=stored_object.version_id
                    )
                except Exception:
                    pass
