"""Add physiotherapist to therapy sessions.

Revision ID: 20260513_0029
Revises: 20260513_0028
Create Date: 2026-05-13
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


revision = "20260513_0029"
down_revision = "20260513_0028"
branch_labels = None
depends_on = None


def _columns(table: str) -> set[str]:
    return {column["name"] for column in inspect(op.get_bind()).get_columns(table)}


def _indexes(table: str) -> set[str]:
    return {index["name"] for index in inspect(op.get_bind()).get_indexes(table)}


def upgrade() -> None:
    index_name = op.f("ix_physiotherapysession_physiotherapist_id")
    if "physiotherapist_id" not in _columns("physiotherapysession"):
        op.add_column("physiotherapysession", sa.Column("physiotherapist_id", sa.String(), nullable=True))
    if index_name not in _indexes("physiotherapysession"):
        op.create_index(
            index_name,
            "physiotherapysession",
            ["physiotherapist_id"],
            unique=False,
        )


def downgrade() -> None:
    index_name = op.f("ix_physiotherapysession_physiotherapist_id")
    if index_name in _indexes("physiotherapysession"):
        op.drop_index(index_name, table_name="physiotherapysession")
    if "physiotherapist_id" in _columns("physiotherapysession"):
        op.drop_column("physiotherapysession", "physiotherapist_id")
