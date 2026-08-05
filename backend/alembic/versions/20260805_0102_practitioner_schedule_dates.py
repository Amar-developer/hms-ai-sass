"""Add date-specific practitioner schedules (override / extra)."""

import sqlalchemy as sa
from alembic import op


revision = "20260805_0102"
down_revision = "20260729_0101"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    columns = {
        column["name"] for column in inspector.get_columns("practitionerschedule")
    }
    if "schedule_date" not in columns:
        op.add_column(
            "practitionerschedule",
            sa.Column("schedule_date", sa.Date(), nullable=True),
        )
        op.create_index(
            "ix_practitionerschedule_schedule_date",
            "practitionerschedule",
            ["schedule_date"],
        )
    if "date_mode" not in columns:
        op.add_column(
            "practitionerschedule",
            sa.Column("date_mode", sa.String(length=20), nullable=True),
        )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    columns = {
        column["name"] for column in inspector.get_columns("practitionerschedule")
    }
    if "date_mode" in columns:
        op.drop_column("practitionerschedule", "date_mode")
    if "schedule_date" in columns:
        op.drop_index(
            "ix_practitionerschedule_schedule_date",
            table_name="practitionerschedule",
        )
        op.drop_column("practitionerschedule", "schedule_date")
