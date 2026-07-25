"""Add delivery state to the notification outbox.

Revision ID: 20260724_0089
Revises: 20260723_0088
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "20260724_0089"
down_revision: str | None = "20260723_0088"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _columns() -> set[str]:
    inspector = sa.inspect(op.get_bind())
    if "notificationevent" not in inspector.get_table_names():
        return set()
    return {column["name"] for column in inspector.get_columns("notificationevent")}


def _indexes() -> set[str]:
    inspector = sa.inspect(op.get_bind())
    if "notificationevent" not in inspector.get_table_names():
        return set()
    return {index["name"] for index in inspector.get_indexes("notificationevent")}


def upgrade() -> None:
    columns = _columns()
    if not columns:
        return
    additions = {
        "template_key": sa.Column("template_key", sa.String(length=120), nullable=True),
        "dedupe_key": sa.Column("dedupe_key", sa.String(length=240), nullable=True),
        "attempt_count": sa.Column(
            "attempt_count", sa.Integer(), nullable=False, server_default="0"
        ),
        "max_attempts": sa.Column(
            "max_attempts", sa.Integer(), nullable=False, server_default="5"
        ),
        "next_attempt_at": sa.Column(
            "next_attempt_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        "processing_started_at": sa.Column(
            "processing_started_at", sa.DateTime(timezone=True), nullable=True
        ),
    }
    for name, column in additions.items():
        if name not in columns:
            op.add_column("notificationevent", column)

    indexes = _indexes()
    definitions = {
        "ix_notificationevent_template_key": ["template_key"],
        "ix_notificationevent_next_attempt_at": ["next_attempt_at"],
        "ix_notificationevent_processing_started_at": ["processing_started_at"],
        "ix_notificationevent_due": ["provider", "status", "next_attempt_at"],
    }
    for name, fields in definitions.items():
        if name not in indexes:
            op.create_index(name, "notificationevent", fields)
    if "uq_notificationevent_dedupe_key" not in indexes:
        op.create_index(
            "uq_notificationevent_dedupe_key",
            "notificationevent",
            ["tenant_id", "dedupe_key"],
            unique=True,
            postgresql_where=sa.text("dedupe_key IS NOT NULL"),
            sqlite_where=sa.text("dedupe_key IS NOT NULL"),
        )


def downgrade() -> None:
    if not _columns():
        return
    indexes = _indexes()
    for name in (
        "uq_notificationevent_dedupe_key",
        "ix_notificationevent_due",
        "ix_notificationevent_processing_started_at",
        "ix_notificationevent_next_attempt_at",
        "ix_notificationevent_template_key",
    ):
        if name in indexes:
            op.drop_index(name, table_name="notificationevent")
    columns = _columns()
    for name in (
        "processing_started_at",
        "next_attempt_at",
        "max_attempts",
        "attempt_count",
        "dedupe_key",
        "template_key",
    ):
        if name in columns:
            op.drop_column("notificationevent", name)
