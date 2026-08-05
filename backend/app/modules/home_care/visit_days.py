"""Which calendar dates a home care booking actually covers.

A booking spans start_date..end_date, but the visits inside it need not be
daily: a fortnight booking might only run on Tue/Thu/Sat, or on alternate
days. This module is the single source of truth for expanding a booking's
span into its planned visit dates, so the billing estimate, the booking
read model, and the UI can never disagree about how many visits there are.
"""

import json
from datetime import date, timedelta

ALL = "all"
ALTERNATE = "alternate"
WEEKDAYS = "weekdays"

VISIT_DAY_MODES = (ALL, ALTERNATE, WEEKDAYS)


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


def dump_weekdays(weekdays: list[int] | None) -> str | None:
    cleaned = sorted({int(value) for value in (weekdays or []) if 0 <= int(value) <= 6})
    return json.dumps(cleaned) if cleaned else None


def planned_visit_dates(
    *,
    start_date: date,
    end_date: date | None,
    visit_day_mode: str | None = ALL,
    visit_weekdays: list[int] | None = None,
) -> list[date]:
    """Every date the booking is planned to be visited, inclusive."""
    if not start_date:
        return []
    last = end_date or start_date
    if last < start_date:
        return []

    mode = (visit_day_mode or ALL).strip().lower()
    if mode == ALTERNATE:
        step = 2
    else:
        step = 1

    selected = set(visit_weekdays or [])
    dates: list[date] = []
    current = start_date
    while current <= last:
        # In weekdays mode an empty selection would silently plan nothing, so
        # treat it as "no filter" and fall back to every day in the range.
        if mode != WEEKDAYS or not selected or current.weekday() in selected:
            dates.append(current)
        current += timedelta(days=step)
    return dates


def planned_visit_count(
    *,
    start_date: date,
    end_date: date | None,
    visit_day_mode: str | None = ALL,
    visit_weekdays: list[int] | None = None,
) -> int:
    return len(
        planned_visit_dates(
            start_date=start_date,
            end_date=end_date,
            visit_day_mode=visit_day_mode,
            visit_weekdays=visit_weekdays,
        )
    )
