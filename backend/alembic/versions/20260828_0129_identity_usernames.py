"""Add tenant-scoped usernames for account login.

Revision ID: 20260828_0129
Revises: 20260826_0128
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "20260828_0129"
down_revision = "20260826_0128"
branch_labels = None
depends_on = None


def _column_exists(table_name: str, column_name: str) -> bool:
    inspector = sa.inspect(op.get_bind())
    return inspector.has_table(table_name) and any(
        column["name"] == column_name for column in inspector.get_columns(table_name)
    )


def _index_exists(table_name: str, index_name: str) -> bool:
    inspector = sa.inspect(op.get_bind())
    return inspector.has_table(table_name) and any(
        index["name"] == index_name for index in inspector.get_indexes(table_name)
    )


def upgrade() -> None:
    if not _column_exists("user", "username"):
        op.add_column(
            "user", sa.Column("username", sa.String(length=80), nullable=True)
        )
    if not _index_exists("user", "ix_user_username"):
        op.create_index("ix_user_username", "user", ["username"], unique=False)
    if not _index_exists("user", "ix_user_tenant_username"):
        op.create_index(
            "ix_user_tenant_username",
            "user",
            ["tenant_id", "username"],
            unique=True,
        )


def downgrade() -> None:
    if _index_exists("user", "ix_user_tenant_username"):
        op.drop_index("ix_user_tenant_username", table_name="user")
    if _index_exists("user", "ix_user_username"):
        op.drop_index("ix_user_username", table_name="user")
    if _column_exists("user", "username"):
        op.drop_column("user", "username")
