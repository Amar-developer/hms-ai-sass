"""tax scope and discount offers

Revision ID: 20260521_0034
Revises: 20260520_0033
Create Date: 2026-05-21
"""

from alembic import op
import sqlalchemy as sa


revision = "20260521_0034"
down_revision = "20260520_0033"
branch_labels = None
depends_on = None


def _tables() -> set[str]:
    return set(sa.inspect(op.get_bind()).get_table_names())


def _columns(table_name: str) -> set[str]:
    return {
        column["name"] for column in sa.inspect(op.get_bind()).get_columns(table_name)
    }


def _indexes(table_name: str) -> set[str]:
    return {
        index["name"] for index in sa.inspect(op.get_bind()).get_indexes(table_name)
    }


def _add(table_name: str, column_name: str, column: sa.Column) -> None:
    if table_name in _tables() and column_name not in _columns(table_name):
        op.add_column(table_name, column)


def _index(name: str, table_name: str, columns: list[str]) -> None:
    if table_name in _tables() and name not in _indexes(table_name):
        op.create_index(name, table_name, columns)


def _drop_index(name: str, table_name: str) -> None:
    if table_name in _tables() and name in _indexes(table_name):
        op.drop_index(name, table_name=table_name)


def _drop_column(table_name: str, column_name: str) -> None:
    if table_name in _tables() and column_name in _columns(table_name):
        op.drop_column(table_name, column_name)


def upgrade() -> None:
    if "taxrule" in _tables():
        _add(
            "taxrule",
            "service_scope",
            sa.Column(
                "service_scope",
                sa.String(length=40),
                nullable=False,
                server_default="all",
            ),
        )
        _index("ix_taxrule_service_scope", "taxrule", ["service_scope"])

    if "invoice" in _tables():
        _add(
            "invoice",
            "discount_offer_id",
            sa.Column("discount_offer_id", sa.String(), nullable=True),
        )
        _index("ix_invoice_discount_offer_id", "invoice", ["discount_offer_id"])

    if "discountoffer" not in _tables():
        op.create_table(
            "discountoffer",
            sa.Column("id", sa.String(), nullable=False),
            sa.Column("tenant_id", sa.String(), nullable=False),
            sa.Column("branch_id", sa.String(), nullable=True),
            sa.Column("name", sa.String(length=120), nullable=False),
            sa.Column("code", sa.String(length=40), nullable=True),
            sa.Column(
                "service_scope",
                sa.String(length=40),
                nullable=False,
                server_default="all",
            ),
            sa.Column(
                "discount_type",
                sa.String(length=10),
                nullable=False,
                server_default="percentage",
            ),
            sa.Column("value", sa.Integer(), nullable=False),
            sa.Column(
                "minimum_bill_amount", sa.Integer(), nullable=False, server_default="0"
            ),
            sa.Column("max_discount_amount", sa.Integer(), nullable=True),
            sa.Column("valid_from", sa.DateTime(), nullable=True),
            sa.Column("valid_until", sa.DateTime(), nullable=True),
            sa.Column(
                "is_active", sa.Boolean(), nullable=False, server_default=sa.true()
            ),
            sa.Column("created_by_user_id", sa.String(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.ForeignKeyConstraint(["branch_id"], ["branch.id"]),
            sa.ForeignKeyConstraint(["tenant_id"], ["tenant.id"]),
            sa.PrimaryKeyConstraint("id"),
        )
        for column in (
            "tenant_id",
            "branch_id",
            "code",
            "service_scope",
            "discount_type",
            "valid_from",
            "valid_until",
            "is_active",
            "created_by_user_id",
            "created_at",
        ):
            _index(f"ix_discountoffer_{column}", "discountoffer", [column])


def downgrade() -> None:
    if "discountoffer" in _tables():
        op.drop_table("discountoffer")
    _drop_index("ix_invoice_discount_offer_id", "invoice")
    _drop_column("invoice", "discount_offer_id")
    _drop_index("ix_taxrule_service_scope", "taxrule")
    _drop_column("taxrule", "service_scope")
