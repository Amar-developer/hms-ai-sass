import math
import re


def _first_number(value: str) -> float | None:
    fraction = re.search(r"(\d+)\s*/\s*(\d+)", value)
    if fraction and int(fraction.group(2)) != 0:
        return int(fraction.group(1)) / int(fraction.group(2))
    match = re.search(r"\d+(?:\.\d+)?", value)
    return float(match.group()) if match else None


def dose_units(dosage: str | None) -> float:
    if not dosage:
        return 1
    normalized = dosage.strip().lower()
    countable_units = (
        "tab",
        "tablet",
        "cap",
        "capsule",
        "sachet",
        "vial",
        "amp",
        "ampoule",
        "drop",
        "puff",
        "spoon",
        "suppository",
    )
    if not any(unit in normalized for unit in countable_units):
        return 1
    number = _first_number(normalized)
    return max(number or 1, 0.5)


def frequency_doses_per_day(frequency: str | None) -> float:
    if not frequency:
        return 1
    normalized = frequency.strip().lower()
    if not normalized:
        return 1

    compact = re.sub(r"[\s._]+", "", normalized)
    if re.fullmatch(r"\d+(?:-\d+)+", compact):
        return max(sum(int(part) for part in compact.split("-")), 1)

    known = {
        "od": 1,
        "qd": 1,
        "qday": 1,
        "once": 1,
        "onceaday": 1,
        "oncedaily": 1,
        "daily": 1,
        "bd": 2,
        "bid": 2,
        "twice": 2,
        "twiceaday": 2,
        "twicedaily": 2,
        "tds": 3,
        "tid": 3,
        "thrice": 3,
        "thriceaday": 3,
        "thricedaily": 3,
        "qid": 4,
        "qds": 4,
        "fourtimesaday": 4,
        "sos": 1,
        "prn": 1,
        "stat": 1,
    }
    if compact in known:
        return known[compact]
    if "alternate" in normalized and "day" in normalized:
        return 0.5

    every_hours = re.search(r"(?:q|every)\s*(\d+)\s*(?:h|hr|hour)", normalized)
    if every_hours:
        hours = int(every_hours.group(1))
        if hours > 0:
            return max(24 / hours, 1)

    times = re.search(r"(\d+)\s*(?:times|time|x)\s*(?:a|per)?\s*day", normalized)
    if times:
        return max(int(times.group(1)), 1)

    numbers = [int(part) for part in re.findall(r"\d+", normalized)]
    return max(sum(numbers), 1) if numbers else 1


def duration_days(duration: str | None) -> int:
    if not duration:
        return 1
    normalized = duration.strip().lower()
    number = _first_number(normalized)
    if number is None:
        return 1
    if "week" in normalized or re.search(r"\bwk\b", normalized):
        return max(math.ceil(number * 7), 1)
    if "month" in normalized or re.search(r"\bmo\b", normalized):
        return max(math.ceil(number * 30), 1)
    if "year" in normalized or re.search(r"\byr\b", normalized):
        return max(math.ceil(number * 365), 1)
    return max(math.ceil(number), 1)


def prescription_quantity(
    dosage: str | None, frequency: str | None, duration: str | None
) -> int:
    return max(
        math.ceil(
            dose_units(dosage)
            * frequency_doses_per_day(frequency)
            * duration_days(duration)
        ),
        1,
    )


def daily_administration_quantity(dosage: str | None, frequency: str | None) -> int:
    return max(math.ceil(dose_units(dosage) * frequency_doses_per_day(frequency)), 1)
