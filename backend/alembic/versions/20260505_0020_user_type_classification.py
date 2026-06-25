"""add application user type classification

Revision ID: 20260505_0020
Revises: 20260502_0019
Create Date: 2026-05-05 00:20:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "20260505_0020"
down_revision = "20260502_0019"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    columns = {column["name"] for column in inspector.get_columns("user")}
    indexes = {index["name"] for index in inspector.get_indexes("user")}
    if "user_type" not in columns:
        op.add_column(
            "user",
            sa.Column(
                "user_type",
                sa.String(length=60),
                nullable=False,
                server_default="staff",
            ),
        )
    if op.f("ix_user_user_type") not in indexes:
        op.create_index(op.f("ix_user_user_type"), "user", ["user_type"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_user_user_type"), table_name="user")
    op.drop_column("user", "user_type")
