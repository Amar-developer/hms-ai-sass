"""Add home care booking location."""

import sqlalchemy as sa
from alembic import op


revision = "20260624_0061"
down_revision = "20260624_0060"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "homecarebooking",
        sa.Column("location", sa.String(length=500), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("homecarebooking", "location")
