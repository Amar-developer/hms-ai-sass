"""Add visit-day selection (all / alternate / specific weekdays) to bookings."""

import sqlalchemy as sa
from alembic import op


revision = "20260805_0103"
down_revision = "20260805_0102"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    columns = {column["name"] for column in inspector.get_columns("homecarebooking")}
    if "visit_day_mode" not in columns:
        op.add_column(
            "homecarebooking",
            sa.Column(
                "visit_day_mode",
                sa.String(length=20),
                nullable=False,
                server_default="all",
            ),
        )
        op.create_index(
            "ix_homecarebooking_visit_day_mode",
            "homecarebooking",
            ["visit_day_mode"],
        )
    if "visit_weekdays_json" not in columns:
        op.add_column(
            "homecarebooking",
            sa.Column("visit_weekdays_json", sa.String(length=40), nullable=True),
        )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    columns = {column["name"] for column in inspector.get_columns("homecarebooking")}
    if "visit_weekdays_json" in columns:
        op.drop_column("homecarebooking", "visit_weekdays_json")
    if "visit_day_mode" in columns:
        op.drop_index("ix_homecarebooking_visit_day_mode", table_name="homecarebooking")
        op.drop_column("homecarebooking", "visit_day_mode")
