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


def upgrade() -> None:
    if not _column_exists("patient", "sms_consent_status"):
        return
    op.get_bind().execute(
        sa.text(
            """
            UPDATE patient
            SET sms_consent_status = UPPER(sms_consent_status)
            WHERE sms_consent_status IS NOT NULL
              AND sms_consent_status <> UPPER(sms_consent_status)
            """
        )
    )


def downgrade() -> None:
    # Re-introducing the unreadable lowercase values would break the ORM again.
    return
