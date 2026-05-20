from __future__ import annotations

import json
import os

from sqlalchemy import text
from sqlmodel import SQLModel

import app.models  # noqa: F401
from app.core.database import engine, init_db
from scripts.seed_demo_new import seed

CONFIRM_VALUE = "RESET_MEDIZINHUB_DEV"


def reset_all_data() -> None:
    with engine.begin() as connection:
        if engine.url.drivername.startswith("sqlite"):
            connection.execute(text("PRAGMA foreign_keys=OFF"))
        for table in reversed(SQLModel.metadata.sorted_tables):
            connection.execute(table.delete())
        if engine.url.drivername.startswith("sqlite"):
            connection.execute(text("PRAGMA foreign_keys=ON"))


def main() -> None:
    if os.getenv("MEDIZINHUB_RESET_CONFIRM") != CONFIRM_VALUE:
        raise SystemExit(
            "Refusing to reset data without confirmation.\n\n"
            "This command deletes all rows from the configured database and reseeds demo data.\n"
            f"Run with MEDIZINHUB_RESET_CONFIRM={CONFIRM_VALUE} only for a local/dev database."
        )
    init_db()
    reset_all_data()
    from sqlmodel import Session

    with Session(engine) as session:
        summary = seed(session)
    print(json.dumps({"reset": True, "seed": summary}, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
