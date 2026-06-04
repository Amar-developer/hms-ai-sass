"""catalog integrations setting

Revision ID: 20260604_0044
Revises: 20260601_0043
Create Date: 2026-06-04
"""

from alembic import op


revision = "20260604_0044"
down_revision = "20260601_0043"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        with op.get_context().autocommit_block():
            op.execute("ALTER TYPE settingkey ADD VALUE IF NOT EXISTS 'CATALOG_INTEGRATIONS'")


def downgrade() -> None:
    pass
