"""Add per-patient manual refill scheduling for intelligence dashboard."""

import sqlalchemy as sa
from alembic import op


revision = "20260809_0110"
down_revision = "20260809_0109"
branch_labels = None
depends_on = None


def _table_exists(table_name: str) -> bool:
    return sa.inspect(op.get_bind()).has_table(table_name)


def _index_exists(table_name: str, index_name: str) -> bool:
    return any(
        index["name"] == index_name
        for index in sa.inspect(op.get_bind()).get_indexes(table_name)
    )


def upgrade() -> None:
    if not _table_exists("patientintelligencepatientsetting"):
        op.create_table(
            "patientintelligencepatientsetting",
            sa.Column("id", sa.String(), nullable=False),
            sa.Column("tenant_id", sa.String(), nullable=False),
            sa.Column("patient_id", sa.String(), nullable=False),
            sa.Column("manual_expected_refill_at", sa.DateTime(), nullable=True),
            sa.Column("notes", sa.String(1000), nullable=True),
            sa.Column("updated_by_user_id", sa.String(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
            sa.ForeignKeyConstraint(["patient_id"], ["patient.id"]),
            sa.ForeignKeyConstraint(["tenant_id"], ["tenant.id"]),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint(
                "tenant_id",
                "patient_id",
                name="uq_pi_patient_setting_tenant_patient",
            ),
        )
    for column in (
        "tenant_id",
        "patient_id",
        "manual_expected_refill_at",
        "updated_by_user_id",
    ):
        index_name = f"ix_patientintelligencepatientsetting_{column}"
        if not _index_exists("patientintelligencepatientsetting", index_name):
            op.create_index(
                index_name,
                "patientintelligencepatientsetting",
                [column],
            )


def downgrade() -> None:
    op.drop_table("patientintelligencepatientsetting")
