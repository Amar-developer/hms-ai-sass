"""Phase 5: SMS plan segment limits and provider-invoice reconciliation.

Adds a plan-level SMS segment entitlement (monthly_sms_segment_limit),
seeded per plan key the same way monthly_whatsapp_message_limit was, and a
table recording admin-entered comparisons of SMSCountry's own invoice
against what this system counted as sent for the same period.
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "20260830_0132"
down_revision: str | None = "20260830_0131"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

RECONCILIATION_TABLE = "smsproviderreconciliation"


def _plan_columns() -> set[str]:
    inspector = sa.inspect(op.get_bind())
    if "subscriptionplan" not in inspector.get_table_names():
        return set()
    return {column["name"] for column in inspector.get_columns("subscriptionplan")}


def _table_exists(table_name: str) -> bool:
    return sa.inspect(op.get_bind()).has_table(table_name)


def upgrade() -> None:
    plan_columns = _plan_columns()
    if plan_columns:
        if "monthly_sms_segment_limit" not in plan_columns:
            op.add_column(
                "subscriptionplan",
                sa.Column(
                    "monthly_sms_segment_limit",
                    sa.Integer(),
                    nullable=False,
                    server_default="0",
                ),
            )
        op.execute(
            sa.text(
                "UPDATE subscriptionplan "
                "SET monthly_sms_segment_limit = CASE key "
                "WHEN 'growth' THEN 1000 "
                "WHEN 'pro' THEN 5000 "
                "WHEN 'hospital' THEN 10000 "
                "WHEN 'monthly_clinic' THEN 1000 "
                "WHEN 'half_yearly_clinic' THEN 5000 "
                "WHEN 'yearly_clinic' THEN 999999 "
                "ELSE monthly_sms_segment_limit END"
            )
        )

    if not _table_exists(RECONCILIATION_TABLE):
        op.create_table(
            RECONCILIATION_TABLE,
            sa.Column("id", sa.String(), nullable=False),
            sa.Column("tenant_id", sa.String(), nullable=False),
            sa.Column("period_start", sa.Date(), nullable=False),
            sa.Column("period_end", sa.Date(), nullable=False),
            sa.Column("provider_billed_segments", sa.Integer(), nullable=False),
            sa.Column("provider_amount_paise", sa.Integer(), nullable=False),
            sa.Column("internal_segments", sa.Integer(), nullable=False),
            sa.Column("variance_segments", sa.Integer(), nullable=False),
            sa.Column("notes", sa.String(length=1000), nullable=False),
            sa.Column("recorded_by_user_id", sa.String(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.ForeignKeyConstraint(["tenant_id"], ["tenant.id"]),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index(
            f"ix_{RECONCILIATION_TABLE}_tenant_id",
            RECONCILIATION_TABLE,
            ["tenant_id"],
        )
        op.create_index(
            f"ix_{RECONCILIATION_TABLE}_period_start",
            RECONCILIATION_TABLE,
            ["period_start"],
        )
        op.create_index(
            f"ix_{RECONCILIATION_TABLE}_period_end",
            RECONCILIATION_TABLE,
            ["period_end"],
        )
        op.create_index(
            f"ix_{RECONCILIATION_TABLE}_recorded_by_user_id",
            RECONCILIATION_TABLE,
            ["recorded_by_user_id"],
        )
        op.create_index(
            f"ix_{RECONCILIATION_TABLE}_created_at",
            RECONCILIATION_TABLE,
            ["created_at"],
        )


def downgrade() -> None:
    if _table_exists(RECONCILIATION_TABLE):
        op.drop_table(RECONCILIATION_TABLE)
    plan_columns = _plan_columns()
    if "monthly_sms_segment_limit" in plan_columns:
        op.drop_column("subscriptionplan", "monthly_sms_segment_limit")
