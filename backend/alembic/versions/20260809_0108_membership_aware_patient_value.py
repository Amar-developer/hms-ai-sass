"""Make active paid membership a configurable Patient Value rule condition."""

import sqlalchemy as sa
from alembic import op


revision = "20260809_0108"
down_revision = "20260809_0107"
branch_labels = None
depends_on = None


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
    if not _column_exists("patientintelligencerule", "requires_active_membership"):
        op.add_column(
            "patientintelligencerule",
            sa.Column(
                "requires_active_membership",
                sa.Boolean(),
                nullable=False,
                server_default=sa.false(),
            ),
        )
    if not _index_exists(
        "patientintelligencerule",
        "ix_patientintelligencerule_requires_active_membership",
    ):
        op.create_index(
            "ix_patientintelligencerule_requires_active_membership",
            "patientintelligencerule",
            ["requires_active_membership"],
        )


def downgrade() -> None:
    op.drop_index(
        "ix_patientintelligencerule_requires_active_membership",
        table_name="patientintelligencerule",
    )
    op.drop_column("patientintelligencerule", "requires_active_membership")
