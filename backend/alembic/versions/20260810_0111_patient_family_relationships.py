"""Add patient family relationships for shared membership benefits."""

import sqlalchemy as sa
from alembic import op


revision = "20260810_0111"
down_revision = "20260809_0110"
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
    if not _table_exists("patientfamilyrelationship"):
        op.create_table(
            "patientfamilyrelationship",
            sa.Column("id", sa.String(), nullable=False),
            sa.Column("tenant_id", sa.String(), nullable=False),
            sa.Column("patient_id", sa.String(), nullable=False),
            sa.Column("related_patient_id", sa.String(), nullable=False),
            sa.Column("relationship", sa.String(length=80), nullable=False),
            sa.Column("notes", sa.String(length=300), nullable=True),
            sa.Column("is_active", sa.Boolean(), nullable=False),
            sa.Column("created_by_user_id", sa.String(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
            sa.ForeignKeyConstraint(["patient_id"], ["patient.id"]),
            sa.ForeignKeyConstraint(["related_patient_id"], ["patient.id"]),
            sa.ForeignKeyConstraint(["tenant_id"], ["tenant.id"]),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint(
                "tenant_id",
                "patient_id",
                "related_patient_id",
                name="uq_patient_family_relationship_pair",
            ),
        )
    for column in (
        "tenant_id",
        "patient_id",
        "related_patient_id",
        "is_active",
        "created_by_user_id",
        "created_at",
    ):
        index_name = f"ix_patientfamilyrelationship_{column}"
        if not _index_exists("patientfamilyrelationship", index_name):
            op.create_index(index_name, "patientfamilyrelationship", [column])


def downgrade() -> None:
    op.drop_table("patientfamilyrelationship")
