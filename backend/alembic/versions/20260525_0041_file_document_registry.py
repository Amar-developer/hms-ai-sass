"""Add central file document registry."""

from alembic import op
import sqlalchemy as sa


revision = "20260525_0041"
down_revision = "20260525_0040"
branch_labels = None
depends_on = None


def _tables() -> set[str]:
    return set(sa.inspect(op.get_bind()).get_table_names())


def _create_index(table_name: str, index_name: str, columns: list[str]) -> None:
    indexes = {
        index["name"] for index in sa.inspect(op.get_bind()).get_indexes(table_name)
    }
    if index_name not in indexes:
        op.create_index(index_name, table_name, columns)


def upgrade() -> None:
    if "filedocument" not in _tables():
        op.create_table(
            "filedocument",
            sa.Column("id", sa.String(), nullable=False),
            sa.Column("tenant_id", sa.String(), nullable=False),
            sa.Column("branch_id", sa.String(), nullable=True),
            sa.Column("patient_id", sa.String(), nullable=True),
            sa.Column("file_name", sa.String(length=260), nullable=False),
            sa.Column("file_url", sa.String(length=500), nullable=False),
            sa.Column("content_type", sa.String(length=160), nullable=True),
            sa.Column("file_size", sa.Integer(), nullable=True),
            sa.Column(
                "storage_backend",
                sa.String(length=40),
                nullable=False,
                server_default="local",
            ),
            sa.Column(
                "is_private", sa.Boolean(), nullable=False, server_default=sa.false()
            ),
            sa.Column(
                "category",
                sa.String(length=80),
                nullable=False,
                server_default="general",
            ),
            sa.Column("source_module", sa.String(length=80), nullable=True),
            sa.Column("attached_to_doctype", sa.String(length=120), nullable=True),
            sa.Column("attached_to_name", sa.String(length=160), nullable=True),
            sa.Column("attached_to_field", sa.String(length=120), nullable=True),
            sa.Column("attached_to_label", sa.String(length=180), nullable=True),
            sa.Column("folder", sa.String(length=180), nullable=True),
            sa.Column("notes", sa.String(length=1000), nullable=True),
            sa.Column("uploaded_by_user_id", sa.String(), nullable=True),
            sa.Column(
                "is_active", sa.Boolean(), nullable=False, server_default=sa.true()
            ),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
            sa.ForeignKeyConstraint(["tenant_id"], ["tenant.id"]),
            sa.ForeignKeyConstraint(["branch_id"], ["branch.id"]),
            sa.ForeignKeyConstraint(["patient_id"], ["patient.id"]),
            sa.PrimaryKeyConstraint("id"),
        )
    for column in [
        "tenant_id",
        "branch_id",
        "patient_id",
        "file_name",
        "file_url",
        "content_type",
        "storage_backend",
        "is_private",
        "category",
        "source_module",
        "attached_to_doctype",
        "attached_to_name",
        "attached_to_field",
        "folder",
        "uploaded_by_user_id",
        "is_active",
        "created_at",
    ]:
        _create_index("filedocument", f"ix_filedocument_{column}", [column])

    bind = op.get_bind()
    tables = _tables()
    if bind.dialect.name == "postgresql" and "tenant" in tables:
        op.execute(
            sa.text(
                """
                insert into filedocument (
                    id, tenant_id, branch_id, patient_id, file_name, file_url, category, source_module,
                    attached_to_doctype, attached_to_name, attached_to_field, attached_to_label,
                    storage_backend, is_private, is_active, created_at, updated_at
                )
                select concat('file_', md5(concat('tenant_logo:', id, ':', logo_url))),
                       id, null, null, coalesce(nullif(split_part(logo_url, '/', 3), ''), 'Tenant Logo'),
                       logo_url, 'logo', 'tenants', 'Tenant', id, 'logo_url', 'Tenant Logo',
                       'local', false, true, created_at, updated_at
                from tenant
                where logo_url is not null and logo_url <> ''
                on conflict (id) do nothing
                """
            )
        )
    if bind.dialect.name == "postgresql" and "patient" in tables:
        op.execute(
            sa.text(
                """
                insert into filedocument (
                    id, tenant_id, branch_id, patient_id, file_name, file_url, category, source_module,
                    attached_to_doctype, attached_to_name, attached_to_field, attached_to_label,
                    storage_backend, is_private, is_active, created_at, updated_at
                )
                select concat('file_', md5(concat('patient_photo:', id, ':', photo_url))),
                       tenant_id, branch_id, id, coalesce(photo_file_name, 'Patient Photo'),
                       photo_url, 'patient_photo', 'patients', 'Patient', id, 'photo_url', 'Patient Photo',
                       'local', false, true, created_at, updated_at
                from patient
                where photo_url is not null and photo_url <> ''
                on conflict (id) do nothing
                """
            )
        )
    if bind.dialect.name == "postgresql" and "ipdocument" in tables:
        op.execute(
            sa.text(
                """
                insert into filedocument (
                    id, tenant_id, branch_id, patient_id, file_name, file_url, content_type, category, source_module,
                    attached_to_doctype, attached_to_name, attached_to_field, attached_to_label,
                    storage_backend, is_private, is_active, created_at, updated_at
                )
                select concat('file_', md5(concat('ip_doc:', id, ':', file_url))),
                       tenant_id, branch_id, null, file_name, file_url, content_type,
                       document_type, 'ip', 'IPAdmission', admission_id, document_type, document_type,
                       'local', false, true, created_at, created_at
                from ipdocument
                where file_url is not null and file_url <> ''
                on conflict (id) do nothing
                """
            )
        )
    if bind.dialect.name == "postgresql" and "ipadmission" in tables:
        op.execute(
            sa.text(
                """
                insert into filedocument (
                    id, tenant_id, branch_id, patient_id, file_name, file_url, category, source_module,
                    attached_to_doctype, attached_to_name, attached_to_field, attached_to_label,
                    storage_backend, is_private, is_active, created_at, updated_at
                )
                select concat('file_', md5(concat('ip_admission_doc:', id, ':', admission_document_url))),
                       tenant_id, branch_id, patient_id, coalesce(admission_document_name, 'Admission Document'),
                       admission_document_url, 'admission', 'ip', 'IPAdmission', id, 'admission_document_url', 'Admission Document',
                       'local', false, true, coalesce(admission_document_uploaded_at, created_at), updated_at
                from ipadmission
                where admission_document_url is not null and admission_document_url <> ''
                on conflict (id) do nothing
                """
            )
        )


def downgrade() -> None:
    pass
