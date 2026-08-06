"""Which weekdays a practitioner schedule covers.

Mirrors app.modules.home_care.visit_days: weekday numbers (0=Mon..6=Sun) are
stored as JSON in a plain string column rather than a database array, since
result sets per practitioner are small enough that filtering happens in
Python after a narrow indexed fetch (by tenant/practitioner/branch/active).
"""

import json
from enum import Enum

DAILY_WEEKDAYS = list(range(7))
MON_SATURDAY_WEEKDAYS = list(range(6))


class ScheduleMode(str, Enum):
    DAILY = "daily"
    MON_SATURDAY = "mon_saturday"
    CUSTOM = "custom"


def parse_weekdays(raw: str | None) -> list[int]:
    """Weekday numbers (0=Mon .. 6=Sun) from stored JSON, ignoring junk."""
    if not raw:
        return []
    try:
        values = json.loads(raw)
    except (TypeError, ValueError):
        return []
    if not isinstance(values, list):
        return []
    return sorted(
        {int(value) for value in values if isinstance(value, int) and 0 <= value <= 6}
    )


def dump_weekdays(weekdays: list[int]) -> str:
    cleaned = sorted({int(value) for value in weekdays if 0 <= int(value) <= 6})
    return json.dumps(cleaned)


def resolve_weekdays(
    mode: ScheduleMode, custom_weekdays: list[int] | None
) -> list[int]:
    """The server, not the client, decides what `daily`/`mon_saturday` mean —
    only `custom` trusts the caller's explicit weekday list."""
    if mode == ScheduleMode.DAILY:
        return DAILY_WEEKDAYS
    if mode == ScheduleMode.MON_SATURDAY:
        return MON_SATURDAY_WEEKDAYS
    return sorted(
        {int(value) for value in (custom_weekdays or []) if 0 <= int(value) <= 6}
    )


def mode_value(mode: "ScheduleMode | str") -> str:
    """Plain lowercase string to store in the `mode` column, regardless of
    whether the caller passed a ScheduleMode member or an already-plain
    string — the DB column is a plain str, not a native enum type."""
    return ScheduleMode(mode).value


def infer_mode(weekdays: list[int]) -> ScheduleMode:
    """Reconstruct which preset a stored weekday set corresponds to, so the
    UI can round-trip the picker (Daily/Mon-Saturday/Custom) on edit."""
    unique = sorted(set(weekdays))
    if unique == DAILY_WEEKDAYS:
        return ScheduleMode.DAILY
    if unique == MON_SATURDAY_WEEKDAYS:
        return ScheduleMode.MON_SATURDAY
    return ScheduleMode.CUSTOM
