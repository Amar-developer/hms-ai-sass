"""Add accounts bank details setting key."""

from alembic import op


revision = "20260624_0059"
down_revision = "20260623_0058"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.execute(
            "ALTER TYPE settingkey ADD VALUE IF NOT EXISTS " "'ACCOUNTS_BANK_DETAILS'"
        )


def downgrade() -> None:
    # PostgreSQL enum values are intentionally retained on downgrade.
    pass
