"""appointment type enum sync

Revision ID: 20260502_0018
Revises: 20260502_0017
Create Date: 2026-05-02
"""

from alembic import op

revision = "20260502_0018"
down_revision = "20260502_0017"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name != "postgresql":
        return
    with op.get_context().autocommit_block():
        op.execute("ALTER TYPE appointmenttype ADD VALUE IF NOT EXISTS 'DOCTOR_REVIEW'")
        op.execute(
            "ALTER TYPE appointmenttype ADD VALUE IF NOT EXISTS 'FITNESS_CERTIFICATE'"
        )


def downgrade() -> None:
    # PostgreSQL enum values cannot be safely removed in-place.
    pass
