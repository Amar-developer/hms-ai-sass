"""tenant branch audit metadata

Revision ID: 20260430_0006
Revises: 20260430_0005
Create Date: 2026-04-30
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

revision = "20260430_0006"
down_revision = "20260430_0005"
branch_labels = None
depends_on = None


def _add_column_if_missing(table: str, name: str, column) -> None:
    inspector = inspect(op.get_bind())
    columns = {existing["name"] for existing in inspector.get_columns(table)}
    if name not in columns:
        op.add_column(table, column)


def _create_index_if_missing(table: str, name: str, columns: list[str]) -> None:
    inspector = inspect(op.get_bind())
    indexes = {existing["name"] for existing in inspector.get_indexes(table)}
    if name not in indexes:
        op.create_index(name, table, columns)


def _drop_column_if_exists(table: str, name: str) -> None:
    inspector = inspect(op.get_bind())
    columns = {existing["name"] for existing in inspector.get_columns(table)}
    if name in columns:
        op.drop_column(table, name)


def _drop_index_if_exists(table: str, name: str) -> None:
    inspector = inspect(op.get_bind())
    indexes = {existing["name"] for existing in inspector.get_indexes(table)}
    if name in indexes:
        op.drop_index(name, table_name=table)


def upgrade() -> None:
    _add_column_if_missing("tenant", "created_by_user_id", sa.Column("created_by_user_id", sa.String(), nullable=True))
    _add_column_if_missing("tenant", "updated_by_user_id", sa.Column("updated_by_user_id", sa.String(), nullable=True))
    _create_index_if_missing("tenant", "ix_tenant_created_by_user_id", ["created_by_user_id"])
    _create_index_if_missing("tenant", "ix_tenant_updated_by_user_id", ["updated_by_user_id"])

    _add_column_if_missing("branch", "created_by_user_id", sa.Column("created_by_user_id", sa.String(), nullable=True))
    _add_column_if_missing("branch", "updated_by_user_id", sa.Column("updated_by_user_id", sa.String(), nullable=True))
    _add_column_if_missing(
        "branch",
        "updated_at",
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
    )
    _create_index_if_missing("branch", "ix_branch_created_by_user_id", ["created_by_user_id"])
    _create_index_if_missing("branch", "ix_branch_updated_by_user_id", ["updated_by_user_id"])

    if op.get_bind().dialect.name != "sqlite":
        op.alter_column("tenant", "tenant_type", type_=sa.String(length=40), existing_nullable=False)


def downgrade() -> None:
    _drop_index_if_exists("branch", "ix_branch_updated_by_user_id")
    _drop_index_if_exists("branch", "ix_branch_created_by_user_id")
    _drop_column_if_exists("branch", "updated_at")
    _drop_column_if_exists("branch", "updated_by_user_id")
    _drop_column_if_exists("branch", "created_by_user_id")

    _drop_index_if_exists("tenant", "ix_tenant_updated_by_user_id")
    _drop_index_if_exists("tenant", "ix_tenant_created_by_user_id")
    _drop_column_if_exists("tenant", "updated_by_user_id")
    _drop_column_if_exists("tenant", "created_by_user_id")

    if op.get_bind().dialect.name != "sqlite":
        op.alter_column("tenant", "tenant_type", type_=sa.String(length=22), existing_nullable=False)
