"""Add immutable document artifact and optimization metadata."""

import sqlalchemy as sa
from alembic import op


revision = "20260729_0099"
down_revision = "20260729_0098"
branch_labels = None
depends_on = None


def upgrade() -> None:
    columns = {
        "document_version": sa.Column(
            "document_version", sa.Integer(), nullable=False, server_default="1"
        ),
        "artifact_type": sa.Column(
            "artifact_type",
            sa.String(length=40),
            nullable=False,
            server_default="original",
        ),
        "original_file_id": sa.Column(
            "original_file_id",
            sa.String(),
            sa.ForeignKey("filedocument.id"),
            nullable=True,
        ),
        "finalized_at": sa.Column("finalized_at", sa.DateTime(), nullable=True),
        "optimization_profile": sa.Column(
            "optimization_profile", sa.String(length=80), nullable=True
        ),
        "optimization_status": sa.Column(
            "optimization_status",
            sa.String(length=40),
            nullable=False,
            server_default="not_required",
        ),
    }
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_columns = {
        column["name"] for column in inspector.get_columns("filedocument")
    }
    for name, column in columns.items():
        if name not in existing_columns:
            op.add_column("filedocument", column)

    inspector = sa.inspect(bind)
    existing_indexes = {
        index["name"] for index in inspector.get_indexes("filedocument")
    }
    for column_name in (
        "document_version",
        "artifact_type",
        "original_file_id",
        "finalized_at",
        "optimization_profile",
        "optimization_status",
    ):
        index_name = f"ix_filedocument_{column_name}"
        if index_name not in existing_indexes:
            op.create_index(index_name, "filedocument", [column_name])

    if "ix_file_attachment_artifact" not in existing_indexes:
        op.create_index(
            "ix_file_attachment_artifact",
            "filedocument",
            [
                "tenant_id",
                "attached_to_doctype",
                "attached_to_name",
                "artifact_type",
            ],
        )

    unique_constraints = {
        item["name"] for item in sa.inspect(bind).get_unique_constraints("filedocument")
    }
    if "uq_file_rendition_version" not in unique_constraints:
        op.create_unique_constraint(
            "uq_file_rendition_version",
            "filedocument",
            ["tenant_id", "original_file_id", "artifact_type", "document_version"],
        )


def downgrade() -> None:
    op.drop_constraint("uq_file_rendition_version", "filedocument", type_="unique")
    op.drop_index("ix_file_attachment_artifact", table_name="filedocument")
    for column_name in (
        "optimization_status",
        "optimization_profile",
        "finalized_at",
        "original_file_id",
        "artifact_type",
        "document_version",
    ):
        op.drop_index(f"ix_filedocument_{column_name}", table_name="filedocument")
        op.drop_column("filedocument", column_name)
