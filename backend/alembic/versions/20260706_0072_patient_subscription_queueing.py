"""Add activated_on to patient subscription enrollments for plan queueing.

Supports "only one active membership plan per patient at a time": a plan
bought while another is active is created with status=queued (a new value of
the existing status string column, so no schema change needed for that part)
and is promoted to active once the current plan expires. activated_on
records the real activation date so activation_after_days is counted from
when a plan actually starts granting benefits, not from its purchase date
(starts_on).
"""

from alembic import op
import sqlalchemy as sa


revision = "20260706_0072"
down_revision = "20260706_0071"
branch_labels = None
depends_on = None


def _columns(table_name: str) -> set[str]:
    return {
        column["name"] for column in sa.inspect(op.get_bind()).get_columns(table_name)
    }


def upgrade() -> None:
    if "activated_on" not in _columns("patientsubscriptionenrollment"):
        op.add_column(
            "patientsubscriptionenrollment",
            sa.Column("activated_on", sa.Date(), nullable=True),
        )
        # Existing enrollments were always active from the moment they were
        # created (queueing didn't exist yet), so backfill activated_on to
        # starts_on for any row that isn't already queued/expired-without-
        # ever-activating. This keeps active_patient_enrollment's delay
        # calculation correct for pre-existing rows.
        op.execute(
            "UPDATE patientsubscriptionenrollment "
            "SET activated_on = starts_on "
            "WHERE activated_on IS NULL "
            "AND status::text IN "
            "('active', 'ACTIVE', 'expired', 'EXPIRED', 'cancelled', 'CANCELLED')"
        )


def downgrade() -> None:
    if "activated_on" in _columns("patientsubscriptionenrollment"):
        op.drop_column("patientsubscriptionenrollment", "activated_on")
