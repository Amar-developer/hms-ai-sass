"""add room_number to practitionerschedule

Revision ID: 20260521_0037
Revises: 20260521_0036
Create Date: 2026-05-21
"""
from alembic import op
import sqlalchemy as sa

revision = "20260521_0037"
down_revision = "20260521_0036"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "practitionerschedule",
        sa.Column("room_number", sa.String(length=10), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("practitionerschedule", "room_number")
