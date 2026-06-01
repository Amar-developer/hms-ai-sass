"""branch area

Revision ID: 20260601_0043
Revises: 20260525_0042
Create Date: 2026-06-01
"""

from alembic import op
import sqlalchemy as sa


revision = "20260601_0043"
down_revision = "20260525_0042"
branch_labels = None
depends_on = None


def _columns(table_name: str) -> set[str]:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    return {column["name"] for column in inspector.get_columns(table_name)}


def upgrade() -> None:
    if "area" not in _columns("branch"):
        op.add_column("branch", sa.Column("area", sa.String(length=120), nullable=True))


def downgrade() -> None:
    if "area" in _columns("branch"):
        op.drop_column("branch", "area")
