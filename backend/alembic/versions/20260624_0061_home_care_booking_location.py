"""Add home care booking location."""

import sqlalchemy as sa
from alembic import op


revision = "20260624_0061"
down_revision = "20260624_0060"
branch_labels = None
depends_on = None


def _columns(table_name: str) -> set[str]:
    return {
        column["name"] for column in sa.inspect(op.get_bind()).get_columns(table_name)
    }


def upgrade() -> None:
    # Migration 0001 creates every table from the *current* SQLModel
    # definitions (SQLModel.metadata.create_all), so on a fresh database
    # this column already exists by the time this migration runs.
    if "location" not in _columns("homecarebooking"):
        op.add_column(
            "homecarebooking",
            sa.Column("location", sa.String(length=500), nullable=True),
        )


def downgrade() -> None:
    if "location" in _columns("homecarebooking"):
        op.drop_column("homecarebooking", "location")
