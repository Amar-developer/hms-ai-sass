"""visit purpose workflows

Revision ID: 20260502_0016
Revises: 20260502_0015
Create Date: 2026-05-02
"""

from alembic import op
import sqlalchemy as sa

revision = "20260502_0016"
down_revision = "20260502_0015"
branch_labels = None
depends_on = None


def _add_column_if_missing(
    table_name: str, column_name: str, column: sa.Column
) -> None:
    bind = op.get_bind()
    existing = {col["name"] for col in sa.inspect(bind).get_columns(table_name)}
    if column_name not in existing:
        op.add_column(table_name, column)


def _create_index_if_missing(
    index_name: str, table_name: str, columns: list[str]
) -> None:
    bind = op.get_bind()
    existing = {idx["name"] for idx in sa.inspect(bind).get_indexes(table_name)}
    if index_name not in existing:
        op.create_index(index_name, table_name, columns, unique=False)


def _add_pg_enum_values() -> None:
    bind = op.get_bind()
    if bind.dialect.name != "postgresql":
        return
    with op.get_context().autocommit_block():
        op.execute("ALTER TYPE appointmenttype ADD VALUE IF NOT EXISTS 'DOCTOR_REVIEW'")
        op.execute(
            "ALTER TYPE appointmenttype ADD VALUE IF NOT EXISTS 'FITNESS_CERTIFICATE'"
        )


def upgrade() -> None:
    _add_pg_enum_values()
    _add_column_if_missing(
        "appointment",
        "visit_purpose",
        sa.Column("visit_purpose", sa.String(length=120), nullable=True),
    )
    _add_column_if_missing(
        "appointment",
        "source_appointment_id",
        sa.Column("source_appointment_id", sa.String(), nullable=True),
    )
    _add_column_if_missing(
        "appointment",
        "is_billable",
        sa.Column(
            "is_billable", sa.Boolean(), nullable=False, server_default=sa.true()
        ),
    )
    _add_column_if_missing(
        "appointment",
        "billing_note",
        sa.Column("billing_note", sa.String(length=500), nullable=True),
    )
    _create_index_if_missing(
        op.f("ix_appointment_visit_purpose"), "appointment", ["visit_purpose"]
    )
    _create_index_if_missing(
        op.f("ix_appointment_source_appointment_id"),
        "appointment",
        ["source_appointment_id"],
    )
    _create_index_if_missing(
        op.f("ix_appointment_is_billable"), "appointment", ["is_billable"]
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_appointment_is_billable"), table_name="appointment")
    op.drop_index(
        op.f("ix_appointment_source_appointment_id"), table_name="appointment"
    )
    op.drop_index(op.f("ix_appointment_visit_purpose"), table_name="appointment")
    op.drop_column("appointment", "billing_note")
    op.drop_column("appointment", "is_billable")
    op.drop_column("appointment", "source_appointment_id")
    op.drop_column("appointment", "visit_purpose")
