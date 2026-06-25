"""report jobs

Revision ID: 20260519_0032
Revises: 20260515_0031
Create Date: 2026-05-19
"""

from alembic import op
import sqlalchemy as sa


revision = "20260519_0032"
down_revision = "20260515_0031"
branch_labels = None
depends_on = None


def _tables() -> set[str]:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    return set(inspector.get_table_names())


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        with op.get_context().autocommit_block():
            op.execute(
                "ALTER TYPE settingkey ADD VALUE IF NOT EXISTS 'REPORT_MONTHLY_EMAIL_ENABLED'"
            )
            op.execute(
                "ALTER TYPE settingkey ADD VALUE IF NOT EXISTS 'REPORT_MONTHLY_EMAIL_RECIPIENTS'"
            )
            op.execute(
                "ALTER TYPE settingkey ADD VALUE IF NOT EXISTS 'REPORT_MONTHLY_EMAIL_CC'"
            )
            op.execute(
                "ALTER TYPE settingkey ADD VALUE IF NOT EXISTS 'REPORT_MONTHLY_EMAIL_SEND_DAY'"
            )
            op.execute(
                "ALTER TYPE settingkey ADD VALUE IF NOT EXISTS 'REPORT_MONTHLY_EMAIL_FILTERS'"
            )
            op.execute(
                "ALTER TYPE settingkey ADD VALUE IF NOT EXISTS 'REPORT_MONTHLY_EMAIL_LAST_SENT_PERIOD'"
            )
    if "reportjob" not in _tables():
        op.create_table(
            "reportjob",
            sa.Column("id", sa.String(), nullable=False),
            sa.Column("tenant_id", sa.String(), nullable=False),
            sa.Column("branch_id", sa.String(), nullable=True),
            sa.Column("status", sa.String(), nullable=False),
            sa.Column("report_type", sa.String(length=80), nullable=False),
            sa.Column("period_start", sa.String(length=10), nullable=False),
            sa.Column("period_end", sa.String(length=10), nullable=False),
            sa.Column("recipients_json", sa.String(), nullable=False),
            sa.Column("cc_json", sa.String(), nullable=False),
            sa.Column("filters_json", sa.String(), nullable=False),
            sa.Column("attachment_filename", sa.String(length=220), nullable=True),
            sa.Column("provider_message_id", sa.String(length=160), nullable=True),
            sa.Column("failure_reason", sa.String(length=1000), nullable=True),
            sa.Column("queued_by_user_id", sa.String(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
            sa.Column("started_at", sa.DateTime(), nullable=True),
            sa.Column("sent_at", sa.DateTime(), nullable=True),
            sa.ForeignKeyConstraint(["branch_id"], ["branch.id"]),
            sa.ForeignKeyConstraint(["tenant_id"], ["tenant.id"]),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index("ix_reportjob_tenant_id", "reportjob", ["tenant_id"])
        op.create_index("ix_reportjob_branch_id", "reportjob", ["branch_id"])
        op.create_index("ix_reportjob_status", "reportjob", ["status"])
        op.create_index("ix_reportjob_report_type", "reportjob", ["report_type"])
        op.create_index("ix_reportjob_period_start", "reportjob", ["period_start"])
        op.create_index("ix_reportjob_period_end", "reportjob", ["period_end"])
        op.create_index(
            "ix_reportjob_queued_by_user_id", "reportjob", ["queued_by_user_id"]
        )
        op.create_index("ix_reportjob_created_at", "reportjob", ["created_at"])
        op.create_index("ix_reportjob_started_at", "reportjob", ["started_at"])
        op.create_index("ix_reportjob_sent_at", "reportjob", ["sent_at"])


def downgrade() -> None:
    if "reportjob" in _tables():
        op.drop_index("ix_reportjob_sent_at", table_name="reportjob")
        op.drop_index("ix_reportjob_started_at", table_name="reportjob")
        op.drop_index("ix_reportjob_created_at", table_name="reportjob")
        op.drop_index("ix_reportjob_queued_by_user_id", table_name="reportjob")
        op.drop_index("ix_reportjob_period_end", table_name="reportjob")
        op.drop_index("ix_reportjob_period_start", table_name="reportjob")
        op.drop_index("ix_reportjob_report_type", table_name="reportjob")
        op.drop_index("ix_reportjob_status", table_name="reportjob")
        op.drop_index("ix_reportjob_branch_id", table_name="reportjob")
        op.drop_index("ix_reportjob_tenant_id", table_name="reportjob")
        op.drop_table("reportjob")
