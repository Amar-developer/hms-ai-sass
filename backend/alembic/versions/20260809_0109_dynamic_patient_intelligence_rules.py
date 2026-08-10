"""Make Patient Intelligence rules and badge/action behavior tenant configurable."""

import sqlalchemy as sa
from alembic import op


revision = "20260809_0109"
down_revision = "20260809_0108"
branch_labels = None
depends_on = None


def _column_exists(table_name: str, column_name: str) -> bool:
    return any(
        column["name"] == column_name
        for column in sa.inspect(op.get_bind()).get_columns(table_name)
    )


def _index_exists(table_name: str, index_name: str) -> bool:
    return any(
        index["name"] == index_name
        for index in sa.inspect(op.get_bind()).get_indexes(table_name)
    )


def upgrade() -> None:
    columns = (
        sa.Column("threshold_secondary", sa.Numeric(14, 2), nullable=True),
        sa.Column("badge_label", sa.String(80), nullable=True),
        sa.Column("badge_background_color", sa.String(20), nullable=True),
        sa.Column("badge_text_color", sa.String(20), nullable=True),
        sa.Column("badge_border_color", sa.String(20), nullable=True),
        sa.Column(
            "display_as_patient_badge",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
        sa.Column("priority", sa.Integer(), nullable=False, server_default="100"),
        sa.Column("exclusive_group", sa.String(100), nullable=True),
        sa.Column(
            "required_flag_keys_json",
            sa.String(4000),
            nullable=False,
            server_default="[]",
        ),
        sa.Column("expires_after_days", sa.Integer(), nullable=True),
        sa.Column(
            "auto_resolve", sa.Boolean(), nullable=False, server_default=sa.true()
        ),
        sa.Column(
            "action_enabled", sa.Boolean(), nullable=False, server_default=sa.false()
        ),
        sa.Column("action_key", sa.String(100), nullable=True),
        sa.Column("action_channel", sa.String(30), nullable=True),
        sa.Column("action_template_key", sa.String(120), nullable=True),
        sa.Column(
            "action_requires_approval",
            sa.Boolean(),
            nullable=False,
            server_default=sa.true(),
        ),
        sa.Column("action_cooldown_days", sa.Integer(), nullable=True),
    )
    for column in columns:
        if not _column_exists("patientintelligencerule", column.name):
            op.add_column("patientintelligencerule", column)
    for column in (
        "display_as_patient_badge",
        "priority",
        "exclusive_group",
        "action_enabled",
    ):
        index_name = f"ix_patientintelligencerule_{column}"
        if not _index_exists("patientintelligencerule", index_name):
            op.create_index(index_name, "patientintelligencerule", [column])

    # Preserve legacy tenants as editable configuration. These values live in
    # tenant rows after migration and are never runtime application defaults.
    legacy_badges = {
        "PREMIUM_PATIENT": ("Premium", "#ede9fe", "#5b21b6", "#c4b5fd", 10),
        "GOLD_PATIENT": ("Gold", "#fef3c7", "#92400e", "#fcd34d", 20),
        "SILVER_PATIENT": ("Silver", "#f1f5f9", "#334155", "#cbd5e1", 30),
    }
    table = sa.table(
        "patientintelligencerule",
        sa.column("flag_key", sa.String),
        sa.column("badge_label", sa.String),
        sa.column("badge_background_color", sa.String),
        sa.column("badge_text_color", sa.String),
        sa.column("badge_border_color", sa.String),
        sa.column("display_as_patient_badge", sa.Boolean),
        sa.column("priority", sa.Integer),
        sa.column("exclusive_group", sa.String),
        sa.column("metric_key", sa.String),
        sa.column("operator", sa.String),
        sa.column("threshold", sa.Numeric),
        sa.column("threshold_secondary", sa.Numeric),
        sa.column("action_enabled", sa.Boolean),
        sa.column("action_key", sa.String),
        sa.column("action_channel", sa.String),
        sa.column("action_template_key", sa.String),
        sa.column("action_requires_approval", sa.Boolean),
        sa.column("action_cooldown_days", sa.Integer),
    )
    for flag_key, (label, background, text, border, priority) in legacy_badges.items():
        op.execute(
            table.update()
            .where(table.c.flag_key == flag_key)
            .values(
                badge_label=label,
                badge_background_color=background,
                badge_text_color=text,
                badge_border_color=border,
                display_as_patient_badge=True,
                priority=priority,
                exclusive_group="patient_value_tier",
            )
        )

    op.execute(
        table.update()
        .where(table.c.flag_key == "MONTHLY_MEDICINE")
        .values(threshold_secondary=21)
    )
    op.execute(
        table.update()
        .where(table.c.flag_key == "REFILL_DUE")
        .values(
            metric_key="days_until_expected_refill",
            operator="between",
            threshold=-7,
            threshold_secondary=14,
        )
    )
    legacy_actions = {
        "REFILL_DUE": ("medicine_refill", "medicine_refill_patient", False),
        "MEMBERSHIP_RENEWAL_DUE": (
            "membership_renewal",
            "membership_renewal_patient",
            False,
        ),
        "APPOINTMENT_NO_SHOW": ("no_show_rebooking", "patient_reengagement", True),
        "HIGH_VALUE_AT_RISK": ("patient_check_in", "patient_reengagement", True),
    }
    for flag_key, (action_key, template_key, approval) in legacy_actions.items():
        op.execute(
            table.update()
            .where(table.c.flag_key == flag_key)
            .values(
                action_enabled=True,
                action_key=action_key,
                action_channel="whatsapp",
                action_template_key=template_key,
                action_requires_approval=approval,
            )
        )


def downgrade() -> None:
    for column in (
        "action_enabled",
        "exclusive_group",
        "priority",
        "display_as_patient_badge",
    ):
        op.drop_index(
            f"ix_patientintelligencerule_{column}", table_name="patientintelligencerule"
        )
    for column in (
        "action_cooldown_days",
        "action_requires_approval",
        "action_template_key",
        "action_channel",
        "action_key",
        "action_enabled",
        "auto_resolve",
        "expires_after_days",
        "required_flag_keys_json",
        "exclusive_group",
        "priority",
        "display_as_patient_badge",
        "badge_border_color",
        "badge_text_color",
        "badge_background_color",
        "badge_label",
        "threshold_secondary",
    ):
        op.drop_column("patientintelligencerule", column)
