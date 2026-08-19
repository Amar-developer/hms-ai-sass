"""Print a schema summary from the current SQLModel metadata.

Use case:
    Run this when you need to confirm which tables/columns the current branch's
    Python models define, especially before validating seed/demo data.

Important:
    This is a branch schema summary, not a live database dump. It reads model
    metadata after importing ``app.models``.

The output is intentionally generated from app models instead of handwritten SQL,
so it stays aligned with the branch's Python table definitions.
"""

from __future__ import annotations

import argparse
import json
import warnings
from typing import Any

from sqlalchemy.exc import SAWarning
from sqlmodel import SQLModel

import app.models  # noqa: F401

CURRENT_MAIN_ALEMBIC_HEAD = "20260806_0106"


def build_schema_summary() -> dict[str, Any]:
    tables: list[dict[str, Any]] = []
    with warnings.catch_warnings():
        warnings.filterwarnings(
            "ignore",
            message="Cannot correctly sort tables.*",
            category=SAWarning,
        )
        sorted_tables = list(SQLModel.metadata.sorted_tables)
    for table in sorted_tables:
        tables.append(
            {
                "name": table.name,
                "columns": [
                    {
                        "name": column.name,
                        "type": str(column.type),
                        "nullable": column.nullable,
                        "primary_key": column.primary_key,
                    }
                    for column in table.columns
                ],
                "indexes": sorted(index.name for index in table.indexes),
                "foreign_keys": sorted(
                    str(foreign_key.column) for foreign_key in table.foreign_keys
                ),
            }
        )
    return {
        "alembic_head": CURRENT_MAIN_ALEMBIC_HEAD,
        "table_count": len(tables),
        "tables": tables,
    }


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Print current branch database schema summary."
    )
    parser.add_argument(
        "--pretty",
        action="store_true",
        help="Pretty-print JSON output.",
    )
    parser.add_argument(
        "--table-names",
        action="store_true",
        help="Print only table names with the Alembic head.",
    )
    args = parser.parse_args()
    summary = build_schema_summary()
    if args.table_names:
        summary = {
            "alembic_head": summary["alembic_head"],
            "table_count": summary["table_count"],
            "tables": [table["name"] for table in summary["tables"]],
        }
    indent = 2 if args.pretty else None
    try:
        print(json.dumps(summary, indent=indent, sort_keys=True))
    except BrokenPipeError:
        raise SystemExit(0) from None


if __name__ == "__main__":
    main()
