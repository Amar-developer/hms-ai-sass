"""global branch template locks

Revision ID: 20260501_0009
Revises: 20260430_0008
Create Date: 2026-05-01
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

revision = "20260501_0009"
down_revision = "20260430_0008"
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
    _add("branch", "source_template_branch_id", sa.Column("source_template_branch_id", sa.String(), nullable=True))
    _add("branch", "is_global_template", sa.Column("is_global_template", sa.Boolean(), nullable=False, server_default=sa.false()))
    _add("branch", "is_template_locked", sa.Column("is_template_locked", sa.Boolean(), nullable=False, server_default=sa.false()))
    _idx("branch", "ix_branch_source_template_branch_id", ["source_template_branch_id"])
    _idx("branch", "ix_branch_is_global_template", ["is_global_template"])
    _idx("branch", "ix_branch_is_template_locked", ["is_template_locked"])


def downgrade() -> None:
    existing_indexes = _indexes("branch")
    for name in ["ix_branch_is_template_locked", "ix_branch_is_global_template", "ix_branch_source_template_branch_id"]:
        if name in existing_indexes:
            op.drop_index(name, table_name="branch")
    existing_columns = _columns("branch")
    for name in ["is_template_locked", "is_global_template", "source_template_branch_id"]:
        if name in existing_columns:
            op.drop_column("branch", name)
