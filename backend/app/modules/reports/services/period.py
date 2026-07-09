from calendar import monthrange
from datetime import date


def previous_month_range(today: date | None = None) -> tuple[date, date]:
    today = today or date.today()
    year = today.year
    month = today.month - 1
    if month == 0:
        year -= 1
        month = 12
    return date(year, month, 1), date(year, month, monthrange(year, month)[1])


def report_period_key(start: date, end: date) -> str:
    return f"{start.isoformat()}:{end.isoformat()}"
