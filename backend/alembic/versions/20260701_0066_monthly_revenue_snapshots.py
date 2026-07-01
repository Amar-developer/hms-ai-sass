"""Add month-end income dashboard snapshots."""

import sqlalchemy as sa
from alembic import op


revision = "20260701_0066"
down_revision = "20260630_0065"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "monthlyrevenuesnapshot",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("tenant_id", sa.String(), nullable=False),
        sa.Column("branch_id", sa.String(), nullable=True),
        sa.Column("period_year", sa.Integer(), nullable=False),
        sa.Column("period_month", sa.Integer(), nullable=False),
        sa.Column("period_start", sa.String(length=10), nullable=False),
        sa.Column("period_end", sa.String(length=10), nullable=False),
        sa.Column("period_label", sa.String(length=40), nullable=False),
        sa.Column("invoice_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("gross_revenue", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("paid_revenue", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("final_profit", sa.Integer(), nullable=False, server_default="0"),
        sa.Column(
            "metrics_json",
            sa.JSON(),
            nullable=False,
            server_default=sa.text("'{}'"),
        ),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.Column("created_by_user_id", sa.String(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "tenant_id",
            "branch_id",
            "period_year",
            "period_month",
            name="uq_monthly_revenue_snapshot_period",
        ),
    )
    for column in (
        "tenant_id",
        "branch_id",
        "period_year",
        "period_month",
        "period_start",
        "period_end",
        "created_at",
        "created_by_user_id",
    ):
        op.create_index(
            f"ix_monthlyrevenuesnapshot_{column}",
            "monthlyrevenuesnapshot",
            [column],
        )


def downgrade() -> None:
    for column in (
        "created_by_user_id",
        "created_at",
        "period_end",
        "period_start",
        "period_month",
        "period_year",
        "branch_id",
        "tenant_id",
    ):
        op.drop_index(
            f"ix_monthlyrevenuesnapshot_{column}",
            table_name="monthlyrevenuesnapshot",
        )
    op.drop_table("monthlyrevenuesnapshot")
