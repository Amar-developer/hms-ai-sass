"""Add home care booking item service category."""

import sqlalchemy as sa
from alembic import op


revision = "20260624_0060"
down_revision = "20260624_0059"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "homecarebookingitem",
        sa.Column(
            "service_category",
            sa.String(length=80),
            nullable=False,
            server_default="home_care_service",
        ),
    )
    op.create_index(
        "ix_homecarebookingitem_service_category",
        "homecarebookingitem",
        ["service_category"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_homecarebookingitem_service_category",
        table_name="homecarebookingitem",
    )
    op.drop_column("homecarebookingitem", "service_category")
