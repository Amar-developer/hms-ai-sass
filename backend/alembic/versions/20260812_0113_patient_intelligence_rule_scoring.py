"""Add tenant-configured scoring fields to patient intelligence rules."""

import sqlalchemy as sa
from alembic import op


revision = "20260812_0113"
down_revision = "20260812_0112"
branch_labels = None
depends_on = None


TABLE = "patientintelligencerule"


def _table_exists(table_name: str) -> bool:
    return sa.inspect(op.get_bind()).has_table(table_name)


def _column_exists(table_name: str, column_name: str) -> bool:
    return any(
        column["name"] == column_name
        for column in sa.inspect(op.get_bind()).get_columns(table_name)
    )


def _index_exists(table_name: str, index_name: str) -> bool:
    return any(
        index["name"] == index_name
        for index in sa.inspect(op.get_bind()).get_indexes(table_name)
    )


def upgrade() -> None:
    if not _table_exists(TABLE):
        return
    if not _column_exists(TABLE, "score_dimension"):
        op.add_column(
            TABLE,
            sa.Column("score_dimension", sa.String(length=30), nullable=True),
        )
    if not _column_exists(TABLE, "score_weight"):
        op.add_column(
            TABLE,
            sa.Column(
                "score_weight",
                sa.Numeric(10, 2),
                nullable=False,
                server_default="0",
            ),
        )
    index_name = f"ix_{TABLE}_score_dimension"
    if not _index_exists(TABLE, index_name):
        op.create_index(index_name, TABLE, ["score_dimension"])


def downgrade() -> None:
    if not _table_exists(TABLE):
        return
    index_name = f"ix_{TABLE}_score_dimension"
    if _index_exists(TABLE, index_name):
        op.drop_index(index_name, table_name=TABLE)
    if _column_exists(TABLE, "score_weight"):
        op.drop_column(TABLE, "score_weight")
    if _column_exists(TABLE, "score_dimension"):
        op.drop_column(TABLE, "score_dimension")
