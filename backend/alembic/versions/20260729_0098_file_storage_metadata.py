"""Add object-storage metadata to file documents."""

import sqlalchemy as sa
from alembic import op


revision = "20260729_0098"
down_revision = "20260727_0097"
branch_labels = None
depends_on = None


def upgrade() -> None:
    columns = {
        "storage_key": sa.Column("storage_key", sa.String(length=500), nullable=True),
        "storage_bucket": sa.Column(
            "storage_bucket", sa.String(length=160), nullable=True
        ),
        "storage_region": sa.Column(
            "storage_region", sa.String(length=80), nullable=True
        ),
        "storage_version_id": sa.Column(
            "storage_version_id", sa.String(length=260), nullable=True
        ),
        "checksum_sha256": sa.Column(
            "checksum_sha256", sa.String(length=64), nullable=True
        ),
        "original_size_bytes": sa.Column(
            "original_size_bytes", sa.BigInteger(), nullable=True
        ),
        "stored_size_bytes": sa.Column(
            "stored_size_bytes", sa.BigInteger(), nullable=True
        ),
        "storage_class": sa.Column(
            "storage_class", sa.String(length=40), nullable=True
        ),
        "document_status": sa.Column(
            "document_status",
            sa.String(length=40),
            nullable=False,
            server_default="ready",
        ),
    }
    bind = op.get_bind()
    existing = {
        column["name"] for column in sa.inspect(bind).get_columns("filedocument")
    }
    for name, column in columns.items():
        if name not in existing:
            op.add_column("filedocument", column)

    indexes = {index["name"] for index in sa.inspect(bind).get_indexes("filedocument")}
    for column_name in (
        "storage_key",
        "storage_bucket",
        "checksum_sha256",
        "storage_class",
        "document_status",
    ):
        index_name = f"ix_filedocument_{column_name}"
        if index_name not in indexes:
            op.create_index(index_name, "filedocument", [column_name])


def downgrade() -> None:
    for column_name in (
        "document_status",
        "storage_class",
        "checksum_sha256",
        "storage_bucket",
        "storage_key",
    ):
        op.drop_index(f"ix_filedocument_{column_name}", table_name="filedocument")
    for column_name in (
        "document_status",
        "storage_class",
        "stored_size_bytes",
        "original_size_bytes",
        "checksum_sha256",
        "storage_version_id",
        "storage_region",
        "storage_bucket",
        "storage_key",
    ):
        op.drop_column("filedocument", column_name)
