from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta
from decimal import Decimal, InvalidOperation
from enum import Enum
from typing import Any, Literal

from fastapi import HTTPException, status
from pydantic import BaseModel, Field, ValidationError
from sqlalchemy import String, and_, cast, func, or_
from sqlmodel import Session, select


FieldType = Literal["text", "select", "number", "date", "boolean"]
SortDirection = Literal["asc", "desc"]


class ListFilter(BaseModel):
    field: str = Field(min_length=1, max_length=120)
    operator: str = Field(min_length=1, max_length=40)
    value: str = ""
    value2: str | None = None


class ListSort(BaseModel):
    key: str = Field(min_length=1, max_length=120)
    dir: SortDirection = "asc"


class ListFilterOption(BaseModel):
    value: str
    label: str


@dataclass(frozen=True)
class ListField:
    expression: Any
    field_type: FieldType
    enum_type: type[Enum] | None = None


@dataclass(frozen=True)
class ListSpec:
    fields: dict[str, ListField]
    sort_fields: dict[str, Any]


def standard_audit_list_fields(
    model: Any,
    *,
    created_by: Any | None = None,
    updated_by: Any | None = None,
) -> dict[str, ListField]:
    fields: dict[str, ListField] = {}
    if hasattr(model, "created_at"):
        fields["created_at"] = ListField(model.created_at, "date")
    created_by_expression = created_by or getattr(model, "created_by_user_id", None)
    if created_by_expression is not None:
        fields["created_by_user_id"] = ListField(created_by_expression, "select")
    if hasattr(model, "updated_at"):
        fields["updated_at"] = ListField(model.updated_at, "date")
    updated_by_expression = updated_by or getattr(model, "updated_by_user_id", None)
    if updated_by_expression is not None:
        fields["updated_by_user_id"] = ListField(updated_by_expression, "select")
    return fields


def standard_audit_sort_fields(
    model: Any,
    *,
    created_by: Any | None = None,
    updated_by: Any | None = None,
) -> dict[str, Any]:
    fields: dict[str, Any] = {}
    if hasattr(model, "created_at"):
        fields["created_at"] = model.created_at
    created_by_expression = created_by or getattr(model, "created_by_user_id", None)
    if created_by_expression is not None:
        fields["created_by_user_id"] = created_by_expression
    if hasattr(model, "updated_at"):
        fields["updated_at"] = model.updated_at
    updated_by_expression = updated_by or getattr(model, "updated_by_user_id", None)
    if updated_by_expression is not None:
        fields["updated_by_user_id"] = updated_by_expression
    return fields


def parse_list_filters(raw_filters: str | None) -> list[ListFilter]:
    if not raw_filters:
        return []
    try:
        payload = json.loads(raw_filters)
        return [ListFilter.model_validate(item) for item in payload]
    except (TypeError, json.JSONDecodeError, ValidationError):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid filters payload",
        ) from None


def parse_list_sort(raw_sort: str | None) -> ListSort | None:
    if not raw_sort:
        return None
    try:
        return ListSort.model_validate(json.loads(raw_sort))
    except (TypeError, json.JSONDecodeError, ValidationError):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid sort payload",
        ) from None


def apply_list_filters(statement: Any, spec: ListSpec, filters: list[ListFilter]):
    for row in filters:
        field = spec.fields.get(row.field)
        if not field:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Unsupported filter field: {row.field}",
            )
        condition = _condition_for_filter(field, row)
        if condition is not None:
            statement = statement.where(condition)
    return statement


def apply_list_sort(
    statement: Any,
    spec: ListSpec,
    sort: ListSort | None,
    *,
    default_order: list[Any],
):
    if not sort:
        return statement.order_by(*default_order)
    expression = spec.sort_fields.get(sort.key)
    if expression is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported sort field: {sort.key}",
        )
    direction = expression.desc() if sort.dir == "desc" else expression.asc()
    return statement.order_by(direction, *default_order)


def list_filter_options(values: list[Any]) -> list[ListFilterOption]:
    options: list[ListFilterOption] = []
    seen: set[str] = set()
    for value in values:
        normalized = _option_value(value)
        if not normalized or normalized in seen:
            continue
        seen.add(normalized)
        options.append(ListFilterOption(value=normalized, label=normalized))
    return options


def labeled_filter_options(rows: list[tuple[Any, Any]]) -> list[ListFilterOption]:
    options: list[ListFilterOption] = []
    seen: set[str] = set()
    for value, label in rows:
        normalized = _option_value(value)
        if not normalized or normalized in seen:
            continue
        seen.add(normalized)
        options.append(
            ListFilterOption(value=normalized, label=_option_value(label) or normalized)
        )
    return options


def tenant_user_filter_options(
    session: Session,
    user_model: Any,
    *,
    tenant_id: str,
    limit: int = 100,
) -> list[ListFilterOption]:
    rows = session.exec(
        select(user_model.id, user_model.name)
        .where(
            user_model.tenant_id == tenant_id,
            user_model.is_active == True,  # noqa: E712
        )
        .distinct()
        .order_by(user_model.name)
        .limit(limit)
    ).all()
    return labeled_filter_options(list(rows))


def _condition_for_filter(field: ListField, row: ListFilter):
    expression = field.expression
    operator = row.operator

    if operator == "is_set":
        return _is_set(expression, field.field_type)
    if operator == "is_not_set":
        return _is_not_set(expression, field.field_type)

    if not row.value.strip():
        return None

    if field.field_type == "text":
        return _text_condition(expression, operator, row.value)
    if field.field_type == "select":
        return _select_condition(field, operator, row.value)
    if field.field_type == "number":
        return _number_condition(expression, operator, row.value, row.value2)
    if field.field_type == "date":
        return _date_condition(expression, operator, row.value, row.value2)
    if field.field_type == "boolean":
        return _boolean_condition(expression, operator, row.value)

    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail=f"Unsupported filter type: {field.field_type}",
    )


def _is_set(expression: Any, field_type: FieldType):
    if field_type in {"text", "select"}:
        as_text = cast(expression, String)
        return and_(expression.is_not(None), func.trim(as_text) != "")
    return expression.is_not(None)


def _is_not_set(expression: Any, field_type: FieldType):
    if field_type in {"text", "select"}:
        as_text = cast(expression, String)
        return or_(expression.is_(None), func.trim(as_text) == "")
    return expression.is_(None)


def _text_condition(expression: Any, operator: str, value: str):
    lowered = func.lower(cast(expression, String))
    term = value.strip().lower()
    if operator == "like":
        return lowered.contains(term, autoescape=True)
    if operator == "not_like":
        return ~lowered.contains(term, autoescape=True)
    if operator == "equals":
        return lowered == term
    if operator == "not_equals":
        return lowered != term
    raise _unsupported_operator(operator, "text")


def _select_condition(field: ListField, operator: str, value: str):
    expression = field.expression
    if operator in {"equals", "not_equals"}:
        coerced = _coerce_select_value(field, value)
        return (
            expression != coerced if operator == "not_equals" else expression == coerced
        )
    if operator in {"in", "not_in"}:
        values = [
            _coerce_select_value(field, item)
            for item in value.split(",")
            if item.strip()
        ]
        if not values:
            return None
        condition = expression.in_(values)
        return ~condition if operator == "not_in" else condition
    raise _unsupported_operator(operator, "select")


def _number_condition(expression: Any, operator: str, value: str, value2: str | None):
    first = _decimal(value, "number filter value")
    if operator == "equals":
        return expression == first
    if operator == "not_equals":
        return expression != first
    if operator == "gt":
        return expression > first
    if operator == "lt":
        return expression < first
    if operator == "gte":
        return expression >= first
    if operator == "lte":
        return expression <= first
    if operator == "between":
        second = _decimal(value2 or value, "second number filter value")
        return and_(expression >= first, expression <= second)
    raise _unsupported_operator(operator, "number")


def _date_condition(expression: Any, operator: str, value: str, value2: str | None):
    if operator == "timespan":
        range_value = _timespan_range(value)
        if not range_value:
            return None
        start, end_exclusive = range_value
        return and_(expression >= start, expression < end_exclusive)
    if operator == "fiscal_year":
        range_value = _fiscal_year_range(value)
        if not range_value:
            raise _bad_request("Invalid fiscal year filter value")
        start, end_exclusive = range_value
        return and_(expression >= start, expression < end_exclusive)

    start = _date_start(value)
    next_day = start + timedelta(days=1)
    if operator == "is":
        return and_(expression >= start, expression < next_day)
    if operator == "before":
        return expression < start
    if operator == "after":
        return expression >= next_day
    if operator == "on_or_before":
        return expression < next_day
    if operator == "on_or_after":
        return expression >= start
    if operator == "between":
        end = _date_start(value2 or value) + timedelta(days=1)
        return and_(expression >= start, expression < end)
    raise _unsupported_operator(operator, "date")


def _boolean_condition(expression: Any, operator: str, value: str):
    if operator not in {"equals", "not_equals"}:
        raise _unsupported_operator(operator, "boolean")
    lowered = value.strip().lower()
    if lowered not in {"true", "false"}:
        raise _bad_request("Invalid boolean filter value")
    coerced = lowered == "true"
    return expression != coerced if operator == "not_equals" else expression == coerced


def _coerce_select_value(field: ListField, value: str):
    raw = value.strip()
    if not field.enum_type:
        return raw
    for member in field.enum_type:
        if raw in {member.value, member.name}:
            return member
    raise _bad_request(f"Invalid value for enum filter: {raw}")


def _option_value(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, Enum):
        return str(value.value)
    return str(value).strip()


def _decimal(value: str, label: str) -> Decimal:
    try:
        return Decimal(value.strip())
    except (InvalidOperation, AttributeError):
        raise _bad_request(f"Invalid {label}") from None


def _date_start(value: str) -> datetime:
    try:
        parsed = date.fromisoformat(value.strip())
    except ValueError:
        raise _bad_request("Invalid date filter value") from None
    return datetime.combine(parsed, time.min)


def _timespan_range(value: str) -> tuple[datetime, datetime] | None:
    today = date.today()
    if value == "yesterday":
        day = today - timedelta(days=1)
        return _day_range(day)
    if value == "today":
        return _day_range(today)
    if value == "tomorrow":
        return _day_range(today + timedelta(days=1))
    if value == "last_6_months":
        return datetime.combine(
            today - timedelta(days=183), time.min
        ), datetime.combine(today + timedelta(days=1), time.min)
    if value == "next_6_months":
        return datetime.combine(today, time.min), datetime.combine(
            today + timedelta(days=184), time.min
        )
    return _calendar_range(value, today)


def _calendar_range(value: str, today: date) -> tuple[datetime, datetime] | None:
    week_start = today - timedelta(days=today.weekday())
    if value in {"this_week", "last_week", "next_week"}:
        offset = {"last_week": -7, "this_week": 0, "next_week": 7}[value]
        start = week_start + timedelta(days=offset)
        return datetime.combine(start, time.min), datetime.combine(
            start + timedelta(days=7), time.min
        )
    if value in {"this_month", "last_month", "next_month"}:
        offset = {"last_month": -1, "this_month": 0, "next_month": 1}[value]
        month = today.month + offset
        year = today.year + (month - 1) // 12
        month = ((month - 1) % 12) + 1
        start = date(year, month, 1)
        end = _add_months(start, 1)
        return datetime.combine(start, time.min), datetime.combine(end, time.min)
    if value in {"this_quarter", "last_quarter", "next_quarter"}:
        offset = {"last_quarter": -3, "this_quarter": 0, "next_quarter": 3}[value]
        quarter_month = ((today.month - 1) // 3) * 3 + 1
        start = _add_months(date(today.year, quarter_month, 1), offset)
        return datetime.combine(start, time.min), datetime.combine(
            _add_months(start, 3), time.min
        )
    if value in {"this_year", "last_year", "next_year"}:
        offset = {"last_year": -1, "this_year": 0, "next_year": 1}[value]
        start = date(today.year + offset, 1, 1)
        return datetime.combine(start, time.min), datetime.combine(
            date(start.year + 1, 1, 1), time.min
        )
    return None


def _fiscal_year_range(value: str) -> tuple[datetime, datetime] | None:
    parts = value.split("-")
    if len(parts) != 2:
        return None
    try:
        start_year = int(parts[0])
        end_year = int(parts[1])
    except ValueError:
        return None
    if end_year != start_year + 1:
        return None
    return datetime(start_year, 4, 1), datetime(end_year, 4, 1)


def _day_range(day: date) -> tuple[datetime, datetime]:
    return datetime.combine(day, time.min), datetime.combine(
        day + timedelta(days=1), time.min
    )


def _add_months(value: date, months: int) -> date:
    month = value.month + months
    year = value.year + (month - 1) // 12
    month = ((month - 1) % 12) + 1
    return date(year, month, 1)


def _unsupported_operator(operator: str, field_type: str) -> HTTPException:
    return _bad_request(f"Unsupported {field_type} filter operator: {operator}")


def _bad_request(detail: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=detail)
