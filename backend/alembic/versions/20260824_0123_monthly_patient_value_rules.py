"""Rewrite existing patient value rules to monthly tier configuration."""

from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

import sqlalchemy as sa
from alembic import op


revision = "20260824_0123"
down_revision = "20260820_0122"
branch_labels = None
depends_on = None


TABLE = "patientintelligencerule"
VALUE_GROUP = "patient_value_tier"


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
    values = {**values, "updated_at": _now()}
    assignments = ", ".join(f"{key} = :{key}" for key in values)
    conn.execute(
        sa.text(f"UPDATE {TABLE} SET {assignments} WHERE id = :id"),
        {**values, "id": rule_id},
    )


def _insert_rule(conn, tenant_id: str, values: dict) -> None:
    payload = {
        "id": _new_id("pirule"),
        "tenant_id": tenant_id,
        "threshold_secondary": None,
        "window_days": None,
        "required_flag_keys_json": "[]",
        "expires_after_days": None,
        "action_enabled": False,
        "action_key": None,
        "action_channel": None,
        "action_template_key": None,
        "action_requires_approval": False,
        "action_cooldown_days": None,
        "version": 1,
        "created_at": _now(),
        "updated_at": _now(),
        **values,
    }
    columns = ", ".join(payload.keys())
    params = ", ".join(f":{key}" for key in payload.keys())
    conn.execute(sa.text(f"INSERT INTO {TABLE} ({columns}) VALUES ({params})"), payload)


def _upsert_rule(
    conn,
    *,
    tenant_id: str,
    rule_key: str,
    replace_keys: tuple[str, ...],
    values: dict,
) -> None:
    existing = _rule(conn, tenant_id, rule_key)
    if existing:
        _update_rule(conn, existing.id, values)
        target_id = existing.id
    else:
        target = next(
            (row for key in replace_keys if (row := _rule(conn, tenant_id, key))),
            None,
        )
        if target:
            _update_rule(conn, target.id, {"rule_key": rule_key, **values})
            target_id = target.id
        else:
            _insert_rule(conn, tenant_id, {"rule_key": rule_key, **values})
            target_id = None

    for key in replace_keys:
        if key == rule_key:
            continue
        row = _rule(conn, tenant_id, key)
        if row and row.id != target_id:
            _update_rule(conn, row.id, {"is_enabled": False})


def _rule_values(
    *,
    name: str,
    flag_key: str,
    threshold: int,
    priority: int,
    badge_label: str,
    badge_background_color: str,
    badge_text_color: str,
    badge_border_color: str,
    requires_active_membership: bool = False,
    score_weight: int,
) -> dict:
    return {
        "name": name,
        "category": "VALUE",
        "metric_key": "net_collected_30d",
        "operator": "gte",
        "threshold": threshold,
        "threshold_secondary": None,
        "window_days": None,
        "flag_key": flag_key,
        "severity": "success",
        "badge_label": badge_label,
        "badge_background_color": badge_background_color,
        "badge_text_color": badge_text_color,
        "badge_border_color": badge_border_color,
        "display_as_patient_badge": True,
        "priority": priority,
        "exclusive_group": VALUE_GROUP,
        "score_dimension": "value",
        "score_weight": score_weight,
        "required_flag_keys_json": "[]",
        "expires_after_days": 60,
        "auto_resolve": False,
        "requires_active_membership": requires_active_membership,
        "action_enabled": False,
        "action_key": None,
        "action_channel": None,
        "action_template_key": None,
        "action_requires_approval": False,
        "action_cooldown_days": None,
        "is_enabled": True,
        "version": 1,
    }


def upgrade() -> None:
    if not _table_exists(TABLE):
        return
    conn = op.get_bind()
    tenants = [
        row.tenant_id
        for row in conn.execute(
            sa.text(
                f"""
                SELECT DISTINCT tenant_id
                FROM {TABLE}
                WHERE rule_key IN (
                    'premium_patient_value',
                    'gold_patient_value',
                    'silver_patient_value',
                    'valuable_recent_patient',
                    'active_membership_patient',
                    'membership_benefits_due',
                    'premium_monthly_member',
                    'premium_monthly_collection',
                    'gold_monthly_collection',
                    'silver_monthly_collection'
                )
                OR flag_key IN (
                    'PREMIUM_PATIENT',
                    'GOLD_PATIENT',
                    'SILVER_PATIENT',
                    'VALUABLE_RECENT_PATIENT',
                    'ACTIVE_MEMBER',
                    'MEMBERSHIP_BENEFITS_DUE'
                )
                """
            )
        )
    ]
    for tenant_id in tenants:
        _upsert_rule(
            conn,
            tenant_id=tenant_id,
            rule_key="premium_monthly_member",
            replace_keys=("premium_patient_value",),
            values=_rule_values(
                name="Premium Patient - Member Monthly Value",
                flag_key="PREMIUM_PATIENT",
                threshold=2500,
                priority=10,
                badge_label="Premium",
                badge_background_color="#ECFDF5",
                badge_text_color="#047857",
                badge_border_color="#A7F3D0",
                requires_active_membership=True,
                score_weight=100,
            ),
        )
        _upsert_rule(
            conn,
            tenant_id=tenant_id,
            rule_key="premium_monthly_collection",
            replace_keys=(),
            values=_rule_values(
                name="Premium Patient - Monthly Value",
                flag_key="PREMIUM_PATIENT",
                threshold=4000,
                priority=11,
                badge_label="Premium",
                badge_background_color="#ECFDF5",
                badge_text_color="#047857",
                badge_border_color="#A7F3D0",
                score_weight=100,
            ),
        )
        _upsert_rule(
            conn,
            tenant_id=tenant_id,
            rule_key="gold_monthly_collection",
            replace_keys=("gold_patient_value",),
            values=_rule_values(
                name="Gold Patient - Monthly Value",
                flag_key="GOLD_PATIENT",
                threshold=2500,
                priority=20,
                badge_label="Gold",
                badge_background_color="#FEF3C7",
                badge_text_color="#92400E",
                badge_border_color="#FCD34D",
                score_weight=70,
            ),
        )
        _upsert_rule(
            conn,
            tenant_id=tenant_id,
            rule_key="silver_monthly_collection",
            replace_keys=("silver_patient_value",),
            values=_rule_values(
                name="Silver Patient - Monthly Value",
                flag_key="SILVER_PATIENT",
                threshold=1000,
                priority=30,
                badge_label="Silver",
                badge_background_color="#F8FAFC",
                badge_text_color="#475569",
                badge_border_color="#CBD5E1",
                score_weight=40,
            ),
        )
        for key in (
            "valuable_recent_patient",
            "active_membership_patient",
            "membership_benefits_due",
        ):
            row = _rule(conn, tenant_id, key)
            if row:
                _update_rule(
                    conn,
                    row.id,
                    {
                        "display_as_patient_badge": False,
                        "exclusive_group": None,
                    },
                )


def downgrade() -> None:
    # Data-only migration: keep tenant-edited dynamic rule configuration.
    return
