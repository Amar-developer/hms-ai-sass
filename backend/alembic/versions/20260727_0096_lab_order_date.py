"""Add the selectable date to lab and service orders."""

import sqlalchemy as sa
from alembic import op


revision = "20260727_0096"
down_revision = "20260727_0095"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    columns = {column["name"] for column in inspector.get_columns("laborder")}
    if "order_date" not in columns:
        op.add_column(
            "laborder",
            sa.Column(
                "order_date",
                sa.Date(),
                server_default=sa.text("CURRENT_DATE"),
                nullable=False,
            ),
        )
    indexes = {index["name"] for index in sa.inspect(bind).get_indexes("laborder")}
    if "ix_laborder_order_date" not in indexes:
        op.create_index("ix_laborder_order_date", "laborder", ["order_date"])


def downgrade() -> None:
    op.drop_index("ix_laborder_order_date", table_name="laborder")
    op.drop_column("laborder", "order_date")
