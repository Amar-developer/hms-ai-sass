"""Add patient vitals (height/weight over time) backing the BMI trend chart."""

import sqlalchemy as sa
from alembic import op


revision = "20260901_0136"
down_revision = "20260831_0135"
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
    if not _table_exists("patientvital"):
        op.create_table(
            "patientvital",
            sa.Column("id", sa.String(), nullable=False),
            sa.Column("tenant_id", sa.String(), nullable=False),
            sa.Column("patient_id", sa.String(), nullable=False),
            sa.Column("recorded_at", sa.DateTime(), nullable=False),
            sa.Column("height_cm", sa.Float(), nullable=False),
            sa.Column("weight_kg", sa.Float(), nullable=False),
            sa.Column("notes", sa.String(length=300), nullable=True),
            sa.Column("created_by_user_id", sa.String(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.ForeignKeyConstraint(["patient_id"], ["patient.id"]),
            sa.ForeignKeyConstraint(["tenant_id"], ["tenant.id"]),
            sa.PrimaryKeyConstraint("id"),
        )
    for column in (
        "tenant_id",
        "patient_id",
        "recorded_at",
        "created_by_user_id",
        "created_at",
    ):
        index_name = f"ix_patientvital_{column}"
        if not _index_exists("patientvital", index_name):
            op.create_index(index_name, "patientvital", [column])


def downgrade() -> None:
    op.drop_table("patientvital")
