"""Add home care booking item service category."""

import sqlalchemy as sa
from alembic import op


revision = "20260624_0060"
down_revision = "20260624_0059"
branch_labels = None
depends_on = None


def _columns(table_name: str) -> set[str]:
    return {
        column["name"] for column in sa.inspect(op.get_bind()).get_columns(table_name)
    }


def _indexes(table_name: str) -> set[str]:
    return {
        index["name"] for index in sa.inspect(op.get_bind()).get_indexes(table_name)
    }


def upgrade() -> None:
    # Migration 0001 creates every table from the *current* SQLModel
    # definitions (SQLModel.metadata.create_all), so on a fresh database
    # this column and its index already exist by the time this runs.
    if "service_category" not in _columns("homecarebookingitem"):
        op.add_column(
            "homecarebookingitem",
            sa.Column(
                "service_category",
                sa.String(length=80),
                nullable=False,
                server_default="home_care_service",
            ),
        )
    if "ix_homecarebookingitem_service_category" not in _indexes("homecarebookingitem"):
        op.create_index(
            "ix_homecarebookingitem_service_category",
            "homecarebookingitem",
            ["service_category"],
        )


def downgrade() -> None:
    if "ix_homecarebookingitem_service_category" in _indexes("homecarebookingitem"):
        op.drop_index(
            "ix_homecarebookingitem_service_category",
            table_name="homecarebookingitem",
        )
    if "service_category" in _columns("homecarebookingitem"):
        op.drop_column("homecarebookingitem", "service_category")
