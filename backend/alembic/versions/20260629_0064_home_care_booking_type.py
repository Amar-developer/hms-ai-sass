"""Add home care booking type."""

import sqlalchemy as sa
from alembic import op


revision = "20260629_0064"
down_revision = "20260626_0063"
branch_labels = None
depends_on = None


def _columns(table_name: str) -> set[str]:
    return {
        column["name"] for column in sa.inspect(op.get_bind()).get_columns(table_name)
    }


def _indexes(table_name: str) -> set[str]:
    return {
        index["name"] for index in sa.inspect(op.get_bind()).get_indexes(table_name)
    }


def upgrade() -> None:
    # Migration 0001 creates every table/column from the *current* SQLModel
    # definitions (SQLModel.metadata.create_all), so on a fresh database
    # this column and its index already exist by the time this runs.
    if "booking_type" not in _columns("homecarebooking"):
        op.add_column(
            "homecarebooking",
            sa.Column(
                "booking_type",
                sa.String(length=40),
                nullable=False,
                server_default="home_care",
            ),
        )
    if "ix_homecarebooking_booking_type" not in _indexes("homecarebooking"):
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
    if "ix_homecarebooking_booking_type" in _indexes("homecarebooking"):
        op.drop_index("ix_homecarebooking_booking_type", table_name="homecarebooking")
    if "booking_type" in _columns("homecarebooking"):
        op.drop_column("homecarebooking", "booking_type")
