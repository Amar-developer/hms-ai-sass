import json


def modules_to_json(modules: list[str]) -> str:
    return json.dumps(sorted(set(modules)))


def modules_from_json(value: str | None) -> list[str]:
    if not value:
        return []
    try:
        raw = json.loads(value)
    except json.JSONDecodeError:
        return []
    if not isinstance(raw, list):
        return []
    return sorted({str(item) for item in raw})
