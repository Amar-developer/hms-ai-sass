"""item supplier and purchase cost fields

Revision ID: 20260520_0033
Revises: 20260519_0032
Create Date: 2026-05-20
"""

from alembic import op
import sqlalchemy as sa


revision = "20260520_0033"
down_revision = "20260519_0032"
branch_labels = None
depends_on = None


def _tables() -> set[str]:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    return set(inspector.get_table_names())


def _columns(table_name: str) -> set[str]:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    return {column["name"] for column in inspector.get_columns(table_name)}


def _indexes(table_name: str) -> set[str]:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    return {index["name"] for index in inspector.get_indexes(table_name)}


def _add(table_name: str, column_name: str, column: sa.Column) -> None:
    if table_name in _tables() and column_name not in _columns(table_name):
        op.add_column(table_name, column)


def _create_index(table_name: str, index_name: str, columns: list[str]) -> None:
    if table_name in _tables() and index_name not in _indexes(table_name):
        op.create_index(index_name, table_name, columns)


def _drop_index(table_name: str, index_name: str) -> None:
    if table_name in _tables() and index_name in _indexes(table_name):
        op.drop_index(index_name, table_name=table_name)


def upgrade() -> None:
    for table_name in (
        "medicinecatalog",
        "labtestcatalog",
        "labtestpackage",
        "physiotherapyequipment",
    ):
        _add(
            table_name,
            "supplier_id",
            sa.Column("supplier_id", sa.String(), nullable=True),
        )
        _add(
            table_name,
            "purchase_price",
            sa.Column(
                "purchase_price", sa.Integer(), nullable=False, server_default="0"
            ),
        )
        _create_index(table_name, f"ix_{table_name}_supplier_id", ["supplier_id"])


def downgrade() -> None:
    for table_name in (
        "medicinecatalog",
        "labtestcatalog",
        "labtestpackage",
        "physiotherapyequipment",
    ):
        _drop_index(table_name, f"ix_{table_name}_supplier_id")
        columns = _columns(table_name) if table_name in _tables() else set()
        if "purchase_price" in columns:
            op.drop_column(table_name, "purchase_price")
        if "supplier_id" in columns:
            op.drop_column(table_name, "supplier_id")
