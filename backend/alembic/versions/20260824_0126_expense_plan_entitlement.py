"""Make Expense a subscription-plan controlled entitlement."""

from __future__ import annotations

import json

import sqlalchemy as sa
from alembic import op


revision = "20260824_0126"
down_revision = "20260824_0125"
branch_labels = None
depends_on = None


PLAN_TABLE = "subscriptionplan"
EXPENSE_PLANS = {
    "growth",
    "pro",
    "hospital",
    "monthly_clinic",
    "half_yearly_clinic",
    "yearly_clinic",
}
NON_EXPENSE_PLANS = {"free_trial", "starter"}


def _table_exists(table_name: str) -> bool:
    return sa.inspect(op.get_bind()).has_table(table_name)


def _modules(value: str | None) -> list[str]:
    try:
        parsed = json.loads(value or "[]")
    except (TypeError, ValueError):
        return []
    if not isinstance(parsed, list):
        return []
    return [str(item) for item in parsed if str(item).strip()]


def _set_modules(conn, plan_id: str, modules: list[str]) -> None:
    conn.execute(
        sa.text(
            f"""
            UPDATE {PLAN_TABLE}
            SET enabled_modules_json = :enabled_modules_json
            WHERE id = :id
            """
        ),
        {"id": plan_id, "enabled_modules_json": json.dumps(sorted(set(modules)))},
    )


def upgrade() -> None:
    if not _table_exists(PLAN_TABLE):
        return
    conn = op.get_bind()
    rows = conn.execute(
        sa.text(
            f"""
            SELECT id, key, enabled_modules_json
            FROM {PLAN_TABLE}
            WHERE key IN :keys
            """
        ).bindparams(
            sa.bindparam("keys", expanding=True),
        ),
        {"keys": tuple(EXPENSE_PLANS | NON_EXPENSE_PLANS)},
    )
    for row in rows:
        modules = _modules(row.enabled_modules_json)
        if row.key in EXPENSE_PLANS and "expense" not in modules:
            _set_modules(conn, row.id, [*modules, "expense"])
        if row.key in NON_EXPENSE_PLANS and "expense" in modules:
            _set_modules(
                conn, row.id, [module for module in modules if module != "expense"]
            )


def downgrade() -> None:
    if not _table_exists(PLAN_TABLE):
        return
    conn = op.get_bind()
    rows = conn.execute(
        sa.text(
            f"""
            SELECT id, enabled_modules_json
            FROM {PLAN_TABLE}
            WHERE key IN :keys
            """
        ).bindparams(
            sa.bindparam("keys", expanding=True),
        ),
        {"keys": tuple(EXPENSE_PLANS | NON_EXPENSE_PLANS)},
    )
    for row in rows:
        modules = _modules(row.enabled_modules_json)
        if "expense" not in modules:
            _set_modules(conn, row.id, [*modules, "expense"])
