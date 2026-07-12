import json
import sys
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT / "backend"
sys.path.insert(0, str(BACKEND))

from app.main import app  # noqa: E402


HTTP_METHODS = {"get", "post", "put", "patch", "delete"}
IGNORED_HEADER_PARAMS = {"authorization", "x-tenant-id", "x-branch-id"}
STRING_LIMIT_KEYS = {"minLength", "maxLength", "pattern", "format", "enum"}
NUMBER_LIMIT_KEYS = {
    "minimum",
    "maximum",
    "exclusiveMinimum",
    "exclusiveMaximum",
    "multipleOf",
    "enum",
}
ARRAY_LIMIT_KEYS = {"minItems", "maxItems"}


def resolve_schema(openapi: dict[str, Any], schema: dict[str, Any]) -> dict[str, Any]:
    if "$ref" in schema:
        name = schema["$ref"].split("/")[-1]
        return openapi.get("components", {}).get("schemas", {}).get(name, {})
    return schema


def merged_schema(openapi: dict[str, Any], schema: dict[str, Any]) -> dict[str, Any]:
    schema = resolve_schema(openapi, schema)
    if "allOf" not in schema:
        return schema

    merged: dict[str, Any] = {"type": "object", "properties": {}, "required": []}
    for part in schema["allOf"]:
        resolved = merged_schema(openapi, part)
        merged["properties"].update(resolved.get("properties", {}))
        merged["required"].extend(resolved.get("required", []))
    merged["required"] = sorted(set(merged["required"]))
    return merged


def schema_kind(schema: dict[str, Any]) -> str:
    if "enum" in schema:
        return "enum"
    if "anyOf" in schema:
        return schema_kind(schema["anyOf"][0])
    if "oneOf" in schema:
        return schema_kind(schema["oneOf"][0])
    return schema.get("type", "unknown")


def has_limits(schema: dict[str, Any]) -> bool:
    kind = schema_kind(schema)
    if kind == "string":
        return bool(STRING_LIMIT_KEYS & schema.keys())
    if kind in {"integer", "number"}:
        return bool(NUMBER_LIMIT_KEYS & schema.keys())
    if kind == "array":
        return bool(ARRAY_LIMIT_KEYS & schema.keys())
    if kind in {"boolean", "enum"}:
        return True
    if kind == "object":
        return True
    return bool(schema.keys())


def request_body_schema(operation: dict[str, Any]) -> tuple[str | None, dict[str, Any]]:
    content = operation.get("requestBody", {}).get("content", {})
    for media_type in ("application/json", "multipart/form-data"):
        if media_type in content:
            return media_type, content[media_type].get("schema", {})
    return None, {}


def audit_operation(
    openapi: dict[str, Any],
    method: str,
    path: str,
    operation: dict[str, Any],
) -> dict[str, Any]:
    params = operation.get("parameters", [])
    path_params = [param for param in params if param.get("in") == "path"]
    query_params = [param for param in params if param.get("in") == "query"]
    header_params = [param for param in params if param.get("in") == "header"]
    issues: list[str] = []

    for param in path_params:
        if not param.get("required"):
            issues.append(f"path param `{param.get('name')}` is not marked required")

    for param in query_params:
        if not param.get("required"):
            continue
        schema = param.get("schema", {})
        if not has_limits(schema):
            issues.append(
                f"{param.get('in')} param `{param.get('name')}` has weak constraints"
            )
    for param in header_params:
        name = str(param.get("name", ""))
        if name.lower() in IGNORED_HEADER_PARAMS or not param.get("required"):
            continue
        schema = param.get("schema", {})
        if not has_limits(schema):
            issues.append(f"header param `{name}` has weak constraints")

    media_type, body_schema = request_body_schema(operation)
    body_schema = merged_schema(openapi, body_schema) if body_schema else {}
    body_required = body_schema.get("required", [])
    body_properties = body_schema.get("properties", {})
    weak_fields: list[str] = []
    required_set = set(body_required)
    for name, field_schema in body_properties.items():
        if name not in required_set:
            continue
        resolved = resolve_schema(openapi, field_schema)
        if not has_limits(resolved):
            weak_fields.append(name)

    if media_type and operation.get("requestBody", {}).get("required") is not True:
        issues.append("request body is not marked required")
    if method.upper() in {"POST", "PUT"} and media_type and body_properties and not body_required:
        issues.append("request body has no required fields")

    return {
        "method": method.upper(),
        "path": path,
        "summary": operation.get("summary") or operation.get("operationId", ""),
        "tags": operation.get("tags", []),
        "path_params": [param.get("name") for param in path_params],
        "query_params": [param.get("name") for param in query_params],
        "header_params": [param.get("name") for param in header_params],
        "body_media_type": media_type,
        "body_required_fields": body_required,
        "body_field_count": len(body_properties),
        "weak_body_fields": weak_fields,
        "issues": issues,
    }


def build_report(openapi: dict[str, Any], rows: list[dict[str, Any]]) -> str:
    total = len(rows)
    with_body = sum(1 for row in rows if row["body_media_type"])
    with_issues = [row for row in rows if row["issues"] or row["weak_body_fields"]]
    body_without_required = [
        row
        for row in rows
        if row["body_media_type"] and not row["body_required_fields"]
    ]
    post_put_body_without_required = [
        row for row in body_without_required if row["method"] in {"POST", "PUT"}
    ]

    lines = [
        "# API Validation Audit",
        "",
        "Generated from the live FastAPI OpenAPI schema.",
        "",
        "## Summary",
        "",
        f"- Total operations: {total}",
        f"- Operations with request bodies: {with_body}",
        f"- Operations with audit findings: {len(with_issues)}",
        "- Body operations without required fields "
        f"(includes PATCH/update endpoints): {len(body_without_required)}",
        "- POST/PUT body operations without required fields: "
        f"{len(post_put_body_without_required)}",
        "",
        "## Findings",
        "",
    ]

    if not with_issues:
        lines.append("No validation findings found.")
    else:
        lines.extend(
            [
                "| Method | Path | Finding |",
                "| --- | --- | --- |",
            ]
        )
        for row in with_issues:
            findings = row["issues"][:]
            if row["weak_body_fields"]:
                fields = ", ".join(f"`{field}`" for field in row["weak_body_fields"])
                findings.append(f"weak body field constraints: {fields}")
            lines.append(
                f"| {row['method']} | `{row['path']}` | {'; '.join(findings)} |"
            )

    lines.extend(
        [
            "",
            "## Endpoint Inventory",
            "",
            "| Method | Path | Body | Required Body Fields | Query Params |",
            "| --- | --- | --- | --- | --- |",
        ]
    )
    for row in rows:
        required = ", ".join(f"`{field}`" for field in row["body_required_fields"])
        query = ", ".join(f"`{field}`" for field in row["query_params"])
        lines.append(
            f"| {row['method']} | `{row['path']}` | "
            f"{row['body_media_type'] or '-'} | {required or '-'} | {query or '-'} |"
        )

    return "\n".join(lines) + "\n"


def main() -> None:
    openapi = app.openapi()
    rows = []
    for path, path_item in sorted(openapi.get("paths", {}).items()):
        for method, operation in sorted(path_item.items()):
            if method in HTTP_METHODS:
                rows.append(audit_operation(openapi, method, path, operation))

    report_path = ROOT / "docs" / "api-validation-audit.md"
    report_path.write_text(build_report(openapi, rows), encoding="utf-8")

    json_path = ROOT / "docs" / "api-validation-audit.json"
    json_path.write_text(json.dumps(rows, indent=2) + "\n", encoding="utf-8")

    with_findings = [row for row in rows if row["issues"] or row["weak_body_fields"]]
    print(f"operations: {len(rows)}")
    print(f"operations_with_findings: {len(with_findings)}")
    print(f"report: {report_path.relative_to(ROOT)}")
    print(f"json: {json_path.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
