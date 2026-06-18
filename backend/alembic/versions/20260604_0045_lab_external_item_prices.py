"""lab external item pricing fields

Revision ID: 20260604_0045
Revises: 20260604_0044
Create Date: 2026-06-04
"""

from alembic import op
import sqlalchemy as sa


revision = "20260604_0045"
down_revision = "20260604_0044"
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


def _drop(table_name: str, column_name: str) -> None:
    if table_name in _tables() and column_name in _columns(table_name):
        op.drop_column(table_name, column_name)


def _create_index(table_name: str, index_name: str, columns: list[str]) -> None:
    if table_name in _tables() and index_name not in _indexes(table_name):
        op.create_index(index_name, table_name, columns)


def _drop_index(table_name: str, index_name: str) -> None:
    if table_name in _tables() and index_name in _indexes(table_name):
        op.drop_index(index_name, table_name=table_name)


def upgrade() -> None:
    for table_name in ("laborderitem", "invoiceitem"):
        _add(
            table_name,
            "mrp_price" if table_name == "laborderitem" else "mrp_amount",
            sa.Column(
                "mrp_price" if table_name == "laborderitem" else "mrp_amount",
                sa.Integer(),
                nullable=False,
                server_default="0",
            ),
        )
        _add(
            table_name,
            "selling_price" if table_name == "laborderitem" else "selling_amount",
            sa.Column(
                "selling_price" if table_name == "laborderitem" else "selling_amount",
                sa.Integer(),
                nullable=False,
                server_default="0",
            ),
        )
        _add(
            table_name,
            "buying_price" if table_name == "laborderitem" else "buying_amount",
            sa.Column(
                "buying_price" if table_name == "laborderitem" else "buying_amount",
                sa.Integer(),
                nullable=False,
                server_default="0",
            ),
        )
        _add(
            table_name,
            "supplier_id",
            sa.Column("supplier_id", sa.String(), nullable=True),
        )
        _add(
            table_name,
            "external_source",
            sa.Column("external_source", sa.String(length=80), nullable=True),
        )
        _add(
            table_name,
            "external_item_code",
            sa.Column("external_item_code", sa.String(length=220), nullable=True),
        )
        _create_index(table_name, f"ix_{table_name}_supplier_id", ["supplier_id"])
    _add(
        "laborderitem",
        "external_slug",
        sa.Column("external_slug", sa.String(length=220), nullable=True),
    )


def downgrade() -> None:
    for table_name in ("laborderitem", "invoiceitem"):
        _drop_index(table_name, f"ix_{table_name}_supplier_id")
        for column_name in (
            "mrp_price" if table_name == "laborderitem" else "mrp_amount",
            "selling_price" if table_name == "laborderitem" else "selling_amount",
            "buying_price" if table_name == "laborderitem" else "buying_amount",
            "supplier_id",
            "external_source",
            "external_item_code",
        ):
            _drop(table_name, column_name)
    _drop("laborderitem", "external_slug")
