"""Add SMS foundation fields."""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op


revision = "20260830_0130"
down_revision = "20260828_0129"
branch_labels = None
depends_on = None


def _table_exists(table_name: str) -> bool:
    return sa.inspect(op.get_bind()).has_table(table_name)


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


def _add_column(table_name: str, column: sa.Column) -> None:
    if _table_exists(table_name) and not _column_exists(table_name, column.name):
        op.add_column(table_name, column)


def _create_index(table_name: str, index_name: str, columns: list[str]) -> None:
    if _table_exists(table_name) and not _index_exists(table_name, index_name):
        op.create_index(index_name, table_name, columns)


def upgrade() -> None:
    _add_column("patient", sa.Column("sms_consent_status", sa.String(length=12)))
    _add_column("patient", sa.Column("sms_consent_source", sa.String(length=80)))
    _add_column("patient", sa.Column("sms_consent_updated_at", sa.DateTime()))
    _add_column("patient", sa.Column("sms_preferred_language", sa.String(length=20)))
    if _table_exists("patient"):
        op.get_bind().execute(
            sa.text(
                """
                UPDATE patient
                SET sms_consent_status = COALESCE(sms_consent_status, 'NOT_RECORDED'),
                    sms_preferred_language = COALESCE(sms_preferred_language, 'en')
                """
            )
        )
    _create_index("patient", "ix_patient_sms_consent_status", ["sms_consent_status"])
    _create_index(
        "patient", "ix_patient_sms_consent_updated_at", ["sms_consent_updated_at"]
    )

    for column in (
        sa.Column("provider_adapter", sa.String(length=80)),
        sa.Column("provider_status", sa.String(length=120)),
        sa.Column("provider_error_code", sa.String(length=120)),
        sa.Column("delivery_status", sa.String(length=80)),
        sa.Column("template_external_id", sa.String(length=120)),
        sa.Column("template_version", sa.String(length=80)),
        sa.Column("sender_id", sa.String(length=40)),
        sa.Column("rendered_body_hash", sa.String(length=128)),
        sa.Column("segment_count", sa.Integer()),
        sa.Column("accepted_at", sa.DateTime()),
        sa.Column("delivered_at", sa.DateTime()),
        sa.Column("callback_updated_at", sa.DateTime()),
    ):
        _add_column("notificationevent", column)
    _create_index(
        "notificationevent",
        "ix_notificationevent_provider_message_id",
        ["provider_message_id"],
    )
    _create_index(
        "notificationevent", "ix_notificationevent_delivery_status", ["delivery_status"]
    )
    _create_index(
        "notificationevent", "ix_notificationevent_accepted_at", ["accepted_at"]
    )
    _create_index(
        "notificationevent", "ix_notificationevent_delivered_at", ["delivered_at"]
    )
    _create_index(
        "notificationevent",
        "ix_notificationevent_callback_updated_at",
        ["callback_updated_at"],
    )


def downgrade() -> None:
    for table_name, index_name in (
        ("notificationevent", "ix_notificationevent_callback_updated_at"),
        ("notificationevent", "ix_notificationevent_delivered_at"),
        ("notificationevent", "ix_notificationevent_accepted_at"),
        ("notificationevent", "ix_notificationevent_delivery_status"),
        ("notificationevent", "ix_notificationevent_provider_message_id"),
        ("patient", "ix_patient_sms_consent_updated_at"),
        ("patient", "ix_patient_sms_consent_status"),
    ):
        if _table_exists(table_name) and _index_exists(table_name, index_name):
            op.drop_index(index_name, table_name=table_name)
    for table_name, column_name in (
        ("notificationevent", "callback_updated_at"),
        ("notificationevent", "delivered_at"),
        ("notificationevent", "accepted_at"),
        ("notificationevent", "segment_count"),
        ("notificationevent", "rendered_body_hash"),
        ("notificationevent", "sender_id"),
        ("notificationevent", "template_version"),
        ("notificationevent", "template_external_id"),
        ("notificationevent", "delivery_status"),
        ("notificationevent", "provider_error_code"),
        ("notificationevent", "provider_status"),
        ("notificationevent", "provider_adapter"),
        ("patient", "sms_preferred_language"),
        ("patient", "sms_consent_updated_at"),
        ("patient", "sms_consent_source"),
        ("patient", "sms_consent_status"),
    ):
        if _table_exists(table_name) and _column_exists(table_name, column_name):
            op.drop_column(table_name, column_name)
