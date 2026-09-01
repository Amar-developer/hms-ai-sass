"""Add manual lab tracking fields for patient intelligence."""

import sqlalchemy as sa
from alembic import op


revision = "20260812_0112"
down_revision = ("20260810_0108", "20260810_0111")
branch_labels = None
depends_on = None


TABLE = "patientintelligencepatientsetting"


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
    if not _table_exists(TABLE):
        return
    columns = {
        "manual_expected_lab_at": sa.Column(
            "manual_expected_lab_at", sa.DateTime(), nullable=True
        ),
        "manual_lab_test_name": sa.Column(
            "manual_lab_test_name", sa.String(length=180), nullable=True
        ),
        "manual_lab_notes": sa.Column(
            "manual_lab_notes", sa.String(length=1000), nullable=True
        ),
    }
    for name, column in columns.items():
        if not _column_exists(TABLE, name):
            op.add_column(TABLE, column)
    index_name = f"ix_{TABLE}_manual_expected_lab_at"
    if not _index_exists(TABLE, index_name):
        op.create_index(index_name, TABLE, ["manual_expected_lab_at"])


def downgrade() -> None:
    if not _table_exists(TABLE):
        return
    index_name = f"ix_{TABLE}_manual_expected_lab_at"
    if _index_exists(TABLE, index_name):
        op.drop_index(index_name, table_name=TABLE)
    for name in ("manual_lab_notes", "manual_lab_test_name", "manual_expected_lab_at"):
        if _column_exists(TABLE, name):
            op.drop_column(TABLE, name)
