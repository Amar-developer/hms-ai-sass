"""department management metadata

Revision ID: 20260430_0005
Revises: 20260429_0004
Create Date: 2026-04-30
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

revision = "20260430_0005"
down_revision = "20260429_0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    inspector = inspect(op.get_bind())
    columns = {column["name"] for column in inspector.get_columns("department")}
    indexes = {index["name"] for index in inspector.get_indexes("department")}
    if "description" not in columns:
        op.add_column(
            "department",
            sa.Column("description", sa.String(length=1000), nullable=True),
        )
    if "created_by_user_id" not in columns:
        op.add_column(
            "department", sa.Column("created_by_user_id", sa.String(), nullable=True)
        )
    if "updated_at" not in columns:
        op.add_column(
            "department",
            sa.Column(
                "updated_at",
                sa.DateTime(timezone=True),
                nullable=False,
                server_default=sa.text("CURRENT_TIMESTAMP"),
            ),
        )
    if "ix_department_created_by_user_id" not in indexes:
        op.create_index(
            "ix_department_created_by_user_id", "department", ["created_by_user_id"]
        )


def downgrade() -> None:
    inspector = inspect(op.get_bind())
    columns = {column["name"] for column in inspector.get_columns("department")}
    indexes = {index["name"] for index in inspector.get_indexes("department")}
    if "ix_department_created_by_user_id" in indexes:
        op.drop_index("ix_department_created_by_user_id", table_name="department")
    if "updated_at" in columns:
        op.drop_column("department", "updated_at")
    if "created_by_user_id" in columns:
        op.drop_column("department", "created_by_user_id")
    if "description" in columns:
        op.drop_column("department", "description")
