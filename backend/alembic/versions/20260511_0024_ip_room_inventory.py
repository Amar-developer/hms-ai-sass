"""ip room inventory and date-range admissions

Revision ID: 20260511_0024
Revises: 20260507_0023
Create Date: 2026-05-11
"""

from alembic import op
import sqlalchemy as sa


revision = "20260511_0024"
down_revision = "20260507_0023"
branch_labels = None
depends_on = None


def _tables() -> set[str]:
    return set(sa.inspect(op.get_bind()).get_table_names())


def _columns(table_name: str) -> set[str]:
    if table_name not in _tables():
        return set()
    return {column["name"] for column in sa.inspect(op.get_bind()).get_columns(table_name)}


def _add(table_name: str, column_name: str, column: sa.Column) -> None:
    if table_name in _tables() and column_name not in _columns(table_name):
        op.add_column(table_name, column)


def upgrade() -> None:
    if "iproom" not in _tables():
        op.create_table(
            "iproom",
            sa.Column("id", sa.String(), nullable=False),
            sa.Column("tenant_id", sa.String(), nullable=False),
            sa.Column("branch_id", sa.String(), nullable=False),
            sa.Column("ward_type", sa.String(length=80), nullable=False),
            sa.Column("ward_name", sa.String(length=120), nullable=False),
            sa.Column("room_type", sa.String(length=80), nullable=False),
            sa.Column("room_number", sa.String(length=80), nullable=False),
            sa.Column("bed_number", sa.String(length=80), nullable=False),
            sa.Column("daily_rate", sa.Integer(), nullable=False),
            sa.Column("is_active", sa.Boolean(), nullable=False),
            sa.Column("created_by_user_id", sa.String(), nullable=True),
            sa.Column("updated_by_user_id", sa.String(), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
            sa.ForeignKeyConstraint(["branch_id"], ["branch.id"]),
            sa.ForeignKeyConstraint(["tenant_id"], ["tenant.id"]),
            sa.PrimaryKeyConstraint("id"),
        )
    _add("ipadmission", "room_id", sa.Column("room_id", sa.String(), nullable=True))
    _add("ipadmission", "expected_discharge_date", sa.Column("expected_discharge_date", sa.Date(), nullable=True))


def downgrade() -> None:
    pass
