"""Add signature_url to practitioner for prescription print."""

import sqlalchemy as sa
from alembic import op


revision = "20260703_0067"
down_revision = "20260701_0066"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "practitioner",
        sa.Column("signature_url", sa.String(length=500), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("practitioner", "signature_url")
