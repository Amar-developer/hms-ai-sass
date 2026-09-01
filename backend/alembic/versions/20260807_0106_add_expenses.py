"""Add the expense table for the expenses module."""

import sqlalchemy as sa
from alembic import op


revision = "20260807_0106"
down_revision = "20260810_0111"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "expense" in inspector.get_table_names():
        return
    op.create_table(
        "expense",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("tenant_id", sa.String(), nullable=False),
        sa.Column("branch_id", sa.String(), nullable=True),
        sa.Column("category", sa.String(length=20), nullable=False),
        sa.Column("amount", sa.Numeric(12, 2), nullable=False),
        sa.Column(
            "currency", sa.String(length=3), nullable=False, server_default="INR"
        ),
        sa.Column("incurred_on", sa.Date(), nullable=False),
        sa.Column("description", sa.String(length=500), nullable=False),
        sa.Column(
            "status", sa.String(length=20), nullable=False, server_default="pending"
        ),
        sa.Column("submitted_by", sa.String(), nullable=False),
        sa.Column("approved_by", sa.String(), nullable=True),
        sa.Column("rejection_reason", sa.String(length=500), nullable=True),
        sa.Column("receipt_file_id", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_expense_tenant_id", "expense", ["tenant_id"])
    op.create_index("ix_expense_branch_id", "expense", ["branch_id"])
    op.create_index("ix_expense_status", "expense", ["status"])
    op.create_index("ix_expense_submitted_by", "expense", ["submitted_by"])
    op.create_index("ix_expense_tenant_status", "expense", ["tenant_id", "status"])
    op.create_index(
        "ix_expense_tenant_incurred_on", "expense", ["tenant_id", "incurred_on"]
    )


def downgrade() -> None:
    op.drop_table("expense")
