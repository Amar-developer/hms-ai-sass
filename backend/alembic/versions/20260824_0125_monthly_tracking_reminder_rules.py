"""Add monthly medicine and lab reminder rules."""

from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

import sqlalchemy as sa
from alembic import op


revision = "20260824_0125"
down_revision = "20260824_0124"
branch_labels = None
depends_on = None


TABLE = "patientintelligencerule"


def _new_id(prefix: str) -> str:
    return f"{prefix}_{uuid4().hex[:12]}"


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _table_exists(table_name: str) -> bool:
    return sa.inspect(op.get_bind()).has_table(table_name)


def _rule(conn, tenant_id: str, rule_key: str):
    return conn.execute(
        sa.text(
            f"""
            SELECT id
            FROM {TABLE}
            WHERE tenant_id = :tenant_id AND rule_key = :rule_key
            LIMIT 1
            """
        ),
        {"tenant_id": tenant_id, "rule_key": rule_key},
    ).first()


def _update_rule(conn, rule_id: str, values: dict) -> None:
    payload = {**values, "updated_at": _now()}
    assignments = ", ".join(f"{key} = :{key}" for key in payload)
    conn.execute(
        sa.text(f"UPDATE {TABLE} SET {assignments} WHERE id = :id"),
        {**payload, "id": rule_id},
    )


def _insert_rule(conn, tenant_id: str, values: dict) -> None:
    payload = {
        "id": _new_id("pirule"),
        "tenant_id": tenant_id,
        "threshold_secondary": None,
        "window_days": None,
        "required_flag_keys_json": "[]",
        "expires_after_days": None,
        "auto_resolve": True,
        "requires_active_membership": False,
        "version": 1,
        "created_at": _now(),
        "updated_at": _now(),
        **values,
    }
    columns = ", ".join(payload.keys())
    params = ", ".join(f":{key}" for key in payload.keys())
    conn.execute(sa.text(f"INSERT INTO {TABLE} ({columns}) VALUES ({params})"), payload)


def _upsert_rule(conn, tenant_id: str, rule_key: str, values: dict) -> None:
    existing = _rule(conn, tenant_id, rule_key)
    if existing:
        _update_rule(conn, existing.id, values)
    else:
        _insert_rule(conn, tenant_id, {"rule_key": rule_key, **values})


def _rule_values(
    *,
    name: str,
    metric_key: str,
    flag_key: str,
    action_key: str,
    action_template_key: str,
    priority: int,
) -> dict:
    return {
        "name": name,
        "category": "RECURRING",
        "metric_key": metric_key,
        "operator": "lte",
        "threshold": 7,
        "threshold_secondary": None,
        "window_days": None,
        "flag_key": flag_key,
        "severity": "warning",
        "badge_label": None,
        "badge_background_color": None,
        "badge_text_color": None,
        "badge_border_color": None,
        "display_as_patient_badge": False,
        "priority": priority,
        "exclusive_group": None,
        "score_dimension": "engagement",
        "score_weight": 10,
        "required_flag_keys_json": "[]",
        "expires_after_days": None,
        "auto_resolve": True,
        "requires_active_membership": False,
        "action_enabled": True,
        "action_key": action_key,
        "action_channel": "whatsapp",
        "action_template_key": action_template_key,
        "action_requires_approval": False,
        "action_cooldown_days": 25,
        "is_enabled": True,
        "version": 1,
    }


def upgrade() -> None:
    if not _table_exists(TABLE):
        return
    conn = op.get_bind()
    tenant_ids = {
        row.tenant_id
        for row in conn.execute(sa.text(f"SELECT DISTINCT tenant_id FROM {TABLE}"))
    }
    for tenant_id in tenant_ids:
        _upsert_rule(
            conn,
            tenant_id,
            "monthly_medicine_refill_reminder",
            _rule_values(
                name="Monthly medicine refill reminder",
                metric_key="days_until_expected_refill",
                flag_key="MONTHLY_MEDICINE_REFILL_DUE",
                action_key="monthly_medicine_refill_reminder",
                action_template_key="medicine_refill_patient",
                priority=80,
            ),
        )
        _upsert_rule(
            conn,
            tenant_id,
            "monthly_lab_test_reminder",
            _rule_values(
                name="Monthly lab test reminder",
                metric_key="days_until_expected_lab_test",
                flag_key="MONTHLY_LAB_TEST_DUE",
                action_key="monthly_lab_test_reminder",
                action_template_key="lab_test_reminder_patient",
                priority=81,
            ),
        )


def downgrade() -> None:
    if not _table_exists(TABLE):
        return
    conn = op.get_bind()
    conn.execute(
        sa.text(
            f"""
            DELETE FROM {TABLE}
            WHERE rule_key IN (
                'monthly_medicine_refill_reminder',
                'monthly_lab_test_reminder'
            )
            """
        )
    )
