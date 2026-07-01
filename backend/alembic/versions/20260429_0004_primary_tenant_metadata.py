"""primary tenant metadata

Revision ID: 20260429_0004
Revises: 20260429_0003
Create Date: 2026-04-29
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

revision = "20260429_0004"
down_revision = "20260429_0003"
branch_labels = None
depends_on = None


def _columns(table: str) -> set[str]:
    return {column["name"] for column in inspect(op.get_bind()).get_columns(table)}


def _indexes(table: str) -> set[str]:
    return {index["name"] for index in inspect(op.get_bind()).get_indexes(table)}


def _add_column_if_missing(table: str, name: str, column) -> None:
    if name not in _columns(table):
        op.add_column(table, column)
        return True
    return False


def _drop_column_if_exists(table: str, name: str) -> None:
    if name in _columns(table):
        op.drop_column(table, name)


def upgrade() -> None:
    _add_column_if_missing(
        "tenant",
        "description",
        sa.Column("description", sa.String(length=1000), nullable=True),
    )
    _add_column_if_missing(
        "tenant",
        "logo_url",
        sa.Column("logo_url", sa.String(length=500), nullable=True),
    )
    _add_column_if_missing(
        "tenant", "email", sa.Column("email", sa.String(length=220), nullable=True)
    )
    _add_column_if_missing(
        "tenant", "phone", sa.Column("phone", sa.String(length=30), nullable=True)
    )
    _add_column_if_missing(
        "tenant", "address", sa.Column("address", sa.String(length=1000), nullable=True)
    )
    added_tenant_type = _add_column_if_missing(
        "tenant",
        "tenant_type",
        sa.Column(
            "tenant_type",
            sa.String(length=22),
            nullable=False,
            server_default="single_clinic",
        ),
    )
    added_is_primary = _add_column_if_missing(
        "tenant",
        "is_primary",
        sa.Column(
            "is_primary", sa.Boolean(), nullable=False, server_default=sa.false()
        ),
    )
    if "ix_tenant_is_primary" not in _indexes("tenant"):
        op.create_index("ix_tenant_is_primary", "tenant", ["is_primary"])
    if op.get_bind().dialect.name != "sqlite":
        if added_tenant_type:
            op.alter_column("tenant", "tenant_type", server_default=None)
        if added_is_primary:
            op.alter_column("tenant", "is_primary", server_default=None)


def downgrade() -> None:
    if "ix_tenant_is_primary" in _indexes("tenant"):
        op.drop_index("ix_tenant_is_primary", table_name="tenant")
    _drop_column_if_exists("tenant", "is_primary")
    _drop_column_if_exists("tenant", "tenant_type")
    _drop_column_if_exists("tenant", "address")
    _drop_column_if_exists("tenant", "phone")
    _drop_column_if_exists("tenant", "email")
    _drop_column_if_exists("tenant", "logo_url")
    _drop_column_if_exists("tenant", "description")
