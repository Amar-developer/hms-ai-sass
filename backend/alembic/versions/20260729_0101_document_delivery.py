"""Add unified artifact-pinned document delivery outbox."""

import sqlalchemy as sa
from alembic import op


revision = "20260729_0101"
down_revision = "20260729_0100"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "documentdelivery" not in inspector.get_table_names():
        op.create_table(
            "documentdelivery",
            sa.Column("id", sa.String(), nullable=False),
            sa.Column("tenant_id", sa.String(), nullable=False),
            sa.Column("branch_id", sa.String(), nullable=True),
            sa.Column("channel", sa.String(length=20), nullable=False),
            sa.Column("status", sa.String(length=20), nullable=False),
            sa.Column("resource_type", sa.String(length=80), nullable=False),
            sa.Column("resource_id", sa.String(length=120), nullable=False),
            sa.Column("artifact_file_id", sa.String(), nullable=False),
            sa.Column("artifact_version", sa.Integer(), nullable=False),
            sa.Column("artifact_file_ids_json", sa.String(length=8000), nullable=False),
            sa.Column("recipient", sa.String(length=2000), nullable=False),
            sa.Column("subject", sa.String(length=240), nullable=True),
            sa.Column("message", sa.String(length=4000), nullable=True),
            sa.Column("idempotency_key", sa.String(length=320), nullable=False),
            sa.Column("notification_event_id", sa.String(), nullable=True),
            sa.Column("provider_message_id", sa.String(length=200), nullable=True),
            sa.Column("failure_reason", sa.String(length=1000), nullable=True),
            sa.Column("attempt_count", sa.Integer(), nullable=False),
            sa.Column("max_attempts", sa.Integer(), nullable=False),
            sa.Column("next_attempt_at", sa.DateTime(), nullable=False),
            sa.Column("processing_started_at", sa.DateTime(), nullable=True),
            sa.Column("queued_by_user_id", sa.String(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
            sa.Column("sent_at", sa.DateTime(), nullable=True),
            sa.ForeignKeyConstraint(["tenant_id"], ["tenant.id"]),
            sa.ForeignKeyConstraint(["branch_id"], ["branch.id"]),
            sa.ForeignKeyConstraint(["artifact_file_id"], ["filedocument.id"]),
            sa.ForeignKeyConstraint(
                ["notification_event_id"], ["notificationevent.id"]
            ),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint(
                "tenant_id",
                "channel",
                "idempotency_key",
                name="uq_documentdelivery_tenant_channel_idempotency",
            ),
        )
        for column in (
            "tenant_id",
            "branch_id",
            "channel",
            "status",
            "resource_type",
            "resource_id",
            "artifact_file_id",
            "notification_event_id",
            "next_attempt_at",
            "processing_started_at",
            "queued_by_user_id",
            "created_at",
            "sent_at",
        ):
            op.create_index(
                f"ix_documentdelivery_{column}", "documentdelivery", [column]
            )
        op.create_index(
            "ix_documentdelivery_due",
            "documentdelivery",
            ["channel", "status", "next_attempt_at"],
        )
        id_expression = (
            "concat('delivery_legacy_', n.id)"
            if bind.dialect.name == "postgresql"
            else "'delivery_legacy_' || n.id"
        )
        op.execute(
            sa.text(
                f"""
                insert into documentdelivery (
                    id, tenant_id, branch_id, channel, status, resource_type,
                    resource_id, artifact_file_id, artifact_version,
                    artifact_file_ids_json, recipient, subject, message,
                    idempotency_key, notification_event_id, provider_message_id,
                    failure_reason, attempt_count, max_attempts, next_attempt_at,
                    processing_started_at, queued_by_user_id, created_at,
                    updated_at, sent_at
                )
                select {id_expression}, n.tenant_id, n.branch_id, 'WHATSAPP',
                       n.status, n.resource_type, n.resource_id,
                       n.artifact_file_id, coalesce(n.artifact_version, 1),
                       '[\"' || n.artifact_file_id || '\"]', n.recipient,
                       n.subject, n.message, coalesce(n.dedupe_key, n.id), n.id,
                       n.provider_message_id, n.failure_reason, n.attempt_count,
                       n.max_attempts, n.next_attempt_at, n.processing_started_at,
                       n.queued_by_user_id, n.created_at, n.updated_at, n.sent_at
                from notificationevent n
                where n.artifact_file_id is not null
                  and n.resource_type in ('invoice', 'lab_order')
                """
            )
        )

    report_columns = {
        column["name"] for column in sa.inspect(bind).get_columns("reportjob")
    }
    if "artifact_file_id" not in report_columns:
        op.add_column(
            "reportjob",
            sa.Column(
                "artifact_file_id",
                sa.String(),
                sa.ForeignKey("filedocument.id"),
                nullable=True,
            ),
        )
        op.create_index(
            "ix_reportjob_artifact_file_id", "reportjob", ["artifact_file_id"]
        )
    if "artifact_file_ids_json" not in report_columns:
        op.add_column(
            "reportjob",
            sa.Column(
                "artifact_file_ids_json",
                sa.String(),
                nullable=False,
                server_default="[]",
            ),
        )
    file_columns = {
        column["name"] for column in sa.inspect(bind).get_columns("filedocument")
    }
    file_additions = {
        "retention_class": sa.Column(
            "retention_class",
            sa.String(length=40),
            nullable=False,
            server_default="permanent",
        ),
        "retention_until": sa.Column("retention_until", sa.DateTime(), nullable=True),
        "legal_hold": sa.Column(
            "legal_hold", sa.Boolean(), nullable=False, server_default=sa.false()
        ),
    }
    for name, column in file_additions.items():
        if name not in file_columns:
            op.add_column("filedocument", column)
            op.create_index(f"ix_filedocument_{name}", "filedocument", [name])


def downgrade() -> None:
    for name in ("legal_hold", "retention_until", "retention_class"):
        op.drop_index(f"ix_filedocument_{name}", table_name="filedocument")
        op.drop_column("filedocument", name)
    op.drop_column("reportjob", "artifact_file_ids_json")
    op.drop_index("ix_reportjob_artifact_file_id", table_name="reportjob")
    op.drop_column("reportjob", "artifact_file_id")
    op.drop_table("documentdelivery")
