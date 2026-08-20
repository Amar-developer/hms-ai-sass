"""Add global audit user fields to listable records."""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op


revision = "20260819_0119"
down_revision = "20260819_0118"
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


def _add_indexed_column(table_name: str, column_name: str) -> None:
    if not _table_exists(table_name):
        return
    if not _column_exists(table_name, column_name):
        op.add_column(table_name, sa.Column(column_name, sa.String(), nullable=True))
    index_name = f"ix_{table_name}_{column_name}"
    if not _index_exists(table_name, index_name):
        op.create_index(index_name, table_name, [column_name])


def _drop_indexed_column(table_name: str, column_name: str) -> None:
    if not _table_exists(table_name) or not _column_exists(table_name, column_name):
        return
    index_name = f"ix_{table_name}_{column_name}"
    if _index_exists(table_name, index_name):
        op.drop_index(index_name, table_name=table_name)
    op.drop_column(table_name, column_name)


def _backfill(table_name: str, target: str, source: str) -> None:
    if not _table_exists(table_name):
        return
    if not _column_exists(table_name, target) or not _column_exists(table_name, source):
        return
    table = sa.table(table_name, sa.column(target), sa.column(source))
    op.execute(
        table.update()
        .where(table.c[target].is_(None))
        .where(table.c[source].is_not(None))
        .values({target: table.c[source]})
    )


def upgrade() -> None:
    audit_columns = {
        "patient": ("updated_by_user_id",),
        "laborder": ("created_by_user_id", "updated_by_user_id"),
        "pharmacyissue": ("created_by_user_id", "updated_by_user_id"),
        "pharmacypurchase": ("created_by_user_id", "updated_by_user_id"),
        "pharmacyreturn": ("created_by_user_id", "updated_by_user_id"),
        "expense": ("created_by_user_id", "updated_by_user_id"),
        "practitioner": ("created_by_user_id", "updated_by_user_id"),
        "practitionerschedule": ("created_by_user_id", "updated_by_user_id"),
        "practitionerleave": ("created_by_user_id", "updated_by_user_id"),
        "practitionerroomassignment": (
            "created_by_user_id",
            "updated_by_user_id",
        ),
        "queueentry": ("created_by_user_id", "updated_by_user_id"),
        "queueevent": ("created_by_user_id",),
        "documentsequence": ("created_by_user_id", "updated_by_user_id"),
    }
    for table_name, column_names in audit_columns.items():
        for column_name in column_names:
            _add_indexed_column(table_name, column_name)

    _backfill("patient", "updated_by_user_id", "created_by_user_id")
    _backfill("laborder", "created_by_user_id", "ordered_by_user_id")
    _backfill("laborder", "updated_by_user_id", "ordered_by_user_id")
    _backfill("pharmacyissue", "created_by_user_id", "issued_by_user_id")
    _backfill("pharmacyissue", "updated_by_user_id", "issued_by_user_id")
    _backfill("pharmacypurchase", "created_by_user_id", "purchased_by_user_id")
    _backfill("pharmacypurchase", "updated_by_user_id", "purchased_by_user_id")
    _backfill("pharmacyreturn", "created_by_user_id", "returned_by_user_id")
    _backfill("pharmacyreturn", "updated_by_user_id", "returned_by_user_id")
    _backfill("expense", "created_by_user_id", "submitted_by")
    _backfill("expense", "updated_by_user_id", "submitted_by")
    _backfill("queueevent", "created_by_user_id", "actor_user_id")


def downgrade() -> None:
    audit_columns = {
        "documentsequence": ("updated_by_user_id", "created_by_user_id"),
        "queueevent": ("created_by_user_id",),
        "queueentry": ("updated_by_user_id", "created_by_user_id"),
        "practitionerroomassignment": (
            "updated_by_user_id",
            "created_by_user_id",
        ),
        "practitionerleave": ("updated_by_user_id", "created_by_user_id"),
        "practitionerschedule": ("updated_by_user_id", "created_by_user_id"),
        "practitioner": ("updated_by_user_id", "created_by_user_id"),
        "expense": ("updated_by_user_id", "created_by_user_id"),
        "pharmacyreturn": ("updated_by_user_id", "created_by_user_id"),
        "pharmacypurchase": ("updated_by_user_id", "created_by_user_id"),
        "pharmacyissue": ("updated_by_user_id", "created_by_user_id"),
        "laborder": ("updated_by_user_id", "created_by_user_id"),
        "patient": ("updated_by_user_id",),
    }
    for table_name, column_names in audit_columns.items():
        for column_name in column_names:
            _drop_indexed_column(table_name, column_name)
