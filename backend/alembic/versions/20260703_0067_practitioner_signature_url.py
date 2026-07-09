"""Add signature_url to practitioner for prescription print."""

import sqlalchemy as sa
from alembic import op


revision = "20260703_0067"
down_revision = "20260701_0066"
branch_labels = None
depends_on = None


def _columns(table_name: str) -> set[str]:
    return {
        column["name"] for column in sa.inspect(op.get_bind()).get_columns(table_name)
    }


def upgrade() -> None:
    # Migration 0001 creates every table/column from the *current* SQLModel
    # definitions (SQLModel.metadata.create_all), so on a fresh database
    # this column already exists by the time this migration runs.
    if "signature_url" not in _columns("practitioner"):
        op.add_column(
            "practitioner",
            sa.Column("signature_url", sa.String(length=500), nullable=True),
        )


def downgrade() -> None:
    if "signature_url" in _columns("practitioner"):
        op.drop_column("practitioner", "signature_url")
