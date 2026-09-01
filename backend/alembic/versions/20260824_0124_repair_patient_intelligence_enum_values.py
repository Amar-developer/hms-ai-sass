"""Repair Patient Intelligence enum values written by data migrations."""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op


revision = "20260824_0124"
down_revision = "20260824_0123"
branch_labels = None
depends_on = None


def _table_exists(table_name: str) -> bool:
    return sa.inspect(op.get_bind()).has_table(table_name)


def _repair_statement(table: sa.Table, old: str, new: str):
    category = table.c.category
    return (
        table.update()
        .where(sa.cast(category, sa.String()) == old)
        .values(category=sa.cast(sa.literal(new), category.type))
    )


def _repair_table(table_name: str) -> None:
    if not _table_exists(table_name):
        return
    bind = op.get_bind()
    table = sa.Table(
        table_name,
        sa.MetaData(),
        autoload_with=bind,
        include_columns=["category"],
    )
    replacements = {
        "value": "VALUE",
        "recurring": "RECURRING",
        "loyalty": "LOYALTY",
        "engagement": "ENGAGEMENT",
        "care_operational": "CARE_OPERATIONAL",
        "membership": "MEMBERSHIP",
    }
    for old, new in replacements.items():
        op.execute(_repair_statement(table, old, new))


def upgrade() -> None:
    _repair_table("patientintelligencerule")
    _repair_table("patientintelligenceflag")


def downgrade() -> None:
    return
