"""sidebar role modules setting key

Revision ID: 20260608_0050
Revises: 20260608_0049
Create Date: 2026-06-08
"""

from alembic import op


revision = "20260608_0050"
down_revision = "20260608_0049"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add the new SettingKey enum value used to store per-role sidebar module access.
    with op.get_context().autocommit_block():
        op.execute(
            "ALTER TYPE settingkey ADD VALUE IF NOT EXISTS 'SIDEBAR_ROLE_MODULES'"
        )


def downgrade() -> None:
    # Postgres does not support removing enum values; leaving the value in place is safe.
    pass
