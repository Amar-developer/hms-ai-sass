"""identity metadata role crud

Revision ID: 20260430_0007
Revises: 20260430_0006
Create Date: 2026-04-30
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

revision = "20260430_0007"
down_revision = "20260430_0006"
branch_labels = None
depends_on = None


def _columns(table: str) -> set[str]:
    return {column["name"] for column in inspect(op.get_bind()).get_columns(table)}


def _indexes(table: str) -> set[str]:
    return {index["name"] for index in inspect(op.get_bind()).get_indexes(table)}


def _add(table: str, name: str, column) -> None:
    if name not in _columns(table):
        op.add_column(table, column)


def _idx(table: str, name: str, columns: list[str]) -> None:
    if name not in _indexes(table):
        op.create_index(name, table, columns)


def upgrade() -> None:
    _add(
        "user",
        "created_by_user_id",
        sa.Column("created_by_user_id", sa.String(), nullable=True),
    )
    _add(
        "user",
        "updated_by_user_id",
        sa.Column("updated_by_user_id", sa.String(), nullable=True),
    )
    _add(
        "user",
        "updated_at",
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
    )
    _idx("user", "ix_user_created_by_user_id", ["created_by_user_id"])
    _idx("user", "ix_user_updated_by_user_id", ["updated_by_user_id"])

    _add(
        "role",
        "is_active",
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
    )
    _add(
        "role",
        "created_by_user_id",
        sa.Column("created_by_user_id", sa.String(), nullable=True),
    )
    _add(
        "role",
        "updated_by_user_id",
        sa.Column("updated_by_user_id", sa.String(), nullable=True),
    )
    _add(
        "role",
        "updated_at",
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
    )
    _idx("role", "ix_role_is_active", ["is_active"])
    _idx("role", "ix_role_created_by_user_id", ["created_by_user_id"])
    _idx("role", "ix_role_updated_by_user_id", ["updated_by_user_id"])


def downgrade() -> None:
    for table, names in {
        "role": [
            "ix_role_updated_by_user_id",
            "ix_role_created_by_user_id",
            "ix_role_is_active",
        ],
        "user": ["ix_user_updated_by_user_id", "ix_user_created_by_user_id"],
    }.items():
        existing = _indexes(table)
        for name in names:
            if name in existing:
                op.drop_index(name, table_name=table)
    for table, names in {
        "role": ["updated_at", "updated_by_user_id", "created_by_user_id", "is_active"],
        "user": ["updated_at", "updated_by_user_id", "created_by_user_id"],
    }.items():
        existing = _columns(table)
        for name in names:
            if name in existing:
                op.drop_column(table, name)
