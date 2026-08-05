"""Add a persisted schedule_group_id to practitioner schedules.

Previously the "one schedule" a doctor's admin edits in the UI (e.g. one row
per weekday) was only ever grouped at read time by deriving a key from
practitioner_id/branch_id/department_id/room_number/slot_minutes/is_active,
joined with "~" — an ugly, fragile identifier that also became the
/scheduling/{key}/edit URL segment. This migration adds a real persisted id
shared by every row in a group and backfills it for existing rows using
exactly the same grouping the old derived key used, so no existing schedule
card is split or merged by this change.
"""

from uuid import uuid4

import sqlalchemy as sa
from alembic import op


revision = "20260805_0104"
down_revision = "20260805_0103"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    columns = {
        column["name"] for column in inspector.get_columns("practitionerschedule")
    }
    if "schedule_group_id" not in columns:
        op.add_column(
            "practitionerschedule",
            sa.Column("schedule_group_id", sa.String(length=64), nullable=True),
        )
        op.create_index(
            "ix_practitionerschedule_schedule_group_id",
            "practitionerschedule",
            ["schedule_group_id"],
        )

    rows = bind.execute(
        sa.text(
            """
            SELECT id, tenant_id, practitioner_id, branch_id, department_id,
                   room_number, slot_minutes, is_active
            FROM practitionerschedule
            WHERE schedule_group_id IS NULL
            """
        )
    ).fetchall()

    group_ids: dict[tuple, str] = {}
    for row in rows:
        key = (
            row.tenant_id,
            row.practitioner_id,
            row.branch_id,
            row.department_id,
            row.room_number,
            row.slot_minutes,
            row.is_active,
        )
        group_id = group_ids.setdefault(key, f"psg_{uuid4().hex[:12]}")
        bind.execute(
            sa.text(
                "UPDATE practitionerschedule"
                " SET schedule_group_id = :group_id WHERE id = :row_id"
            ),
            {"group_id": group_id, "row_id": row.id},
        )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    columns = {
        column["name"] for column in inspector.get_columns("practitionerschedule")
    }
    if "schedule_group_id" in columns:
        op.drop_index(
            "ix_practitionerschedule_schedule_group_id",
            table_name="practitionerschedule",
        )
        op.drop_column("practitionerschedule", "schedule_group_id")
