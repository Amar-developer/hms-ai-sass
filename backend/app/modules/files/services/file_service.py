import hashlib
from pathlib import Path

from fastapi import HTTPException, UploadFile, status
from sqlmodel import Session, select
from starlette.concurrency import run_in_threadpool

from app.core.access_control import require_user_branch_access, scoped_branch_id
from app.core.model_update import apply_update_fields
from app.core.config import get_settings
from app.core.uploads import UPLOADS_DIR, read_validated_upload
from app.modules.audit.service import record_audit_event
from app.modules.billing.models import Invoice
from app.modules.files.models import FileDocument
from app.core.pagination import Page
from app.modules.files.optimization import (
    OptimizationError,
    optimize_document,
    select_optimization_profile,
)
from app.modules.files.repositories import FileDocumentRepository
from app.modules.files.schemas import FileDocumentUpdate
from app.modules.files.service import record_file_document
from app.modules.files.storage.factory import (
    get_storage_backend,
    get_storage_backend_for_document,
)
from app.modules.files.storage.keys import build_storage_key
from app.modules.files.storage.local import LocalStorageBackend
from app.modules.identity.models import User
from app.modules.ip.models import IPAdmission
from app.modules.lab.models import LabOrder
from app.modules.patients.models import Patient
from app.modules.physiotherapy.models import PhysiotherapyCase
from app.modules.practitioners.models import Practitioner
from app.modules.settings.models import SettingKey, SettingScope
from app.modules.settings.service import resolve_setting, upsert_setting
from app.modules.tenants.models import Tenant, new_id, now_utc

# Maps an upload filename prefix (without the 12-char id suffix) to the entity
# that owns the file. Order matters: longest prefix first to avoid greedy match.
_UPLOAD_PREFIX_RULES: list[dict] = [
    {
        "prefix": "ip_admission_",
        "model": IPAdmission,
        "category": "admission",
        "source_module": "ip",
        "doctype": "IPAdmission",
        "field": "admission_document_url",
        "label": "Admission Document",
        "folder": "Admissions",
        "patient_attr": "patient_id",
        "branch_attr": "branch_id",
    },
    {
        "prefix": "physio_consent_",
        "model": PhysiotherapyCase,
        "category": "consent",
        "source_module": "physiotherapy",
        "doctype": "PhysiotherapyCase",
        "field": "consent_files_json",
        "label": "Consent Form",
        "folder": "Consents",
        "patient_attr": "patient_id",
        "branch_attr": "branch_id",
    },
    {
        "prefix": "lab_report_",
        "model": LabOrder,
        "category": "lab_report",
        "source_module": "lab",
        "doctype": "LabOrder",
        "field": "report_url",
        "label": "Lab Report",
        "folder": "Lab Reports",
        "patient_attr": "patient_id",
        "branch_attr": "branch_id",
    },
    {
        "prefix": "tenant_logo_",
        "model": Tenant,
        "category": "logo",
        "source_module": "tenants",
        "doctype": "Tenant",
        "field": "logo_url",
        "label": "Tenant Logo",
        "folder": "Branding",
        "patient_attr": None,
        "branch_attr": None,
    },
    {
        "prefix": "practitioner_signature_",
        "model": Practitioner,
        "category": "signature",
        "source_module": "practitioners",
        "doctype": "Practitioner",
        "field": "signature_url",
        "label": "Doctor Signature",
        "folder": "Signatures",
        "patient_attr": None,
        "branch_attr": None,
    },
    {
        "prefix": "patient_",
        "model": Patient,
        "category": "patient_photo",
        "source_module": "patients",
        "doctype": "Patient",
        "field": "photo_url",
        "label": "Patient Photo",
        "folder": "Patients",
        "patient_attr": "id",
        "branch_attr": "branch_id",
    },
    {
        "prefix": "file_",
        "model": Tenant,
        "category": "general",
        "source_module": "tenants",
        "doctype": "Tenant",
        "field": "attachment",
        "label": "Attachment",
        "folder": "General",
        "patient_attr": None,
        "branch_attr": None,
    },
    {
        "prefix": "invoice_",
        "model": Invoice,
        "category": "invoice",
        "source_module": "billing",
        "doctype": "Invoice",
        "field": "invoice_pdf",
        "label": "Invoice PDF",
        "folder": "Invoices",
        "patient_attr": "patient_id",
        "branch_attr": "branch_id",
    },
]


class FileService:
    def __init__(self, session: Session):
        self.session = session
        self.files = FileDocumentRepository(session)

    def _get_or_404(self, tenant_id: str, file_id: str) -> FileDocument:
        row = self.files.get_for_tenant(tenant_id, file_id)
        if not row:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="File not found"
            )
        return row

    @staticmethod
    def _storage_key(row: FileDocument) -> str:
        if row.storage_key:
            return row.storage_key
        if row.file_url.startswith("/uploads/"):
            return row.file_url.removeprefix("/uploads/")
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="File not found"
        )

    @classmethod
    def _stored_content(cls, row: FileDocument) -> Path | bytes:
        backend = get_storage_backend_for_document(row)
        key = cls._storage_key(row)
        if isinstance(backend, LocalStorageBackend):
            resolved = backend.resolve_path(key)
            if not resolved.is_file():
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND, detail="File not found"
                )
            return resolved
        try:
            return backend.get_bytes(key=key)
        except Exception as exc:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="File not found"
            ) from exc

    def _match_upload_to_entity(self, tenant_id: str, filename: str):
        for rule in _UPLOAD_PREFIX_RULES:
            prefix = rule["prefix"]
            if not filename.startswith(prefix):
                continue
            remainder = filename[len(prefix) :]
            # Filename pattern: {prefix}{id_part}_{uuid_hex}{ext}. The id_part is the
            # first 12 chars of the entity id (or the full tenant id for tenant_logo).
            underscore = remainder.find("_")
            if underscore <= 0:
                continue
            id_part = remainder[:underscore]
            statement = select(rule["model"]).where(
                rule["model"].id.like(f"{id_part}%")
            )
            if hasattr(rule["model"], "tenant_id"):
                statement = statement.where(rule["model"].tenant_id == tenant_id)
            entity = self.session.exec(statement).first()
            if not entity:
                continue
            # Tenant model has no tenant_id column; verify the row matches the caller.
            if isinstance(entity, Tenant) and entity.id != tenant_id:
                continue
            return rule, entity
        return None, None

    def _sync_tenant_logo_attachment(
        self,
        row: FileDocument,
        *,
        actor_user_id: str | None,
        overwrite_existing: bool = True,
    ) -> None:
        if row.attached_to_doctype != "Tenant":
            return
        if row.attached_to_name and row.attached_to_name != row.tenant_id:
            return
        field = (row.attached_to_field or "").strip().lower()
        if field not in {"logo_url", "invoice.logo_url", "invoice_logo_url"}:
            return
        tenant = self.session.get(Tenant, row.tenant_id)
        if not tenant:
            return
        if field == "logo_url":
            if overwrite_existing or not tenant.logo_url:
                tenant.logo_url = row.file_url
                tenant.updated_by_user_id = actor_user_id
                tenant.updated_at = now_utc()
                self.session.add(tenant)
            if not overwrite_existing and tenant.logo_url:
                return
        upsert_setting(
            self.session,
            tenant_id=row.tenant_id,
            scope=SettingScope.TENANT,
            scope_id=row.tenant_id,
            module="invoice",
            key=SettingKey.INVOICE_LOGO_URL,
            value=row.file_url,
            actor_user_id=actor_user_id,
        )

    def _sync_practitioner_signature_attachment(
        self, row: FileDocument, *, actor_user_id: str | None
    ) -> None:
        if row.attached_to_doctype != "Practitioner":
            return
        field = (row.attached_to_field or "").strip().lower()
        if field != "signature_url" or not row.attached_to_name:
            return
        practitioner = self.session.get(Practitioner, row.attached_to_name)
        if not practitioner or practitioner.tenant_id != row.tenant_id:
            return
        practitioner.signature_url = row.file_url
        practitioner.updated_at = now_utc()
        self.session.add(practitioner)

    def list_files(
        self,
        *,
        tenant_id: str,
        branch_id: str | None,
        patient_id: str | None,
        category: str | None,
        attached_to_doctype: str | None,
        attached_to_name: str | None,
        q: str | None,
        offset: int = 0,
        limit: int,
        actor: User,
    ) -> list[FileDocument]:
        branch_id = scoped_branch_id(actor, branch_id)
        return self.files.list_active(
            tenant_id=tenant_id,
            branch_id=branch_id,
            patient_id=patient_id,
            category=category,
            attached_to_doctype=attached_to_doctype,
            attached_to_name=attached_to_name,
            q=q,
            offset=offset,
            limit=limit,
        )

    def list_file_page(self, **kwargs) -> Page[FileDocument]:
        actor = kwargs["actor"]
        branch_id = scoped_branch_id(actor, kwargs["branch_id"])
        items = self.list_files(**kwargs)
        total = self.files.count_active(
            tenant_id=kwargs["tenant_id"],
            branch_id=branch_id,
            patient_id=kwargs["patient_id"],
            category=kwargs["category"],
            attached_to_doctype=kwargs["attached_to_doctype"],
            attached_to_name=kwargs["attached_to_name"],
            q=kwargs["q"],
        )
        return Page(
            items=items,
            total=total,
            limit=kwargs["limit"],
            offset=kwargs["offset"],
        )

    def prepare_download(
        self, *, tenant_id: str, file_id: str, actor: User
    ) -> tuple[FileDocument, Path | bytes]:
        """Resolve local or S3 content after tenant and branch authorization."""
        row = self._get_or_404(tenant_id, file_id)
        require_user_branch_access(actor, row.branch_id)
        content = self._stored_content(row)
        record_audit_event(
            self.session,
            tenant_id=tenant_id,
            branch_id=row.branch_id,
            actor_user_id=actor.id,
            action="file.downloaded",
            resource_type="file",
            resource_id=row.id,
            purpose="file_access",
        )
        return row, content

    def prepare_invoice_logo(
        self, *, tenant_id: str, branch_id: str | None, actor: User
    ) -> tuple[FileDocument, Path | bytes]:
        configured, _scope, _scope_id = resolve_setting(
            self.session,
            tenant_id=tenant_id,
            module="invoice",
            key=SettingKey.INVOICE_LOGO_URL,
            branch_id=branch_id,
        )
        configured_url = str(configured or "").strip()
        candidates = self.files.list_active(
            tenant_id=tenant_id,
            category="logo",
            attached_to_doctype="Tenant",
            attached_to_name=tenant_id,
            limit=100,
        )

        def rank(row: FileDocument) -> int:
            if configured_url and row.file_url == configured_url:
                return 0
            field = (row.attached_to_field or "").strip().lower()
            if field in {"invoice.logo_url", "invoice_logo_url"}:
                return 1
            if field == "logo_url":
                return 2
            return 3

        for row in sorted(candidates, key=rank):
            if not (row.content_type or "").lower().startswith("image/"):
                continue
            try:
                return self.prepare_download(
                    tenant_id=tenant_id, file_id=row.id, actor=actor
                )
            except HTTPException as exc:
                if exc.status_code != status.HTTP_404_NOT_FOUND:
                    raise
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Invoice logo not found",
        )

    async def upload_file(
        self,
        *,
        tenant_id: str,
        file: UploadFile,
        branch_id: str | None,
        patient_id: str | None,
        category: str,
        source_module: str | None,
        attached_to_doctype: str | None,
        attached_to_name: str | None,
        attached_to_field: str | None,
        attached_to_label: str | None,
        folder: str | None,
        notes: str | None,
        is_private: bool,
        actor: User,
    ) -> FileDocument:
        require_user_branch_access(actor, branch_id)
        data, verified_content_type, extension = await read_validated_upload(file)
        original_size_bytes = len(data)
        optimization_profile = select_optimization_profile(
            category=category,
            source_module=source_module,
            attached_to_field=attached_to_field,
            content_type=verified_content_type,
        )
        optimization_status = "not_required"
        if optimization_profile and not optimization_profile.preserve_original:
            try:
                # CPU-bound PDF rewrite — off the event loop so it can't stall
                # unrelated in-flight requests on this worker.
                optimized = await run_in_threadpool(
                    lambda: optimize_document(
                        data=data,
                        content_type=verified_content_type,
                        profile=optimization_profile,
                    )
                )
            except OptimizationError as exc:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail=str(exc),
                ) from exc
            data = optimized.data
            verified_content_type = optimized.content_type
            extension = optimized.extension
            optimization_status = "ready" if optimized.changed else "not_required"
        checksum_sha256 = hashlib.sha256(data).hexdigest()
        settings = get_settings()
        backend = get_storage_backend(settings)
        previous = FileDocumentRepository(self.session).find_attachment(
            tenant_id=tenant_id,
            file_url="",
            attached_to_doctype=attached_to_doctype,
            attached_to_name=attached_to_name,
            attached_to_field=attached_to_field,
        )
        document_id = new_id("file")
        document_version = int(previous.document_version or 1) + 1 if previous else 1
        storage_key = build_storage_key(
            environment=settings.environment,
            tenant_id=tenant_id,
            module=source_module,
            document_type=category,
            entity_id=attached_to_name,
            extension=extension,
            prefix=settings.aws_s3_prefix,
        )
        try:
            # Blocking network call (S3) — must not run on the event loop.
            stored_object = await run_in_threadpool(
                lambda: backend.put(
                    key=storage_key,
                    data=data,
                    content_type=verified_content_type,
                    checksum_sha256=checksum_sha256,
                    metadata={
                        "sha256": checksum_sha256,
                        "tenant-id": tenant_id,
                        "document-id": document_id,
                    },
                    tags={
                        "artifact": (
                            "final"
                            if (category or "").strip().lower() == "invoice"
                            else "original"
                        ),
                        "retention": "permanent",
                        "environment": settings.environment,
                    },
                )
            )
        except Exception as exc:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Could not store uploaded file",
            ) from exc
        url_path = (
            f"/uploads/{storage_key}"
            if backend.name == "local"
            else f"/api/v1/files/{document_id}/download"
        )
        try:
            row = record_file_document(
                self.session,
                document_id=document_id,
                tenant_id=tenant_id,
                branch_id=branch_id,
                patient_id=patient_id,
                file_name=file.filename or f"upload{extension}",
                file_url=url_path,
                file_size=stored_object.size,
                # Store the server-verified content type, never the client's header.
                content_type=verified_content_type,
                category=(category or "general").strip().lower()[:80],
                source_module=source_module,
                attached_to_doctype=attached_to_doctype,
                attached_to_name=attached_to_name,
                attached_to_field=attached_to_field,
                attached_to_label=attached_to_label,
                folder=folder,
                notes=notes,
                uploaded_by_user_id=actor.id,
                is_private=is_private,
                storage_backend=backend.name,
                storage_key=stored_object.key,
                storage_bucket=stored_object.bucket,
                storage_region=stored_object.region,
                storage_version_id=stored_object.version_id,
                checksum_sha256=checksum_sha256,
                original_size_bytes=original_size_bytes,
                stored_size_bytes=stored_object.size,
                storage_class=stored_object.storage_class,
                document_status="ready",
                document_version=document_version,
                artifact_type=(
                    "final"
                    if (category or "").strip().lower() == "invoice"
                    else "original"
                ),
                finalized_at=(
                    now_utc() if (category or "").strip().lower() == "invoice" else None
                ),
                optimization_profile=(
                    optimization_profile.name if optimization_profile else None
                ),
                optimization_status=optimization_status,
                force_create=previous is not None,
            )
            if previous:
                previous.is_active = False
                previous.updated_at = now_utc()
                self.session.add(previous)
                for rendition in self.files.list_renditions(
                    tenant_id=tenant_id, original_file_id=previous.id
                ):
                    rendition.is_active = False
                    rendition.updated_at = now_utc()
                    self.session.add(rendition)
            self._sync_tenant_logo_attachment(row, actor_user_id=actor.id)
            self._sync_practitioner_signature_attachment(row, actor_user_id=actor.id)
            self.session.commit()
            self.session.refresh(row)
        except Exception:
            self.session.rollback()
            try:
                backend.delete(
                    key=stored_object.key, version_id=stored_object.version_id
                )
            except Exception:
                pass
            raise
        record_audit_event(
            self.session,
            tenant_id=tenant_id,
            branch_id=branch_id,
            actor_user_id=actor.id,
            action="file.uploaded",
            resource_type="file",
            resource_id=row.id,
            purpose="file_management",
        )
        return row

    def sync_uploads_folder(self, *, tenant_id: str, actor: User) -> list[FileDocument]:
        folder = Path(UPLOADS_DIR)
        if not folder.exists():
            return []
        created_rows: list[FileDocument] = []
        for path in sorted(folder.iterdir()):
            if not path.is_file() or path.name.startswith("."):
                continue
            file_url = f"/uploads/{path.name}"
            existing = self.files.find_by_url(tenant_id=tenant_id, file_url=file_url)
            if existing:
                continue
            rule, entity = self._match_upload_to_entity(tenant_id, path.name)
            if not rule or not entity:
                continue
            patient_id = (
                getattr(entity, rule["patient_attr"], None)
                if rule.get("patient_attr")
                else None
            )
            branch_id = (
                getattr(entity, rule["branch_attr"], None)
                if rule.get("branch_attr")
                else None
            )
            try:
                file_size = path.stat().st_size
            except OSError:
                file_size = None
            suffix = path.suffix.lower().lstrip(".")
            content_type = None
            if suffix in {"png", "jpg", "jpeg", "gif", "webp"}:
                content_type = f"image/{'jpeg' if suffix == 'jpg' else suffix}"
            elif suffix == "pdf":
                content_type = "application/pdf"
            row = record_file_document(
                self.session,
                tenant_id=tenant_id,
                branch_id=branch_id,
                patient_id=patient_id,
                file_name=path.name,
                file_url=file_url,
                content_type=content_type,
                file_size=file_size,
                category=rule["category"],
                source_module=rule["source_module"],
                attached_to_doctype=rule["doctype"],
                attached_to_name=entity.id,
                attached_to_field=rule["field"],
                attached_to_label=rule["label"],
                folder=rule["folder"],
                uploaded_by_user_id=actor.id,
            )
            self._sync_tenant_logo_attachment(
                row, actor_user_id=actor.id, overwrite_existing=False
            )
            self._sync_practitioner_signature_attachment(row, actor_user_id=actor.id)
            created_rows.append(row)
        if created_rows:
            self.session.commit()
            for row in created_rows:
                self.session.refresh(row)
            record_audit_event(
                self.session,
                tenant_id=tenant_id,
                actor_user_id=actor.id,
                action="file.sync_uploads",
                resource_type="file",
                resource_id=tenant_id,
                purpose="file_management",
                metadata_json=f'{{"registered_count": {len(created_rows)}}}',
            )
        return created_rows

    def update_file(
        self,
        *,
        tenant_id: str,
        file_id: str,
        payload: FileDocumentUpdate,
        actor: User,
    ) -> FileDocument:
        row = self._get_or_404(tenant_id, file_id)
        require_user_branch_access(actor, row.branch_id)
        apply_update_fields(row, payload)
        row.updated_at = now_utc()
        self.session.add(row)
        self._sync_tenant_logo_attachment(row, actor_user_id=actor.id)
        self.session.commit()
        self.session.refresh(row)
        record_audit_event(
            self.session,
            tenant_id=tenant_id,
            branch_id=row.branch_id,
            actor_user_id=actor.id,
            action="file.updated",
            resource_type="file",
            resource_id=row.id,
            purpose="file_management",
        )
        return row

    def delete_file(self, *, tenant_id: str, file_id: str, actor: User) -> FileDocument:
        row = self._get_or_404(tenant_id, file_id)
        require_user_branch_access(actor, row.branch_id)
        if row.legal_hold:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="File is protected by legal hold",
            )
        if not row.original_file_id and self.files.has_active_renditions(
            tenant_id=tenant_id, original_file_id=row.id
        ):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Deactivate optimized renditions before deleting the original file",
            )
        row.is_active = False
        row.updated_at = now_utc()
        self.session.add(row)
        self.session.commit()
        self.session.refresh(row)
        # Remove the physical file too, but only when no other active record still
        # points at it, so deleting one duplicate row never breaks another that
        # references the same upload.
        if row.retention_class == "temporary" and (
            row.storage_key or (row.file_url and row.file_url.startswith("/uploads/"))
        ):
            still_referenced = self.files.has_active_reference(
                tenant_id=tenant_id, file_url=row.file_url
            )
            if not still_referenced:
                try:
                    backend = get_storage_backend_for_document(row)
                    backend.delete(
                        key=self._storage_key(row), version_id=row.storage_version_id
                    )
                except Exception:
                    pass
        record_audit_event(
            self.session,
            tenant_id=tenant_id,
            branch_id=row.branch_id,
            actor_user_id=actor.id,
            action="file.deleted",
            resource_type="file",
            resource_id=row.id,
            purpose="file_management",
        )
        return row
