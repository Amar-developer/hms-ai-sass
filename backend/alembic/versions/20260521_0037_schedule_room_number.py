"""add room_number to practitionerschedule

Revision ID: 20260521_0037
Revises: 20260521_0036
Create Date: 2026-05-21
"""
from alembic import op
import sqlalchemy as sa

revision = "20260521_0037"
down_revision = "20260521_0036"
branch_labels = None
depends_on = None


def _tables() -> set[str]:
    return set(sa.inspect(op.get_bind()).get_table_names())


def _columns(table_name: str) -> set[str]:
    return {column["name"] for column in sa.inspect(op.get_bind()).get_columns(table_name)}


def upgrade() -> None:
    if "practitionerschedule" in _tables() and "room_number" not in _columns("practitionerschedule"):
        op.add_column(
            "practitionerschedule",
            sa.Column("room_number", sa.String(length=10), nullable=True),
        )


def downgrade() -> None:
    if "practitionerschedule" in _tables() and "room_number" in _columns("practitionerschedule"):
        op.drop_column("practitionerschedule", "room_number")
