"""Add DELIVERING to the report job status enum.

ReportJobStatus.DELIVERING was added to the model when report delivery moved to
the document-delivery queue, but the Postgres enum was never extended. The
worker generates the report and its attachments successfully, then fails on the
status write with:

    invalid input value for enum reportjobstatus: "DELIVERING"

which rolls back the whole cycle, so the job never leaves QUEUED and no monthly
report is ever emailed.

Revision ID: 20260831_0135
Revises: 20260831_0134
Create Date: 2026-08-31
"""

from collections.abc import Sequence

from alembic import op


revision: str = "20260831_0135"
down_revision: str | None = "20260831_0134"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name != "postgresql":
        return
    # ALTER TYPE ... ADD VALUE cannot run inside a transaction block.
    with op.get_context().autocommit_block():
        op.execute(
            "ALTER TYPE reportjobstatus ADD VALUE IF NOT EXISTS 'DELIVERING' "
            "BEFORE 'SENT'"
        )


def downgrade() -> None:
    # PostgreSQL enum values cannot be safely removed in-place.
    pass
