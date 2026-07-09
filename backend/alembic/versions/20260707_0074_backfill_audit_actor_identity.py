"""Backfill actor_name/actor_email on pre-existing audit events.

20260707_0073 added the actor_name/actor_email snapshot columns, but only
new audit events (written after that migration) get them populated by
record_audit_event(). Rows written before that change have NULL actor_name/
actor_email, so the Activity feed falls back to showing "Someone" for any
older entry even though the acting user is still resolvable via
actor_user_id. Backfill those from the user table.
"""

from alembic import op


revision = "20260707_0074"
down_revision = "20260707_0073"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "UPDATE auditevent "
        'SET actor_name = (SELECT "user".name FROM "user" WHERE "user".id = auditevent.actor_user_id) '
        "WHERE actor_user_id IS NOT NULL AND actor_name IS NULL"
    )
    op.execute(
        "UPDATE auditevent "
        'SET actor_email = (SELECT "user".email FROM "user" WHERE "user".id = auditevent.actor_user_id) '
        "WHERE actor_user_id IS NOT NULL AND actor_email IS NULL"
    )


def downgrade() -> None:
    # Backfilled data isn't worth losing on downgrade; no-op.
    pass
