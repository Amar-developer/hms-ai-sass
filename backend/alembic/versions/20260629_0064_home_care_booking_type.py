"""Add home care booking type."""

import sqlalchemy as sa
from alembic import op


revision = "20260629_0064"
down_revision = "20260626_0063"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "homecarebooking",
        sa.Column(
            "booking_type",
            sa.String(length=40),
            nullable=False,
            server_default="home_care",
        ),
    )
    op.create_index(
        "ix_homecarebooking_booking_type", "homecarebooking", ["booking_type"]
    )
    op.execute(
        """
        UPDATE homecarebooking
        SET booking_type = 'home_visit'
        WHERE EXISTS (
            SELECT 1
            FROM homecarebookingitem
            WHERE homecarebookingitem.booking_id = homecarebooking.id
              AND homecarebookingitem.service_category = 'home_visit_service'
        )
        """
    )


def downgrade() -> None:
    op.drop_index("ix_homecarebooking_booking_type", table_name="homecarebooking")
    op.drop_column("homecarebooking", "booking_type")
