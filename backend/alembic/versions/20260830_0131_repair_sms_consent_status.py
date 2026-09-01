"""Repair legacy SMS consent values during branch integrations.

Revision 20260830_0130 now writes ORM-compatible enum member names directly.
This compatibility revision stays intentionally idempotent so databases that
briefly received lowercase values from the original feature branch are repaired
on upgrade.
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op


revision = "20260830_0131"
down_revision = "20260830_0130"
branch_labels = None
depends_on = None


def _column_exists(table_name: str, column_name: str) -> bool:
    inspector = sa.inspect(op.get_bind())
    if not inspector.has_table(table_name):
        return False
    return any(
        column["name"] == column_name for column in inspector.get_columns(table_name)
    )


def _repair_statement(table: sa.Table):
    consent_status = table.c.sms_consent_status
    consent_status_text = sa.cast(consent_status, sa.String())
    normalized_status = sa.func.upper(consent_status_text)
    return (
        table.update()
        .where(
            consent_status.is_not(None),
            consent_status_text != normalized_status,
        )
        .values(sms_consent_status=sa.cast(normalized_status, consent_status.type))
    )


def upgrade() -> None:
    if not _column_exists("patient", "sms_consent_status"):
        return
    bind = op.get_bind()
    table = sa.Table(
        "patient",
        sa.MetaData(),
        autoload_with=bind,
        include_columns=["sms_consent_status"],
    )
    bind.execute(_repair_statement(table))


def downgrade() -> None:
    # Re-introducing the unreadable lowercase values would break the ORM again.
    return
