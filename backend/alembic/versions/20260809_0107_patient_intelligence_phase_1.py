"""Add subscription-entitled Patient Intelligence phase 1 tables."""

import sqlalchemy as sa
from alembic import op


revision = "20260809_0107"
down_revision = "20260806_0106"
branch_labels = None
depends_on = None


def _table_exists(table_name: str) -> bool:
    return sa.inspect(op.get_bind()).has_table(table_name)


def _index_exists(table_name: str, index_name: str) -> bool:
    return any(
        index["name"] == index_name
        for index in sa.inspect(op.get_bind()).get_indexes(table_name)
    )


def _create_index_if_missing(
    index_name: str, table_name: str, columns: list[str]
) -> None:
    if _table_exists(table_name) and not _index_exists(table_name, index_name):
        op.create_index(index_name, table_name, columns)


def upgrade() -> None:
    if not _table_exists("patientintelligencerule"):
        op.create_table(
            "patientintelligencerule",
            sa.Column("id", sa.String(), nullable=False),
            sa.Column("tenant_id", sa.String(), nullable=False),
            sa.Column("rule_key", sa.String(100), nullable=False),
            sa.Column("name", sa.String(180), nullable=False),
            sa.Column("category", sa.String(16), nullable=False),
            sa.Column("metric_key", sa.String(100), nullable=False),
            sa.Column("operator", sa.String(16), nullable=False),
            sa.Column("threshold", sa.Numeric(14, 2), nullable=False),
            sa.Column("window_days", sa.Integer(), nullable=True),
            sa.Column("flag_key", sa.String(100), nullable=False),
            sa.Column("severity", sa.String(20), nullable=False),
            sa.Column("is_enabled", sa.Boolean(), nullable=False),
            sa.Column("version", sa.Integer(), nullable=False),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
            sa.ForeignKeyConstraint(["tenant_id"], ["tenant.id"]),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("tenant_id", "rule_key", name="uq_pi_rule_tenant_key"),
        )
    if not _table_exists("patientmetricsnapshot"):
        op.create_table(
            "patientmetricsnapshot",
            sa.Column("id", sa.String(), nullable=False),
            sa.Column("tenant_id", sa.String(), nullable=False),
            sa.Column("patient_id", sa.String(), nullable=False),
            sa.Column("first_activity_at", sa.DateTime(), nullable=True),
            sa.Column("last_activity_at", sa.DateTime(), nullable=True),
            sa.Column("completed_visits", sa.Integer(), nullable=False),
            sa.Column("no_show_count", sa.Integer(), nullable=False),
            sa.Column("lab_order_count", sa.Integer(), nullable=False),
            sa.Column("pharmacy_dispense_count", sa.Integer(), nullable=False),
            sa.Column("home_care_visit_count", sa.Integer(), nullable=False),
            sa.Column("net_collected_30d", sa.Numeric(14, 2), nullable=False),
            sa.Column("net_collected_365d", sa.Numeric(14, 2), nullable=False),
            sa.Column("lifetime_net_collected", sa.Numeric(14, 2), nullable=False),
            sa.Column("outstanding_amount", sa.Numeric(14, 2), nullable=False),
            sa.Column("active_membership", sa.Boolean(), nullable=False),
            sa.Column("membership_ends_on", sa.DateTime(), nullable=True),
            sa.Column("expected_refill_at", sa.DateTime(), nullable=True),
            sa.Column("recurring_medicine_id", sa.String(120), nullable=True),
            sa.Column("recurring_interval_days", sa.Integer(), nullable=True),
            sa.Column("evidence_json", sa.String(12000), nullable=False),
            sa.Column("calculated_at", sa.DateTime(), nullable=False),
            sa.Column("calculation_version", sa.Integer(), nullable=False),
            sa.ForeignKeyConstraint(["patient_id"], ["patient.id"]),
            sa.ForeignKeyConstraint(["tenant_id"], ["tenant.id"]),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint(
                "tenant_id", "patient_id", name="uq_pi_metric_tenant_patient"
            ),
        )
    if not _table_exists("patientintelligenceflag"):
        op.create_table(
            "patientintelligenceflag",
            sa.Column("id", sa.String(), nullable=False),
            sa.Column("tenant_id", sa.String(), nullable=False),
            sa.Column("branch_id", sa.String(), nullable=True),
            sa.Column("patient_id", sa.String(), nullable=False),
            sa.Column("rule_id", sa.String(), nullable=True),
            sa.Column("flag_key", sa.String(100), nullable=False),
            sa.Column("category", sa.String(16), nullable=False),
            sa.Column("severity", sa.String(20), nullable=False),
            sa.Column("status", sa.String(12), nullable=False),
            sa.Column("explanation", sa.String(1000), nullable=False),
            sa.Column("evidence_json", sa.String(12000), nullable=False),
            sa.Column("first_detected_at", sa.DateTime(), nullable=False),
            sa.Column("last_detected_at", sa.DateTime(), nullable=False),
            sa.Column("resolved_at", sa.DateTime(), nullable=True),
            sa.Column("assigned_to_user_id", sa.String(), nullable=True),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
            sa.ForeignKeyConstraint(["branch_id"], ["branch.id"]),
            sa.ForeignKeyConstraint(["patient_id"], ["patient.id"]),
            sa.ForeignKeyConstraint(["rule_id"], ["patientintelligencerule.id"]),
            sa.ForeignKeyConstraint(["tenant_id"], ["tenant.id"]),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint(
                "tenant_id", "patient_id", "flag_key", name="uq_pi_flag_patient_key"
            ),
        )
    if not _table_exists("patientintelligenceflaghistory"):
        op.create_table(
            "patientintelligenceflaghistory",
            sa.Column("id", sa.String(), nullable=False),
            sa.Column("tenant_id", sa.String(), nullable=False),
            sa.Column("patient_id", sa.String(), nullable=False),
            sa.Column("flag_id", sa.String(), nullable=False),
            sa.Column("from_status", sa.String(30), nullable=True),
            sa.Column("to_status", sa.String(30), nullable=False),
            sa.Column("reason", sa.String(1000), nullable=False),
            sa.Column("evidence_json", sa.String(12000), nullable=False),
            sa.Column("actor_user_id", sa.String(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.ForeignKeyConstraint(["flag_id"], ["patientintelligenceflag.id"]),
            sa.ForeignKeyConstraint(["patient_id"], ["patient.id"]),
            sa.ForeignKeyConstraint(["tenant_id"], ["tenant.id"]),
            sa.PrimaryKeyConstraint("id"),
        )
    if not _table_exists("patientengagementaction"):
        op.create_table(
            "patientengagementaction",
            sa.Column("id", sa.String(), nullable=False),
            sa.Column("tenant_id", sa.String(), nullable=False),
            sa.Column("branch_id", sa.String(), nullable=True),
            sa.Column("patient_id", sa.String(), nullable=False),
            sa.Column("source_flag_id", sa.String(), nullable=True),
            sa.Column("action_key", sa.String(100), nullable=False),
            sa.Column("channel", sa.String(30), nullable=False),
            sa.Column("template_key", sa.String(120), nullable=False),
            sa.Column("status", sa.String(11), nullable=False),
            sa.Column("requires_approval", sa.Boolean(), nullable=False),
            sa.Column("personalization_json", sa.String(12000), nullable=False),
            sa.Column("reason", sa.String(1000), nullable=False),
            sa.Column("dedupe_key", sa.String(240), nullable=False),
            sa.Column("notification_event_id", sa.String(), nullable=True),
            sa.Column("approved_by_user_id", sa.String(), nullable=True),
            sa.Column("approved_at", sa.DateTime(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
            sa.ForeignKeyConstraint(["branch_id"], ["branch.id"]),
            sa.ForeignKeyConstraint(
                ["notification_event_id"], ["notificationevent.id"]
            ),
            sa.ForeignKeyConstraint(["patient_id"], ["patient.id"]),
            sa.ForeignKeyConstraint(["source_flag_id"], ["patientintelligenceflag.id"]),
            sa.ForeignKeyConstraint(["tenant_id"], ["tenant.id"]),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint(
                "tenant_id", "dedupe_key", name="uq_pi_action_tenant_dedupe"
            ),
        )
    for table, columns in {
        "patientintelligencerule": (
            "tenant_id",
            "rule_key",
            "metric_key",
            "flag_key",
            "is_enabled",
            "created_at",
        ),
        "patientmetricsnapshot": (
            "tenant_id",
            "patient_id",
            "last_activity_at",
            "active_membership",
            "membership_ends_on",
            "expected_refill_at",
            "recurring_medicine_id",
            "calculated_at",
        ),
        "patientintelligenceflag": (
            "tenant_id",
            "branch_id",
            "patient_id",
            "rule_id",
            "flag_key",
            "category",
            "severity",
            "status",
            "first_detected_at",
            "last_detected_at",
            "resolved_at",
            "assigned_to_user_id",
        ),
        "patientintelligenceflaghistory": (
            "tenant_id",
            "patient_id",
            "flag_id",
            "actor_user_id",
            "created_at",
        ),
        "patientengagementaction": (
            "tenant_id",
            "branch_id",
            "patient_id",
            "source_flag_id",
            "action_key",
            "channel",
            "template_key",
            "status",
            "requires_approval",
            "notification_event_id",
            "approved_by_user_id",
            "approved_at",
            "created_at",
        ),
    }.items():
        for column in columns:
            _create_index_if_missing(f"ix_{table}_{column}", table, [column])
    _create_index_if_missing(
        "ix_pi_metric_tenant_last_activity",
        "patientmetricsnapshot",
        ["tenant_id", "last_activity_at"],
    )
    _create_index_if_missing(
        "ix_pi_flag_tenant_status",
        "patientintelligenceflag",
        ["tenant_id", "status", "severity"],
    )
    _create_index_if_missing(
        "ix_pi_action_tenant_status",
        "patientengagementaction",
        ["tenant_id", "status", "created_at"],
    )


def downgrade() -> None:
    op.drop_table("patientengagementaction")
    op.drop_table("patientintelligenceflaghistory")
    op.drop_table("patientintelligenceflag")
    op.drop_table("patientmetricsnapshot")
    op.drop_table("patientintelligencerule")
