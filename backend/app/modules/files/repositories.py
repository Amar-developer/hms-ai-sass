from sqlmodel import Session, select
from sqlalchemy import or_

from app.modules.files.models import FileDocument


class FileDocumentRepository:
    def __init__(self, session: Session):
        self.session = session

    def get_for_tenant(self, tenant_id: str, file_id: str) -> FileDocument | None:
        row = self.session.get(FileDocument, file_id)
        if not row or row.tenant_id != tenant_id:
            return None
        return row

    def find_attachment(
        self,
        *,
        tenant_id: str,
        file_url: str,
        attached_to_doctype: str | None,
        attached_to_name: str | None,
        attached_to_field: str | None,
    ) -> FileDocument | None:
        statement = select(FileDocument).where(FileDocument.tenant_id == tenant_id)
        if attached_to_doctype and attached_to_name and attached_to_field:
            statement = statement.where(
                FileDocument.attached_to_doctype == attached_to_doctype,
                FileDocument.attached_to_name == attached_to_name,
                FileDocument.attached_to_field == attached_to_field,
            )
        else:
            statement = statement.where(FileDocument.file_url == file_url)
        return self.session.exec(statement).first()

    def find_by_url(self, *, tenant_id: str, file_url: str) -> FileDocument | None:
        return self.session.exec(
            select(FileDocument).where(
                FileDocument.tenant_id == tenant_id,
                FileDocument.file_url == file_url,
            )
        ).first()

    def has_active_reference(self, *, tenant_id: str, file_url: str) -> bool:
        return (
            self.session.exec(
                select(FileDocument).where(
                    FileDocument.tenant_id == tenant_id,
                    FileDocument.file_url == file_url,
                    FileDocument.is_active == True,  # noqa: E712
                )
            ).first()
            is not None
        )

    def list_active(
        self,
        *,
        tenant_id: str,
        branch_id: str | None = None,
        patient_id: str | None = None,
        category: str | None = None,
        attached_to_doctype: str | None = None,
        attached_to_name: str | None = None,
        q: str | None = None,
        limit: int = 100,
    ) -> list[FileDocument]:
        statement = select(FileDocument).where(
            FileDocument.tenant_id == tenant_id,
            FileDocument.is_active == True,  # noqa: E712
        )
        if branch_id:
            statement = statement.where(FileDocument.branch_id == branch_id)
        if patient_id:
            statement = statement.where(FileDocument.patient_id == patient_id)
        if category:
            statement = statement.where(FileDocument.category == category)
        if attached_to_doctype:
            statement = statement.where(
                FileDocument.attached_to_doctype == attached_to_doctype
            )
        if attached_to_name:
            statement = statement.where(
                FileDocument.attached_to_name == attached_to_name
            )
        if q:
            pattern = f"%{q.strip().lower()}%"
            statement = statement.where(
                or_(
                    FileDocument.file_name.ilike(pattern),
                    FileDocument.file_url.ilike(pattern),
                    FileDocument.category.ilike(pattern),
                    FileDocument.source_module.ilike(pattern),
                    FileDocument.attached_to_doctype.ilike(pattern),
                    FileDocument.attached_to_name.ilike(pattern),
                    FileDocument.notes.ilike(pattern),
                )
            )
        return list(
            self.session.exec(
                statement.order_by(FileDocument.created_at.desc()).limit(limit)
            ).all()
        )
