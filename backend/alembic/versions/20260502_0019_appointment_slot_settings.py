"""appointment slot settings enum sync

Revision ID: 20260502_0019
Revises: 20260502_0018
Create Date: 2026-05-02
"""

from alembic import op

revision = "20260502_0019"
down_revision = "20260502_0018"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name != "postgresql":
        return
    with op.get_context().autocommit_block():
        op.execute(
            "ALTER TYPE settingkey ADD VALUE IF NOT EXISTS 'APPOINTMENT_SLOT_INTERVALS_ENABLED'"
        )
        op.execute(
            "ALTER TYPE settingkey ADD VALUE IF NOT EXISTS 'APPOINTMENT_SLOT_INTERVAL_MINUTES'"
        )


def downgrade() -> None:
    # PostgreSQL enum values cannot be safely removed in-place.
    pass
