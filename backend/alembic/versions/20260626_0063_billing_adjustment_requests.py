"""Add billing adjustment request workflow."""

import sqlalchemy as sa
from alembic import op


revision = "20260626_0063"
down_revision = "20260624_0062"
branch_labels = None
depends_on = None


def _tables() -> set[str]:
    return set(sa.inspect(op.get_bind()).get_table_names())


def _columns(table_name: str) -> set[str]:
    return {
        column["name"] for column in sa.inspect(op.get_bind()).get_columns(table_name)
    }


def _indexes(table_name: str) -> set[str]:
    return {
        index["name"] for index in sa.inspect(op.get_bind()).get_indexes(table_name)
    }


def upgrade() -> None:
    op.execute("ALTER TYPE invoicestatus ADD VALUE IF NOT EXISTS 'PARTIALLY_REFUNDED'")
    # Migration 0001 creates every table/column from the *current* SQLModel
    # definitions (SQLModel.metadata.create_all), so on a fresh database
    # payment.refunded_amount and billingadjustmentrequest already exist by
    # the time this migration runs.
    if "refunded_amount" not in _columns("payment"):
        op.add_column(
            "payment",
            sa.Column(
                "refunded_amount", sa.Integer(), nullable=False, server_default="0"
            ),
        )
    op.execute(
        "UPDATE payment SET refunded_amount = amount "
        "WHERE status::text IN ('REFUNDED', 'refunded')"
    )
    if "billingadjustmentrequest" not in _tables():
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
    existing_indexes = (
        _indexes("billingadjustmentrequest")
        if "billingadjustmentrequest" in _tables()
        else set()
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
        index_name = f"ix_billingadjustmentrequest_{column}"
        if index_name not in existing_indexes:
            op.create_index(index_name, "billingadjustmentrequest", [column])


def downgrade() -> None:
    if "billingadjustmentrequest" in _tables():
        existing_indexes = _indexes("billingadjustmentrequest")
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
            index_name = f"ix_billingadjustmentrequest_{column}"
            if index_name in existing_indexes:
                op.drop_index(index_name, table_name="billingadjustmentrequest")
        op.drop_table("billingadjustmentrequest")
    if "refunded_amount" in _columns("payment"):
        op.drop_column("payment", "refunded_amount")
