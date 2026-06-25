"""billing ledger entries

Revision ID: 20260623_0058
Revises: 20260622_0057
Create Date: 2026-06-23
"""

from alembic import op
import sqlalchemy as sa


revision = "20260623_0058"
down_revision = "20260622_0057"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "billingledgerentry",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("tenant_id", sa.String(), nullable=False),
        sa.Column("branch_id", sa.String(), nullable=False),
        sa.Column("invoice_id", sa.String(), nullable=False),
        sa.Column("invoice_number", sa.String(length=60), nullable=False),
        sa.Column("entry_type", sa.String(length=60), nullable=False),
        sa.Column("description", sa.String(length=500), nullable=False),
        sa.Column("debit_amount", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("credit_amount", sa.Integer(), nullable=False, server_default="0"),
        sa.Column(
            "invoice_total_delta", sa.Integer(), nullable=False, server_default="0"
        ),
        sa.Column(
            "paid_amount_delta", sa.Integer(), nullable=False, server_default="0"
        ),
        sa.Column(
            "balance_amount_delta", sa.Integer(), nullable=False, server_default="0"
        ),
        sa.Column("status_after", sa.String(), nullable=False),
        sa.Column("reason", sa.String(length=500), nullable=True),
        sa.Column("related_payment_id", sa.String(), nullable=True),
        sa.Column("related_credit_note_id", sa.String(), nullable=True),
        sa.Column("actor_user_id", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    for column in [
        "tenant_id",
        "branch_id",
        "invoice_id",
        "invoice_number",
        "entry_type",
        "status_after",
        "related_payment_id",
        "related_credit_note_id",
        "actor_user_id",
        "created_at",
    ]:
        op.create_index(
            f"ix_billingledgerentry_{column}", "billingledgerentry", [column]
        )


def downgrade() -> None:
    op.drop_table("billingledgerentry")
