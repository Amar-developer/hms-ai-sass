"""remove the deprecated sidebar role modules setting

Revision ID: 20260716_0079
Revises: 20260715_0078
Create Date: 2026-07-16
"""

from alembic import op


revision = "20260716_0079"
down_revision = "20260715_0078"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # PostgreSQL enum labels cannot be removed safely in place. Delete the
    # obsolete data; the old enum label remains harmless in upgraded databases.
    op.execute("DELETE FROM adminsetting WHERE key = 'SIDEBAR_ROLE_MODULES'")


def downgrade() -> None:
    # Removed per-role sidebar choices cannot be reconstructed.
    pass
