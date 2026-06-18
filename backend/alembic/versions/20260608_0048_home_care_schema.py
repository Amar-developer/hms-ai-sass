"""home care booking schema

Revision ID: 20260608_0048
Revises: 20260604_0047
Create Date: 2026-06-08
"""

from alembic import op
import sqlalchemy as sa


revision = "20260608_0048"
down_revision = "20260604_0047"
branch_labels = None
depends_on = None


def _tables() -> set[str]:
    return set(sa.inspect(op.get_bind()).get_table_names())


def _columns(table_name: str) -> set[str]:
    if table_name not in _tables():
        return set()
    return {
        column["name"] for column in sa.inspect(op.get_bind()).get_columns(table_name)
    }


def _indexes(table_name: str) -> set[str]:
    if table_name not in _tables():
        return set()
    return {
        index["name"] for index in sa.inspect(op.get_bind()).get_indexes(table_name)
    }


def _add_column_if_missing(table_name: str, column: sa.Column) -> None:
    if table_name in _tables() and column.name not in _columns(table_name):
        op.add_column(table_name, column)


def _create_index_if_missing(table_name: str, column_name: str) -> None:
    index_name = op.f(f"ix_{table_name}_{column_name}")
    if (
        table_name in _tables()
        and column_name in _columns(table_name)
        and index_name not in _indexes(table_name)
    ):
        op.create_index(index_name, table_name, [column_name])


def upgrade() -> None:
    if "homecareservice" not in _tables():
        op.create_table(
            "homecareservice",
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column("tenant_id", sa.String(), nullable=False),
            sa.Column("branch_id", sa.String(), nullable=True),
            sa.Column("code", sa.String(length=60), nullable=False),
            sa.Column("name", sa.String(length=160), nullable=False),
            sa.Column("description", sa.String(length=500), nullable=True),
            sa.Column(
                "default_price", sa.Integer(), nullable=False, server_default="0"
            ),
            sa.Column(
                "is_active",
                sa.Boolean(),
                nullable=False,
                server_default=sa.text("true"),
            ),
            sa.Column("created_by_user_id", sa.String(), nullable=True),
            sa.Column("updated_by_user_id", sa.String(), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        )

    if "homecarebooking" not in _tables():
        op.create_table(
            "homecarebooking",
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column("tenant_id", sa.String(), nullable=False),
            sa.Column("branch_id", sa.String(), nullable=False),
            sa.Column("patient_id", sa.String(), nullable=False),
            sa.Column("assigned_staff_user_id", sa.String(), nullable=True),
            sa.Column("assigned_staff_name", sa.String(length=160), nullable=True),
            sa.Column("staff_type", sa.String(length=80), nullable=True),
            sa.Column("booking_number", sa.String(length=60), nullable=False),
            sa.Column(
                "recurrence",
                sa.String(length=40),
                nullable=False,
                server_default="daily",
            ),
            sa.Column("start_date", sa.Date(), nullable=False),
            sa.Column("end_date", sa.Date(), nullable=True),
            sa.Column(
                "status",
                sa.String(length=40),
                nullable=False,
                server_default="requested",
            ),
            sa.Column("complaints", sa.String(length=2000), nullable=True),
            sa.Column("notes", sa.String(length=2000), nullable=True),
            sa.Column("created_by_user_id", sa.String(), nullable=True),
            sa.Column("updated_by_user_id", sa.String(), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        )

    if "homecarebookingitem" not in _tables():
        op.create_table(
            "homecarebookingitem",
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column("tenant_id", sa.String(), nullable=False),
            sa.Column("booking_id", sa.String(), nullable=False),
            sa.Column("service_id", sa.String(), nullable=True),
            sa.Column("description", sa.String(length=260), nullable=False),
            sa.Column("quantity", sa.Integer(), nullable=False, server_default="1"),
            sa.Column("unit_amount", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("total_amount", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        )

    _add_column_if_missing(
        "homecarebooking",
        sa.Column("assigned_staff_name", sa.String(length=160), nullable=True),
    )
    _add_column_if_missing(
        "homecarebooking", sa.Column("staff_type", sa.String(length=80), nullable=True)
    )
    _add_column_if_missing(
        "homecarebooking",
        sa.Column(
            "recurrence", sa.String(length=40), nullable=False, server_default="daily"
        ),
    )
    _add_column_if_missing(
        "invoice", sa.Column("home_care_booking_id", sa.String(), nullable=True)
    )

    for table_name, column_names in {
        "homecareservice": [
            "tenant_id",
            "branch_id",
            "code",
            "name",
            "is_active",
            "created_by_user_id",
            "updated_by_user_id",
            "created_at",
        ],
        "homecarebooking": [
            "tenant_id",
            "branch_id",
            "patient_id",
            "assigned_staff_user_id",
            "assigned_staff_name",
            "staff_type",
            "booking_number",
            "recurrence",
            "start_date",
            "end_date",
            "status",
            "created_by_user_id",
            "updated_by_user_id",
            "created_at",
        ],
        "homecarebookingitem": ["tenant_id", "booking_id", "service_id"],
        "invoice": ["home_care_booking_id"],
    }.items():
        for column_name in column_names:
            _create_index_if_missing(table_name, column_name)


def downgrade() -> None:
    for table_name, column_names in {
        "invoice": ["home_care_booking_id"],
        "homecarebooking": ["assigned_staff_name", "staff_type", "recurrence"],
    }.items():
        for column_name in column_names:
            index_name = op.f(f"ix_{table_name}_{column_name}")
            if index_name in _indexes(table_name):
                op.drop_index(index_name, table_name=table_name)
            if column_name in _columns(table_name):
                op.drop_column(table_name, column_name)
