"""ip multi documents

Revision ID: 20260515_0031
Revises: 20260514_0030
Create Date: 2026-05-15
"""

from alembic import op
import sqlalchemy as sa


revision = "20260515_0031"
down_revision = "20260514_0030"
branch_labels = None
depends_on = None


def _tables() -> set[str]:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    return set(inspector.get_table_names())


def upgrade() -> None:
    if "ipdocument" not in _tables():
        op.create_table(
            "ipdocument",
            sa.Column("id", sa.String(), nullable=False),
            sa.Column("tenant_id", sa.String(), nullable=False),
            sa.Column("branch_id", sa.String(), nullable=False),
            sa.Column("admission_id", sa.String(), nullable=False),
            sa.Column("document_type", sa.String(length=80), nullable=False),
            sa.Column("file_name", sa.String(length=220), nullable=False),
            sa.Column("file_url", sa.String(length=500), nullable=False),
            sa.Column("content_type", sa.String(length=120), nullable=True),
            sa.Column("uploaded_by_user_id", sa.String(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.ForeignKeyConstraint(["admission_id"], ["ipadmission.id"]),
            sa.ForeignKeyConstraint(["branch_id"], ["branch.id"]),
            sa.ForeignKeyConstraint(["tenant_id"], ["tenant.id"]),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index("ix_ipdocument_tenant_id", "ipdocument", ["tenant_id"])
        op.create_index("ix_ipdocument_branch_id", "ipdocument", ["branch_id"])
        op.create_index("ix_ipdocument_admission_id", "ipdocument", ["admission_id"])
        op.create_index("ix_ipdocument_document_type", "ipdocument", ["document_type"])
        op.create_index(
            "ix_ipdocument_uploaded_by_user_id", "ipdocument", ["uploaded_by_user_id"]
        )
        op.create_index("ix_ipdocument_created_at", "ipdocument", ["created_at"])


def downgrade() -> None:
    if "ipdocument" in _tables():
        op.drop_index("ix_ipdocument_created_at", table_name="ipdocument")
        op.drop_index("ix_ipdocument_uploaded_by_user_id", table_name="ipdocument")
        op.drop_index("ix_ipdocument_document_type", table_name="ipdocument")
        op.drop_index("ix_ipdocument_admission_id", table_name="ipdocument")
        op.drop_index("ix_ipdocument_branch_id", table_name="ipdocument")
        op.drop_index("ix_ipdocument_tenant_id", table_name="ipdocument")
        op.drop_table("ipdocument")
