"""Add invoice logo setting key."""

from alembic import op


revision = "20260525_0039"
down_revision = "20260522_0038"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.execute("ALTER TYPE settingkey ADD VALUE IF NOT EXISTS 'INVOICE_LOGO_URL'")


def downgrade() -> None:
    pass
