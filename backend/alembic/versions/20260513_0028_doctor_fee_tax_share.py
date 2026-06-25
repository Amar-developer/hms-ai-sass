"""doctor fee tax share

Revision ID: 20260513_0028
Revises: 20260502_0012
Create Date: 2026-05-13
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

revision = "20260513_0028"
down_revision = "20260512_0026"
branch_labels = None
depends_on = None


def _tables() -> set[str]:
    return set(inspect(op.get_bind()).get_table_names())


def _columns(table: str) -> set[str]:
    return {column["name"] for column in inspect(op.get_bind()).get_columns(table)}


def _indexes(table: str) -> set[str]:
    return {index["name"] for index in inspect(op.get_bind()).get_indexes(table)}


def upgrade() -> None:
    if "doctorfeerule" not in _tables():
        return
    if "share_tax_with_doctor" not in _columns("doctorfeerule"):
        op.add_column(
            "doctorfeerule",
            sa.Column(
                "share_tax_with_doctor",
                sa.Boolean(),
                nullable=False,
                server_default=sa.false(),
            ),
        )
    if "ix_doctorfeerule_share_tax_with_doctor" not in _indexes("doctorfeerule"):
        op.create_index(
            "ix_doctorfeerule_share_tax_with_doctor",
            "doctorfeerule",
            ["share_tax_with_doctor"],
        )


def downgrade() -> None:
    if "doctorfeerule" not in _tables():
        return
    if "ix_doctorfeerule_share_tax_with_doctor" in _indexes("doctorfeerule"):
        op.drop_index(
            "ix_doctorfeerule_share_tax_with_doctor", table_name="doctorfeerule"
        )
    if "share_tax_with_doctor" in _columns("doctorfeerule"):
        op.drop_column("doctorfeerule", "share_tax_with_doctor")
