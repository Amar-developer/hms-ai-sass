from __future__ import annotations

import json
import os

from sqlalchemy import text
from sqlmodel import SQLModel

import app.models  # noqa: F401
from app.core.database import engine, init_db
from app.modules.subscriptions.service import ensure_default_plans
from scripts.reset_super_admin import (
    ensure_primary_tenant,
    ensure_super_admin,
    ensure_super_admin_role,
    ensure_tenant_admin_template_role,
)

CONFIRM_VALUE = "RESET_MEDIZINHUB_DEV"

def reset_all_data() -> None:
    with engine.begin() as connection:
        if engine.url.drivername.startswith("sqlite"):
            connection.execute(text("PRAGMA foreign_keys=OFF"))
            for table in reversed(SQLModel.metadata.sorted_tables):
                connection.execute(table.delete())
            connection.execute(text("PRAGMA foreign_keys=ON"))
        else:
            table_names = ", ".join(
                f'"{t.name}"' for t in SQLModel.metadata.sorted_tables
            )
            connection.execute(text(f"TRUNCATE {table_names} RESTART IDENTITY CASCADE"))


def main() -> None:
    if os.getenv("MEDIZINHUB_RESET_CONFIRM") != CONFIRM_VALUE:
        raise SystemExit(
            "Refusing to reset data without confirmation.\n\n"
            "This command deletes all rows from the configured database and creates a fresh SaaS setup only.\n"
            f"Run with MEDIZINHUB_RESET_CONFIRM={CONFIRM_VALUE} only for a local/dev database."
        )
    init_db()
    reset_all_data()
    from sqlmodel import Session

    with Session(engine) as session:
        ensure_default_plans(session)
        tenant = ensure_primary_tenant(session)
        user = ensure_super_admin(session, tenant)
        ensure_super_admin_role(session, tenant, user)
        ensure_tenant_admin_template_role(session, tenant, user)
        summary = {
            "primary_tenant_id": tenant.id,
            "primary_tenant_name": tenant.name,
            "super_admin_email": user.email,
            "demo_data_seeded": False,
        }
    print(
        json.dumps(
            {
                "reset": True,
                "fresh_setup": summary,
            },
            indent=2,
            sort_keys=True,
        )
    )


if __name__ == "__main__":
    main()
