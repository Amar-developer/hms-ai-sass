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


def _repair_table(table_name: str) -> None:
    if not _table_exists(table_name):
        return
    table = sa.table(table_name, sa.column("category", sa.String()))
    replacements = {
        "value": "VALUE",
        "recurring": "RECURRING",
        "loyalty": "LOYALTY",
        "engagement": "ENGAGEMENT",
        "care_operational": "CARE_OPERATIONAL",
        "membership": "MEMBERSHIP",
    }
    for old, new in replacements.items():
        op.execute(table.update().where(table.c.category == old).values(category=new))


def upgrade() -> None:
    _repair_table("patientintelligencerule")
    _repair_table("patientintelligenceflag")


def downgrade() -> None:
    return
