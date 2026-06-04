"""pharmacy issue billed status

Revision ID: 20260604_0046
Revises: 20260604_0045
Create Date: 2026-06-04
"""

from alembic import op


revision = "20260604_0046"
down_revision = "20260604_0045"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.execute("ALTER TYPE pharmacyissuestatus ADD VALUE IF NOT EXISTS 'BILLED'")


def downgrade() -> None:
    # PostgreSQL enum values cannot be safely removed in-place.
    pass
