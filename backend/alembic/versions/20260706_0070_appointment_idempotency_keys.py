"""Add appointment idempotency key table.

Replaces the in-process, in-memory idempotency cache in
app/api/v1/appointments.py with a DB-backed table so repeated booking
requests with the same X-Idempotency-Key are deduplicated correctly across
multiple worker processes, not just within one.
"""

from alembic import op
import sqlalchemy as sa


revision = "20260706_0070"
down_revision = "20260706_0069"
branch_labels = None
depends_on = None


def _tables() -> set[str]:
    return set(sa.inspect(op.get_bind()).get_table_names())


def upgrade() -> None:
    if "appointmentidempotencykey" not in _tables():
        op.create_table(
            "appointmentidempotencykey",
            sa.Column("id", sa.String(), nullable=False),
            sa.Column("tenant_id", sa.String(), nullable=False),
            sa.Column("user_id", sa.String(), nullable=False),
            sa.Column("idempotency_key", sa.String(length=200), nullable=False),
            sa.Column("request_hash", sa.String(length=64), nullable=False),
            sa.Column("booking_json", sa.String(), nullable=False),
            sa.Column("appointment_id", sa.String(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.ForeignKeyConstraint(["tenant_id"], ["tenant.id"]),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint(
                "tenant_id",
                "user_id",
                "idempotency_key",
                name="uq_appointment_idempotency_key_scope",
            ),
        )
        for column in (
            "tenant_id",
            "user_id",
            "idempotency_key",
            "appointment_id",
            "created_at",
        ):
            op.create_index(
                f"ix_appointmentidempotencykey_{column}",
                "appointmentidempotencykey",
                [column],
            )


def downgrade() -> None:
    if "appointmentidempotencykey" in _tables():
        op.drop_table("appointmentidempotencykey")
