"""Collapse practitioner schedules to one row per logical schedule.

Previously each weekday of a recurring schedule was a separate database row
(grouped only at read time, most recently via the `schedule_group_id` added
in `20260805_0104`), and a schedule could additionally carry a date-specific
override/extra row (`schedule_date`/`date_mode`). This migration replaces
that with a single `mode` (daily / mon_saturday / custom) + `weekdays_json`
pair per row, so one schedule really is one row.

`room_number` is dropped with no replacement — confirmed with the product
owner that room tracking on a schedule has no current business requirement;
`PractitionerRoomAssignment` remains its own separate, untouched feature.

Date-specific overrides (`schedule_date`/`date_mode`) are a real, working
feature being intentionally removed per product direction ("separate module
later"). Existing dated rows are archived to
`practitioner_schedule_date_override_archive` (plain columns, no FKs) rather
than silently deleted, so a future override module has real data to migrate
from instead of starting at zero.
"""

import json
from uuid import uuid4

import sqlalchemy as sa
from alembic import op


revision = "20260805_0105"
down_revision = "20260805_0104"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    columns = {
        column["name"] for column in inspector.get_columns("practitionerschedule")
    }

    if "mode" not in columns:
        op.add_column(
            "practitionerschedule",
            sa.Column("mode", sa.String(length=20), nullable=True),
        )
    if "weekdays_json" not in columns:
        op.add_column(
            "practitionerschedule",
            sa.Column("weekdays_json", sa.String(length=40), nullable=True),
        )

    if "practitioner_schedule_date_override_archive" not in inspector.get_table_names():
        op.create_table(
            "practitioner_schedule_date_override_archive",
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column("tenant_id", sa.String(), nullable=False),
            sa.Column("practitioner_id", sa.String(), nullable=False),
            sa.Column("branch_id", sa.String(), nullable=False),
            sa.Column("department_id", sa.String(), nullable=True),
            sa.Column("schedule_date", sa.Date(), nullable=False),
            sa.Column("date_mode", sa.String(length=20), nullable=True),
            sa.Column("start_time", sa.Time(), nullable=False),
            sa.Column("end_time", sa.Time(), nullable=False),
            sa.Column("slot_minutes", sa.Integer(), nullable=False),
            sa.Column("room_number", sa.String(length=10), nullable=True),
            sa.Column("is_active", sa.Boolean(), nullable=False),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
            sa.Column("archived_at", sa.DateTime(), server_default=sa.func.now()),
        )

    # Archive dated (override/extra) rows before they're gone for good.
    dated_rows = bind.execute(
        sa.text(
            """
            SELECT id, tenant_id, practitioner_id, branch_id, department_id,
                   schedule_date, date_mode, start_time, end_time, slot_minutes,
                   room_number, is_active, created_at, updated_at
            FROM practitionerschedule
            WHERE schedule_date IS NOT NULL
            """
        )
    ).fetchall()
    for row in dated_rows:
        bind.execute(
            sa.text(
                """
                INSERT INTO practitioner_schedule_date_override_archive
                    (id, tenant_id, practitioner_id, branch_id, department_id,
                     schedule_date, date_mode, start_time, end_time, slot_minutes,
                     room_number, is_active, created_at, updated_at)
                VALUES
                    (:id, :tenant_id, :practitioner_id, :branch_id, :department_id,
                     :schedule_date, :date_mode, :start_time, :end_time, :slot_minutes,
                     :room_number, :is_active, :created_at, :updated_at)
                """
            ),
            dict(row._mapping),
        )
    bind.execute(
        sa.text("DELETE FROM practitionerschedule WHERE schedule_date IS NOT NULL")
    )

    # Collapse recurring rows: one row per weekday becomes one row covering
    # all its weekdays. Partition key deliberately excludes room fields
    # (being dropped) and `weekday` itself (being folded into weekdays_json).
    #
    # `weekday` only exists on databases that reached this point via the old
    # incremental path (each row created back when the model still had a
    # per-weekday `weekday` column). A fresh database instead gets
    # practitionerschedule created directly with today's mode/weekdays_json
    # shape (see 20260429_0003, which builds it from the live SQLModel
    # metadata), so there's no legacy per-weekday data to collapse there.
    recurring_rows = (
        bind.execute(
            sa.text(
                """
                SELECT id, tenant_id, practitioner_id, branch_id, department_id,
                       weekday, start_time, end_time, slot_minutes, is_active, created_at
                FROM practitionerschedule
                WHERE weekdays_json IS NULL
                ORDER BY created_at
                """
            )
        ).fetchall()
        if "weekday" in columns
        else []
    )

    partitions: dict[tuple, dict] = {}
    for row in recurring_rows:
        key = (
            row.tenant_id,
            row.practitioner_id,
            row.branch_id,
            row.department_id,
            row.start_time,
            row.end_time,
            row.slot_minutes,
            row.is_active,
        )
        partition = partitions.setdefault(
            key, {"survivor_id": row.id, "weekdays": set()}
        )
        partition["weekdays"].add(row.weekday)

    for partition in partitions.values():
        weekdays = sorted(partition["weekdays"])
        if weekdays == list(range(7)):
            mode = "daily"
        elif weekdays == list(range(6)):
            mode = "mon_saturday"
        else:
            mode = "custom"
        bind.execute(
            sa.text(
                """
                UPDATE practitionerschedule
                SET mode = :mode, weekdays_json = :weekdays_json
                WHERE id = :id
                """
            ),
            {
                "mode": mode,
                "weekdays_json": json.dumps(weekdays),
                "id": partition["survivor_id"],
            },
        )

    survivor_ids = {partition["survivor_id"] for partition in partitions.values()}
    all_recurring_ids = {row.id for row in recurring_rows}
    superseded_ids = all_recurring_ids - survivor_ids
    if superseded_ids:
        bind.execute(
            sa.text("DELETE FROM practitionerschedule WHERE id = ANY(:ids)"),
            {"ids": list(superseded_ids)},
        )

    op.alter_column(
        "practitionerschedule", "mode", nullable=False, server_default="custom"
    )
    op.alter_column("practitionerschedule", "weekdays_json", nullable=False)
    existing_index_names = {
        index["name"] for index in inspector.get_indexes("practitionerschedule")
    }
    if "ix_practitionerschedule_mode" not in existing_index_names:
        op.create_index(
            "ix_practitionerschedule_mode", "practitionerschedule", ["mode"]
        )

    for column in (
        "weekday",
        "schedule_date",
        "date_mode",
        "room_number",
        "schedule_group_id",
    ):
        if column in columns:
            if column == "weekday":
                op.drop_index(
                    "ix_practitionerschedule_weekday", table_name="practitionerschedule"
                )
            if column == "schedule_date":
                op.drop_index(
                    "ix_practitionerschedule_schedule_date",
                    table_name="practitionerschedule",
                )
            if column == "schedule_group_id":
                op.drop_index(
                    "ix_practitionerschedule_schedule_group_id",
                    table_name="practitionerschedule",
                )
            op.drop_column("practitionerschedule", column)


def downgrade() -> None:
    """Best-effort only: restores the dropped columns and re-expands
    weekdays_json into one row per weekday, but the archived date-override
    rows are NOT automatically re-inserted (their contents remain in
    practitioner_schedule_date_override_archive for manual recovery)."""
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    columns = {
        column["name"] for column in inspector.get_columns("practitionerschedule")
    }

    if "weekday" not in columns:
        op.add_column(
            "practitionerschedule", sa.Column("weekday", sa.Integer(), nullable=True)
        )
        op.create_index(
            "ix_practitionerschedule_weekday", "practitionerschedule", ["weekday"]
        )
    if "schedule_date" not in columns:
        op.add_column(
            "practitionerschedule", sa.Column("schedule_date", sa.Date(), nullable=True)
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
    if "room_number" not in columns:
        op.add_column(
            "practitionerschedule",
            sa.Column("room_number", sa.String(length=10), nullable=True),
        )
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
        sa.text("SELECT id, weekdays_json FROM practitionerschedule")
    ).fetchall()
    for row in rows:
        weekdays = json.loads(row.weekdays_json or "[]")
        if not weekdays:
            continue
        bind.execute(
            sa.text(
                "UPDATE practitionerschedule SET weekday = :weekday WHERE id = :id"
            ),
            {"weekday": weekdays[0], "id": row.id},
        )
        for extra_weekday in weekdays[1:]:
            bind.execute(
                sa.text(
                    """
                    INSERT INTO practitionerschedule
                        (id, tenant_id, practitioner_id, branch_id, department_id,
                         weekday, start_time, end_time, slot_minutes, is_active,
                         mode, weekdays_json, created_at, updated_at)
                    SELECT :new_id, tenant_id, practitioner_id, branch_id, department_id,
                           :weekday, start_time, end_time, slot_minutes, is_active,
                           mode, weekdays_json, created_at, updated_at
                    FROM practitionerschedule WHERE id = :id
                    """
                ),
                {
                    "new_id": f"psch_{uuid4().hex[:12]}",
                    "weekday": extra_weekday,
                    "id": row.id,
                },
            )

    op.drop_index("ix_practitionerschedule_mode", table_name="practitionerschedule")
    op.drop_column("practitionerschedule", "mode")
    op.drop_column("practitionerschedule", "weekdays_json")
