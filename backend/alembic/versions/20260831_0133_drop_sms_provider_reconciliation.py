"""Drop the SMS provider-invoice reconciliation table.

Provider-invoice reconciliation was removed from the SMS integration: the
totals were entered by hand and compared against a ledger the billing module
already reports on, so the table carried no information the tenant could not
read from usage directly.

The plan-level monthly_sms_segment_limit column added alongside it in
20260830_0132 stays - usage limits still depend on it.
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "20260831_0133"
down_revision: str | None = "20260830_0132"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

RECONCILIATION_TABLE = "smsproviderreconciliation"


def _table_exists(table_name: str) -> bool:
    return sa.inspect(op.get_bind()).has_table(table_name)


def upgrade() -> None:
    if _table_exists(RECONCILIATION_TABLE):
        op.drop_table(RECONCILIATION_TABLE)


def downgrade() -> None:
    if _table_exists(RECONCILIATION_TABLE):
        return
    op.create_table(
        RECONCILIATION_TABLE,
        sa.Column("id", sa.String(length=64), primary_key=True),
        sa.Column("tenant_id", sa.String(length=64), nullable=False, index=True),
        sa.Column("period_start", sa.Date(), nullable=False, index=True),
        sa.Column("period_end", sa.Date(), nullable=False, index=True),
        sa.Column("provider_billed_segments", sa.Integer(), nullable=False),
        sa.Column("provider_amount_paise", sa.Integer(), nullable=False),
        sa.Column("internal_segments", sa.Integer(), nullable=False),
        sa.Column("variance_segments", sa.Integer(), nullable=False),
        sa.Column("notes", sa.String(length=1000), nullable=False),
        sa.Column("recorded_by_user_id", sa.String(length=64), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, index=True),
    )
