"""Add appointment and home-care visit document numbers."""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op


revision = "20260814_0117"
down_revision = "20260812_0116"
branch_labels = None
depends_on = None


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


def _add_column(
    table_name: str, column: sa.Column, *, create_index: bool = True
) -> None:
    if not _table_exists(table_name):
        return
    column_name = column.name
    if not _column_exists(table_name, column_name):
        op.add_column(table_name, column)
    if not create_index:
        return
    index_name = f"ix_{table_name}_{column_name}"
    if not _index_exists(table_name, index_name):
        op.create_index(index_name, table_name, [column_name])


def _backfill_branch_numbers(
    table_name: str, column_name: str, entity_code: str
) -> None:
    if not _table_exists(table_name) or not _column_exists(table_name, column_name):
        return
    bind = op.get_bind()
    sequence_expr = (
        f"'{entity_code}-' || lpad(seq::text, 6, '0')"
        if bind.dialect.name == "postgresql"
        else f"'{entity_code}-' || printf('%06d', seq)"
    )
    bind.execute(
        sa.text(
            f"""
            WITH numbered AS (
                SELECT id,
                       row_number() OVER (
                         PARTITION BY tenant_id, branch_id
                         ORDER BY created_at, id
                       ) AS seq
                FROM {table_name}
                WHERE {column_name} IS NULL OR {column_name} = ''
            )
            UPDATE {table_name}
            SET {column_name} = {sequence_expr}
            FROM numbered
            WHERE {table_name}.id = numbered.id
            """
        )
    )


def upgrade() -> None:
    _add_column("appointment", sa.Column("appointment_number", sa.String(length=60)))
    _add_column("homecarevisitlog", sa.Column("branch_id", sa.String()))
    _add_column("homecarevisitlog", sa.Column("visit_number", sa.String(length=60)))

    if _table_exists("homecarevisitlog") and _table_exists("homecarebooking"):
        op.get_bind().execute(
            sa.text(
                """
                UPDATE homecarevisitlog
                SET branch_id = homecarebooking.branch_id
                FROM homecarebooking
                WHERE homecarevisitlog.booking_id = homecarebooking.id
                  AND (homecarevisitlog.branch_id IS NULL OR homecarevisitlog.branch_id = '')
                """
            )
        )

    _backfill_branch_numbers("appointment", "appointment_number", "APT")
    _backfill_branch_numbers("homecarevisitlog", "visit_number", "HCV")


def downgrade() -> None:
    for table_name, column_name in (
        ("homecarevisitlog", "visit_number"),
        ("homecarevisitlog", "branch_id"),
        ("appointment", "appointment_number"),
    ):
        if not _table_exists(table_name) or not _column_exists(table_name, column_name):
            continue
        index_name = f"ix_{table_name}_{column_name}"
        if _index_exists(table_name, index_name):
            op.drop_index(index_name, table_name=table_name)
        op.drop_column(table_name, column_name)
