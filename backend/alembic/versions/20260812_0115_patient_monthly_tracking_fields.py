"""Add patient-owned monthly tracking fields."""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op


revision = "20260812_0115"
down_revision = "20260812_0114"
branch_labels = None
depends_on = None


PATIENT_TABLE = "patient"
SETTING_TABLE = "patientintelligencepatientsetting"


def _table_exists(table_name: str) -> bool:
    return sa.inspect(op.get_bind()).has_table(table_name)


def _column_exists(table_name: str, column_name: str) -> bool:
    return any(
        column["name"] == column_name
        for column in sa.inspect(op.get_bind()).get_columns(table_name)
    )


def _index_exists(table_name: str, index_name: str) -> bool:
    return any(
        index["name"] == index_name
        for index in sa.inspect(op.get_bind()).get_indexes(table_name)
    )


def upgrade() -> None:
    if not _table_exists(PATIENT_TABLE):
        return

    columns = {
        "monthly_tracking_enabled": sa.Column(
            "monthly_tracking_enabled",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
        "monthly_refill_on": sa.Column("monthly_refill_on", sa.Date(), nullable=True),
        "monthly_refill_notes": sa.Column(
            "monthly_refill_notes", sa.String(length=1000), nullable=True
        ),
        "monthly_lab_on": sa.Column("monthly_lab_on", sa.Date(), nullable=True),
        "monthly_lab_test_name": sa.Column(
            "monthly_lab_test_name", sa.String(length=180), nullable=True
        ),
        "monthly_lab_notes": sa.Column(
            "monthly_lab_notes", sa.String(length=1000), nullable=True
        ),
    }
    for name, column in columns.items():
        if not _column_exists(PATIENT_TABLE, name):
            op.add_column(PATIENT_TABLE, column)

    for name in ("monthly_tracking_enabled", "monthly_refill_on", "monthly_lab_on"):
        index_name = f"ix_{PATIENT_TABLE}_{name}"
        if not _index_exists(PATIENT_TABLE, index_name):
            op.create_index(index_name, PATIENT_TABLE, [name])

    if _table_exists(SETTING_TABLE):
        bind = op.get_bind()
        bind.execute(
            sa.text(
                """
                UPDATE patient AS p
                SET
                  monthly_refill_on = COALESCE(
                    p.monthly_refill_on,
                    CAST(s.manual_expected_refill_at AS DATE)
                  ),
                  monthly_refill_notes = COALESCE(
                    p.monthly_refill_notes,
                    s.notes
                  ),
                  monthly_lab_on = COALESCE(
                    p.monthly_lab_on,
                    CAST(s.manual_expected_lab_at AS DATE)
                  ),
                  monthly_lab_test_name = COALESCE(
                    p.monthly_lab_test_name,
                    s.manual_lab_test_name
                  ),
                  monthly_lab_notes = COALESCE(
                    p.monthly_lab_notes,
                    s.manual_lab_notes
                  ),
                  monthly_tracking_enabled = CASE
                    WHEN p.monthly_tracking_enabled = TRUE
                      OR s.manual_expected_refill_at IS NOT NULL
                      OR s.manual_expected_lab_at IS NOT NULL
                    THEN TRUE
                    ELSE FALSE
                  END
                FROM patientintelligencepatientsetting AS s
                WHERE s.patient_id = p.id
                  AND s.tenant_id = p.tenant_id
                """
            )
        )


def downgrade() -> None:
    if not _table_exists(PATIENT_TABLE):
        return
    for name in ("monthly_lab_on", "monthly_refill_on", "monthly_tracking_enabled"):
        index_name = f"ix_{PATIENT_TABLE}_{name}"
        if _index_exists(PATIENT_TABLE, index_name):
            op.drop_index(index_name, table_name=PATIENT_TABLE)
    for name in (
        "monthly_lab_notes",
        "monthly_lab_test_name",
        "monthly_lab_on",
        "monthly_refill_notes",
        "monthly_refill_on",
        "monthly_tracking_enabled",
    ):
        if _column_exists(PATIENT_TABLE, name):
            op.drop_column(PATIENT_TABLE, name)
