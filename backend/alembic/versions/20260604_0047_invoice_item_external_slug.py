"""invoice item external slug

Revision ID: 20260604_0047
Revises: 20260604_0046
Create Date: 2026-06-04
"""

from alembic import op
import sqlalchemy as sa


revision = "20260604_0047"
down_revision = "20260604_0046"
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


def upgrade() -> None:
    if "invoiceitem" in _tables() and "external_slug" not in _columns("invoiceitem"):
        op.add_column(
            "invoiceitem",
            sa.Column("external_slug", sa.String(length=220), nullable=True),
        )


def downgrade() -> None:
    if "invoiceitem" in _tables() and "external_slug" in _columns("invoiceitem"):
        op.drop_column("invoiceitem", "external_slug")
