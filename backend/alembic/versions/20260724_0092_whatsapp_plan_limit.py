"""Add monthly WhatsApp message limit to subscription plans.

Revision ID: 20260724_0092
Revises: 20260724_0091
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "20260724_0092"
down_revision: str | None = "20260724_0091"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _columns() -> set[str]:
    inspector = sa.inspect(op.get_bind())
    if "subscriptionplan" not in inspector.get_table_names():
        return set()
    return {column["name"] for column in inspector.get_columns("subscriptionplan")}


def upgrade() -> None:
    columns = _columns()
    if not columns:
        return
    if "monthly_whatsapp_message_limit" not in columns:
        op.add_column(
            "subscriptionplan",
            sa.Column(
                "monthly_whatsapp_message_limit",
                sa.Integer(),
                nullable=False,
                server_default="0",
            ),
        )
    op.execute(
        sa.text(
            "UPDATE subscriptionplan "
            "SET monthly_whatsapp_message_limit = CASE key "
            "WHEN 'growth' THEN 1000 "
            "WHEN 'pro' THEN 5000 "
            "WHEN 'hospital' THEN 10000 "
            "WHEN 'monthly_clinic' THEN 1000 "
            "WHEN 'half_yearly_clinic' THEN 5000 "
            "WHEN 'yearly_clinic' THEN 999999 "
            "ELSE monthly_whatsapp_message_limit END"
        )
    )


def downgrade() -> None:
    columns = _columns()
    if columns and "monthly_whatsapp_message_limit" in columns:
        op.drop_column("subscriptionplan", "monthly_whatsapp_message_limit")
