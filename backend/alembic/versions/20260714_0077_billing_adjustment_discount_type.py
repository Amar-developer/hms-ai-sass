"""Add DISCOUNT value to billingadjustmenttype enum

Adds the "discount" value used by the new approval-gated invoice discount
request flow (BillingAdjustmentType.DISCOUNT), which replaces the old direct
"edit invoice amount" action and the old direct "issue credit note" action —
both are now only reachable via a BillingAdjustmentRequest that must be
approved before it executes. Guarded the same way as the QUEUED enum-value
migration: a no-op where the column is a plain string rather than a native
Postgres enum.

Revision ID: 20260714_0077
Revises: 20260714_0076
Create Date: 2026-07-14
"""

from alembic import op
import sqlalchemy as sa

revision = "20260714_0077"
down_revision = "20260714_0076"
branch_labels = None
depends_on = None

ENUM_NAME = "billingadjustmenttype"


def upgrade() -> None:
    bind = op.get_bind()
    data_type = bind.execute(
        sa.text(
            "SELECT data_type FROM information_schema.columns "
            "WHERE table_name = 'billingadjustmentrequest' "
            "AND column_name = 'request_type'"
        )
    ).scalar()
    if data_type != "USER-DEFINED":
        return

    has_discount = bind.execute(
        sa.text(
            "SELECT 1 FROM pg_enum e "
            "JOIN pg_type t ON t.oid = e.enumtypid "
            "WHERE t.typname = :type_name AND e.enumlabel = 'discount'"
        ),
        {"type_name": ENUM_NAME},
    ).first()
    if has_discount:
        return

    with op.get_context().autocommit_block():
        op.execute(f"ALTER TYPE {ENUM_NAME} ADD VALUE IF NOT EXISTS 'discount'")


def downgrade() -> None:
    # Postgres does not support removing values from an enum type.
    pass
