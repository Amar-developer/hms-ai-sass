from decimal import Decimal, ROUND_HALF_UP
from typing import Any


MONEY_QUANTUM = Decimal("0.01")
PERCENT_QUANTUM = Decimal("0.0001")
ZERO = Decimal("0")


def decimal_value(value: Any) -> Decimal:
    """Convert persisted/input values without introducing binary-float noise."""
    if value is None or value == "":
        return ZERO
    if isinstance(value, Decimal):
        return value
    return Decimal(str(value))


def money_value(value: Any) -> Decimal:
    """Normalize a monetary value to paise using commercial rounding."""
    return decimal_value(value).quantize(MONEY_QUANTUM, rounding=ROUND_HALF_UP)


def percentage_value(value: Any) -> Decimal:
    return decimal_value(value).quantize(PERCENT_QUANTUM, rounding=ROUND_HALF_UP)


def percentage_amount(base: Any, percentage: Any) -> Decimal:
    return money_value(decimal_value(base) * decimal_value(percentage) / Decimal("100"))


def decimal_json_number(value: Decimal) -> int | float:
    """Serialize exact database decimals as JSON numbers for API compatibility."""
    if value == value.to_integral_value():
        return int(value)
    return float(value)


def decimal_values_to_json(value: Any) -> Any:
    """Recursively convert decimals found in typed fields and report dictionaries."""
    if isinstance(value, Decimal):
        return decimal_json_number(value)
    if isinstance(value, dict):
        return {key: decimal_values_to_json(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [decimal_values_to_json(item) for item in value]
    return value
