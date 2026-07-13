"""Add missing QUEUED value to patientsubscriptionenrollmentstatus enum

Some environments have patientsubscriptionenrollment.status as a native
Postgres enum type predating migration 20260706_0072, which assumed the
column was a plain string and therefore never added the new "queued" value
to the database. Any query filtering by status="queued" (e.g. membership
eligibility checks during invoice generation) fails on those environments
with "invalid input value for enum ... QUEUED". This migration adds the
missing enum value where the native enum type is present; it is a no-op
where the column is already a plain string.

Revision ID: 20260713_0075
Revises: 20260707_0074
Create Date: 2026-07-13
"""

from alembic import op
import sqlalchemy as sa

revision = "20260713_0075"
down_revision = "20260707_0074"
branch_labels = None
depends_on = None

ENUM_NAME = "patientsubscriptionenrollmentstatus"


def upgrade() -> None:
    bind = op.get_bind()
    data_type = bind.execute(
        sa.text(
            "SELECT data_type FROM information_schema.columns "
            "WHERE table_name = 'patientsubscriptionenrollment' "
            "AND column_name = 'status'"
        )
    ).scalar()
    if data_type != "USER-DEFINED":
        return

    has_queued = bind.execute(
        sa.text(
            "SELECT 1 FROM pg_enum e "
            "JOIN pg_type t ON t.oid = e.enumtypid "
            "WHERE t.typname = :type_name AND e.enumlabel = 'QUEUED'"
        ),
        {"type_name": ENUM_NAME},
    ).first()
    if has_queued:
        return

    op.execute(f"ALTER TYPE {ENUM_NAME} ADD VALUE 'QUEUED'")


def downgrade() -> None:
    # Postgres does not support removing values from an enum type.
    pass
