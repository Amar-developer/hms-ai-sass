"""Persist membership benefit price breakdown.

Revision ID: 20260715_0078
Revises: 20260714_0077
"""

from alembic import op
import sqlalchemy as sa


revision = "20260715_0078"
down_revision = "20260714_0077"
branch_labels = None
depends_on = None

COLUMNS = (
    "membership_free_items_amount",
    "membership_item_discount_amount",
    "membership_regular_items_amount",
)


def _columns() -> set[str]:
    return {
        column["name"] for column in sa.inspect(op.get_bind()).get_columns("invoice")
    }


def upgrade() -> None:
    # Migration 0001 creates tables from the current SQLModel metadata, so a
    # fresh database already has these columns when it reaches this revision.
    # Older deployed databases still need whichever columns are absent.
    existing = _columns()
    for column_name in COLUMNS:
        if column_name not in existing:
            op.add_column(
                "invoice",
                sa.Column(
                    column_name,
                    sa.Integer(),
                    nullable=False,
                    server_default="0",
                ),
            )


def downgrade() -> None:
    existing = _columns()
    for column_name in reversed(COLUMNS):
        if column_name in existing:
            op.drop_column("invoice", column_name)
