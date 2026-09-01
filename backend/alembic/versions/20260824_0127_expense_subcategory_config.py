"""Add expense subcategory config table and expense quantity column."""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "20260824_0127"
down_revision = "20260824_0126"
branch_labels = None
depends_on = None


def _table_exists(table_name: str) -> bool:
    return sa.inspect(op.get_bind()).has_table(table_name)


def _column_exists(table_name: str, column_name: str) -> bool:
    return any(
        column["name"] == column_name
        for column in sa.inspect(op.get_bind()).get_columns(table_name)
    )


def _index_exists(table_name: str, index_name: str) -> bool:
    return any(
        index["name"] == index_name
        for index in sa.inspect(op.get_bind()).get_indexes(table_name)
    )


def upgrade() -> None:
    if _table_exists("expense") and not _column_exists("expense", "quantity"):
        op.add_column(
            "expense", sa.Column("quantity", sa.Numeric(12, 2), nullable=True)
        )

    if not _table_exists("expensesubcategory"):
        op.create_table(
            "expensesubcategory",
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column("tenant_id", sa.String(), nullable=False),
            sa.Column("category", sa.String(), nullable=False),
            sa.Column("name", sa.String(length=100), nullable=False),
            sa.Column("default_amount", sa.Numeric(12, 2), nullable=True),
            sa.Column(
                "requires_quantity",
                sa.Boolean(),
                nullable=False,
                server_default=sa.false(),
            ),
            sa.Column(
                "is_active", sa.Boolean(), nullable=False, server_default=sa.true()
            ),
            sa.Column("created_by_user_id", sa.String(), nullable=True),
            sa.Column("updated_by_user_id", sa.String(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
        )
        op.create_index(
            "ix_expensesubcategory_tenant_id", "expensesubcategory", ["tenant_id"]
        )
        op.create_index(
            "ix_expensesubcategory_category", "expensesubcategory", ["category"]
        )
        op.create_index("ix_expensesubcategory_name", "expensesubcategory", ["name"])
        op.create_index(
            "ix_expensesubcategory_is_active", "expensesubcategory", ["is_active"]
        )
        op.create_index(
            "ix_expensesubcategory_created_by_user_id",
            "expensesubcategory",
            ["created_by_user_id"],
        )
        op.create_index(
            "ix_expensesubcategory_updated_by_user_id",
            "expensesubcategory",
            ["updated_by_user_id"],
        )
        op.create_index(
            "ix_expsubcat_tenant_category",
            "expensesubcategory",
            ["tenant_id", "category"],
        )


def downgrade() -> None:
    if _table_exists("expensesubcategory"):
        op.drop_table("expensesubcategory")
    if _table_exists("expense") and _column_exists("expense", "quantity"):
        op.drop_column("expense", "quantity")
