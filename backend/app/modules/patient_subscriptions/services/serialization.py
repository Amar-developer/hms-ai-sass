import json


def ids_to_json(values: list[str] | None) -> str:
    return json.dumps(sorted({str(value) for value in values or [] if value}))


def ids_from_json(value: str | None) -> list[str]:
    if not value:
        return []
    try:
        raw = json.loads(value)
    except json.JSONDecodeError:
        return []
    if isinstance(raw, dict):
        return [str(key) for key in raw.keys()]
    if not isinstance(raw, list):
        return []
    return [str(item) for item in raw]


def free_items_to_json(
    ids: list[str] | None, quantities: dict[str, int] | None = None
) -> str:
    """Store free items as a {item_id: free_quantity} map (quantity >= 1)."""
    quantities = quantities or {}
    result: dict[str, int] = {}
    for raw_id in ids or []:
        item_id = str(raw_id)
        if not item_id:
            continue
        qty = int(quantities.get(item_id, 1) or 1)
        result[item_id] = max(qty, 1)
    return json.dumps(dict(sorted(result.items())))


def free_items_from_json(value: str | None) -> dict[str, int]:
    """Read free items as {item_id: free_quantity}. Legacy lists map to quantity 1."""
    if not value:
        return {}
    try:
        raw = json.loads(value)
    except json.JSONDecodeError:
        return {}
    result: dict[str, int] = {}
    if isinstance(raw, list):
        for item in raw:
            item_id = str(item)
            if item_id:
                result[item_id] = 1
    elif isinstance(raw, dict):
        for key, qty in raw.items():
            item_id = str(key)
            if not item_id:
                continue
            try:
                result[item_id] = max(int(qty), 1)
            except (TypeError, ValueError):
                result[item_id] = 1
    return result


def usage_from_json(value: str | None) -> dict[str, int]:
    """Read a per-enrollment usage counter map {item_id: used_count}."""
    if not value:
        return {}
    try:
        raw = json.loads(value)
    except json.JSONDecodeError:
        return {}
    if not isinstance(raw, dict):
        return {}
    result: dict[str, int] = {}
    for key, count in raw.items():
        item_id = str(key)
        if not item_id:
            continue
        try:
            result[item_id] = max(int(count), 0)
        except (TypeError, ValueError):
            result[item_id] = 0
    return result


def usage_to_json(usage: dict[str, int]) -> str:
    return json.dumps(dict(sorted((str(k), max(int(v), 0)) for k, v in usage.items())))


def slabs_to_json(values: list[dict[str, int | None]] | None) -> str:
    normalized: list[dict[str, int | None]] = []
    for row in values or []:
        min_amount = int(row.get("min_amount") or 0)
        max_amount = row.get("max_amount")
        discount_percentage = int(row.get("discount_percentage") or 0)
        if discount_percentage <= 0:
            continue
        normalized.append(
            {
                "min_amount": max(min_amount, 0),
                "max_amount": max(int(max_amount), 0)
                if max_amount is not None
                else None,
                "discount_percentage": min(discount_percentage, 100),
            }
        )
    normalized.sort(key=lambda item: (item["min_amount"], item["max_amount"] or 10**12))
    return json.dumps(normalized)


def slabs_from_json(value: str | None) -> list[dict[str, int | None]]:
    if not value:
        return []
    try:
        raw = json.loads(value)
    except json.JSONDecodeError:
        return []
    if not isinstance(raw, list):
        return []
    rows: list[dict[str, int | None]] = []
    for item in raw:
        if not isinstance(item, dict):
            continue
        discount_percentage = int(item.get("discount_percentage") or 0)
        if discount_percentage <= 0:
            continue
        max_amount = item.get("max_amount")
        rows.append(
            {
                "min_amount": max(int(item.get("min_amount") or 0), 0),
                "max_amount": max(int(max_amount), 0)
                if max_amount is not None
                else None,
                "discount_percentage": min(discount_percentage, 100),
            }
        )
    return rows
