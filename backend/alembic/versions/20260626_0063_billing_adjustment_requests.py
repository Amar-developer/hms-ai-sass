"""Add billing adjustment request workflow."""

import sqlalchemy as sa
from alembic import op


revision = "20260626_0063"
down_revision = "20260624_0062"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TYPE invoicestatus ADD VALUE IF NOT EXISTS 'PARTIALLY_REFUNDED'")
    op.add_column(
        "payment",
        sa.Column("refunded_amount", sa.Integer(), nullable=False, server_default="0"),
    )
    op.execute(
        "UPDATE payment SET refunded_amount = amount "
        "WHERE status::text IN ('REFUNDED', 'refunded')"
    )
    op.create_table(
        "billingadjustmentrequest",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("tenant_id", sa.String(), nullable=False),
        sa.Column("branch_id", sa.String(), nullable=False),
        sa.Column("invoice_id", sa.String(), nullable=False),
        sa.Column("request_type", sa.String(), nullable=False),
        sa.Column("amount", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("reason", sa.String(length=500), nullable=False),
        sa.Column("status", sa.String(), nullable=False, server_default="pending"),
        sa.Column("requested_by_user_id", sa.String(), nullable=True),
        sa.Column("approved_by_user_id", sa.String(), nullable=True),
        sa.Column("rejected_by_user_id", sa.String(), nullable=True),
        sa.Column("executed_by_user_id", sa.String(), nullable=True),
        sa.Column("decision_reason", sa.String(length=500), nullable=True),
        sa.Column("payment_method", sa.String(), nullable=True),
        sa.Column("payment_reference", sa.String(length=120), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("decided_at", sa.DateTime(), nullable=True),
        sa.Column("executed_at", sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    for column in (
        "tenant_id",
        "branch_id",
        "invoice_id",
        "request_type",
        "status",
        "requested_by_user_id",
        "approved_by_user_id",
        "rejected_by_user_id",
        "executed_by_user_id",
        "created_at",
        "decided_at",
        "executed_at",
    ):
        op.create_index(
            f"ix_billingadjustmentrequest_{column}",
            "billingadjustmentrequest",
            [column],
        )


def downgrade() -> None:
    for column in (
        "executed_at",
        "decided_at",
        "created_at",
        "executed_by_user_id",
        "rejected_by_user_id",
        "approved_by_user_id",
        "requested_by_user_id",
        "status",
        "request_type",
        "invoice_id",
        "branch_id",
        "tenant_id",
    ):
        op.drop_index(
            f"ix_billingadjustmentrequest_{column}",
            table_name="billingadjustmentrequest",
        )
    op.drop_table("billingadjustmentrequest")
    op.drop_column("payment", "refunded_amount")
