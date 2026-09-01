"""Add doctor payment details and vendor settlement ledger.

Revision ID: 20260901_0136
Revises: 20260831_0135
Create Date: 2026-09-01
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "20260901_0136"
down_revision: str | None = "20260831_0135"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _columns(table_name: str) -> set[str]:
    inspector = sa.inspect(op.get_bind())
    if table_name not in inspector.get_table_names():
        return set()
    return {column["name"] for column in inspector.get_columns(table_name)}


def upgrade() -> None:
    columns = _columns("doctorsettlement")
    additions = {
        "period_start": sa.Column("period_start", sa.Date(), nullable=True),
        "period_end": sa.Column("period_end", sa.Date(), nullable=True),
        "payment_method": sa.Column(
            "payment_method", sa.String(length=40), nullable=True
        ),
        "payment_reference": sa.Column(
            "payment_reference", sa.String(length=120), nullable=True
        ),
        "paid_at": sa.Column("paid_at", sa.DateTime(), nullable=True),
    }
    for name, column in additions.items():
        if name not in columns:
            op.add_column("doctorsettlement", column)
    for name in ("period_start", "period_end", "paid_at"):
        op.create_index(
            f"ix_doctorsettlement_{name}",
            "doctorsettlement",
            [name],
            if_not_exists=True,
        )

    if not sa.inspect(op.get_bind()).has_table("vendorsettlement"):
        op.create_table(
            "vendorsettlement",
            sa.Column("id", sa.String(), nullable=False),
            sa.Column("tenant_id", sa.String(), nullable=False),
            sa.Column("branch_id", sa.String(), nullable=True),
            sa.Column("supplier_id", sa.String(), nullable=False),
            sa.Column("source_type", sa.String(length=40), nullable=False),
            sa.Column("period_start", sa.Date(), nullable=False),
            sa.Column("period_end", sa.Date(), nullable=False),
            sa.Column("gross_payable", sa.Numeric(14, 2), nullable=False),
            sa.Column("adjustment_amount", sa.Numeric(14, 2), nullable=False),
            sa.Column("settlement_amount", sa.Numeric(14, 2), nullable=False),
            sa.Column("status", sa.String(length=30), nullable=False),
            sa.Column("payment_method", sa.String(length=40), nullable=True),
            sa.Column("payment_reference", sa.String(length=120), nullable=True),
            sa.Column("paid_at", sa.DateTime(), nullable=True),
            sa.Column("notes", sa.String(length=500), nullable=True),
            sa.Column("finalized_by_user_id", sa.String(), nullable=True),
            sa.Column("finalized_at", sa.DateTime(), nullable=False),
            sa.ForeignKeyConstraint(["tenant_id"], ["tenant.id"]),
            sa.ForeignKeyConstraint(["branch_id"], ["branch.id"]),
            sa.ForeignKeyConstraint(["supplier_id"], ["pharmacysupplier.id"]),
            sa.PrimaryKeyConstraint("id"),
        )
        for name in (
            "tenant_id",
            "branch_id",
            "supplier_id",
            "source_type",
            "period_start",
            "period_end",
            "status",
            "paid_at",
            "finalized_by_user_id",
            "finalized_at",
        ):
            op.create_index(f"ix_vendorsettlement_{name}", "vendorsettlement", [name])


def downgrade() -> None:
    if sa.inspect(op.get_bind()).has_table("vendorsettlement"):
        op.drop_table("vendorsettlement")
    columns = _columns("doctorsettlement")
    for name in (
        "paid_at",
        "payment_reference",
        "payment_method",
        "period_end",
        "period_start",
    ):
        if name in columns:
            op.drop_column("doctorsettlement", name)
