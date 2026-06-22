"""restore home care entitlement for built-in clinic plans

Revision ID: 20260622_0057
Revises: 20260616_0056
Create Date: 2026-06-22
"""

import json

from alembic import op
import sqlalchemy as sa


revision = "20260622_0057"
down_revision = "20260616_0056"
branch_labels = None
depends_on = None


HOME_CARE_PLAN_KEYS = {
    "growth",
    "pro",
    "hospital",
    "monthly_clinic",
    "half_yearly_clinic",
    "yearly_clinic",
}


def upgrade() -> None:
    connection = op.get_bind()
    plans = sa.table(
        "subscriptionplan",
        sa.column("id", sa.String()),
        sa.column("key", sa.String()),
        sa.column("enabled_modules_json", sa.Text()),
    )
    rows = connection.execute(
        sa.select(plans.c.id, plans.c.enabled_modules_json).where(
            plans.c.key.in_(HOME_CARE_PLAN_KEYS)
        )
    ).all()
    for plan_id, raw_modules in rows:
        try:
            modules = json.loads(raw_modules or "[]")
        except (TypeError, json.JSONDecodeError):
            modules = []
        if not isinstance(modules, list) or "home_care" in modules:
            continue
        modules.append("home_care")
        connection.execute(
            plans.update()
            .where(plans.c.id == plan_id)
            .values(enabled_modules_json=json.dumps(sorted(set(modules))))
        )


def downgrade() -> None:
    # Do not remove a valid entitlement that may have been configured later.
    pass
