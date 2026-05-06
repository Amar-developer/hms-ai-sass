"""global template locks

Revision ID: 20260430_0008
Revises: 20260430_0007
Create Date: 2026-04-30
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

revision = "20260430_0008"
down_revision = "20260430_0007"
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
    _add("role", "source_template_role_id", sa.Column("source_template_role_id", sa.String(), nullable=True))
    _add("role", "is_global_template", sa.Column("is_global_template", sa.Boolean(), nullable=False, server_default=sa.false()))
    _add("role", "is_template_locked", sa.Column("is_template_locked", sa.Boolean(), nullable=False, server_default=sa.false()))
    _idx("role", "ix_role_source_template_role_id", ["source_template_role_id"])
    _idx("role", "ix_role_is_global_template", ["is_global_template"])
    _idx("role", "ix_role_is_template_locked", ["is_template_locked"])

    _add(
        "department",
        "source_template_department_id",
        sa.Column("source_template_department_id", sa.String(), nullable=True),
    )
    _add("department", "updated_by_user_id", sa.Column("updated_by_user_id", sa.String(), nullable=True))
    _add(
        "department",
        "is_global_template",
        sa.Column("is_global_template", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    _add(
        "department",
        "is_template_locked",
        sa.Column("is_template_locked", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    _idx("department", "ix_department_source_template_department_id", ["source_template_department_id"])
    _idx("department", "ix_department_updated_by_user_id", ["updated_by_user_id"])
    _idx("department", "ix_department_is_global_template", ["is_global_template"])
    _idx("department", "ix_department_is_template_locked", ["is_template_locked"])


def downgrade() -> None:
    for table, names in {
        "department": [
            "ix_department_is_template_locked",
            "ix_department_is_global_template",
            "ix_department_updated_by_user_id",
            "ix_department_source_template_department_id",
        ],
        "role": [
            "ix_role_is_template_locked",
            "ix_role_is_global_template",
            "ix_role_source_template_role_id",
        ],
    }.items():
        existing = _indexes(table)
        for name in names:
            if name in existing:
                op.drop_index(name, table_name=table)
    for table, names in {
        "department": [
            "is_template_locked",
            "is_global_template",
            "updated_by_user_id",
            "source_template_department_id",
        ],
        "role": ["is_template_locked", "is_global_template", "source_template_role_id"],
    }.items():
        existing = _columns(table)
        for name in names:
            if name in existing:
                op.drop_column(table, name)
