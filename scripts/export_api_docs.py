import json
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT / "backend"
sys.path.insert(0, str(BACKEND))

from app.main import app  # noqa: E402


def schema_sample(openapi: dict, schema: dict | None):
    if not schema:
        return {}
    if "$ref" in schema:
        name = schema["$ref"].split("/")[-1]
        schema = openapi.get("components", {}).get("schemas", {}).get(name, {})
    if "example" in schema:
        return schema["example"]
    if "default" in schema:
        return schema["default"]
    if "anyOf" in schema:
        return schema_sample(openapi, schema["anyOf"][0])
    if "oneOf" in schema:
        return schema_sample(openapi, schema["oneOf"][0])

    schema_type = schema.get("type")
    if schema_type == "object" or "properties" in schema:
        required = set(schema.get("required", []))
        sample = {}
        for key, prop in schema.get("properties", {}).items():
            if required and key not in required:
                continue
            sample[key] = schema_sample(openapi, prop)
        return sample
    if schema_type == "array":
        return [schema_sample(openapi, schema.get("items", {}))]
    if schema_type == "integer":
        return 0
    if schema_type == "number":
        return 0
    if schema_type == "boolean":
        return False
    if schema.get("format") == "date-time":
        return "2026-07-10T00:00:00Z"
    if schema.get("format") == "date":
        return "2026-07-10"
    return ""


def build_postman_collection(openapi: dict) -> dict:
    collection = {
        "info": {
            "name": "MedizinHub HMS API",
            "description": (
                "Generated from FastAPI OpenAPI. Set baseUrl, authToken, "
                "tenantId, and branchId before running requests."
            ),
            "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
        },
        "event": [
            {
                "listen": "test",
                "script": {
                    "type": "text/javascript",
                    "exec": [
                        "pm.test('response is not a server error', function () {",
                        "  pm.expect(pm.response.code).to.be.below(500);",
                        "});",
                        "pm.test('response time is acceptable', function () {",
                        "  pm.expect(pm.response.responseTime).to.be.below(5000);",
                        "});",
                    ],
                },
            }
        ],
        "variable": [
            {"key": "baseUrl", "value": "http://localhost:8080"},
            {"key": "authToken", "value": ""},
            {"key": "tenantId", "value": ""},
            {"key": "branchId", "value": ""},
        ],
        "item": [],
    }
    folders: dict[str, dict] = {}

    def get_folder(tag: str) -> dict:
        tag = tag or "default"
        if tag not in folders:
            folders[tag] = {"name": tag, "item": []}
            collection["item"].append(folders[tag])
        return folders[tag]

    for path, path_item in sorted(openapi.get("paths", {}).items()):
        for method, operation in sorted(path_item.items()):
            if method.lower() not in {"get", "post", "put", "patch", "delete"}:
                continue

            folder = get_folder((operation.get("tags") or ["default"])[0])
            raw_path = path.lstrip("/")
            url_path = raw_path.split("/") if raw_path else []
            query = []
            headers = [
                {"key": "Accept", "value": "application/json"},
                {"key": "X-Tenant-ID", "value": "{{tenantId}}"},
                {"key": "X-Branch-ID", "value": "{{branchId}}"},
            ]

            for parameter in operation.get("parameters", []):
                location = parameter.get("in")
                name = parameter.get("name")
                if not name:
                    continue
                if location == "path":
                    raw_path = raw_path.replace("{" + name + "}", ":" + name)
                    url_path = raw_path.split("/") if raw_path else []
                elif location == "query":
                    query.append(
                        {
                            "key": name,
                            "value": str(schema_sample(openapi, parameter.get("schema", {}))),
                            "disabled": not parameter.get("required", False),
                            "description": parameter.get("description", ""),
                        }
                    )
                elif location == "header" and name.lower() not in {
                    "x-tenant-id",
                    "x-branch-id",
                }:
                    headers.append(
                        {
                            "key": name,
                            "value": str(schema_sample(openapi, parameter.get("schema", {}))),
                            "disabled": not parameter.get("required", False),
                            "description": parameter.get("description", ""),
                        }
                    )

            request = {
                "method": method.upper(),
                "header": headers,
                "auth": {
                    "type": "bearer",
                    "bearer": [
                        {"key": "token", "value": "{{authToken}}", "type": "string"}
                    ],
                },
                "url": {
                    "raw": "{{baseUrl}}/" + raw_path,
                    "host": ["{{baseUrl}}"],
                    "path": url_path,
                    "query": query,
                },
                "description": operation.get("description")
                or operation.get("summary", ""),
            }

            content = operation.get("requestBody", {}).get("content", {})
            json_body = content.get("application/json")
            multipart_body = content.get("multipart/form-data")
            if json_body:
                request["header"].append(
                    {"key": "Content-Type", "value": "application/json"}
                )
                request["body"] = {
                    "mode": "raw",
                    "raw": json.dumps(
                        schema_sample(openapi, json_body.get("schema", {})),
                        indent=2,
                        ensure_ascii=False,
                    ),
                    "options": {"raw": {"language": "json"}},
                }
            elif multipart_body:
                schema = multipart_body.get("schema", {})
                if "$ref" in schema:
                    ref_name = schema["$ref"].split("/")[-1]
                    schema = (
                        openapi.get("components", {})
                        .get("schemas", {})
                        .get(ref_name, {})
                    )
                formdata = []
                for key, prop in schema.get("properties", {}).items():
                    formdata.append(
                        {
                            "key": key,
                            "value": ""
                            if prop.get("format") == "binary"
                            else str(schema_sample(openapi, prop)),
                            "type": "file"
                            if prop.get("format") == "binary"
                            else "text",
                            "disabled": key not in schema.get("required", []),
                        }
                    )
                request["body"] = {"mode": "formdata", "formdata": formdata}

            folder["item"].append(
                {
                    "name": operation.get("summary")
                    or operation.get("operationId")
                    or f"{method.upper()} {path}",
                    "request": request,
                    "response": [],
                }
            )

    return collection


def main() -> None:
    openapi = app.openapi()
    openapi["servers"] = [
        {"url": "{{baseUrl}}", "description": "Postman selected environment"},
        {"url": "http://localhost:8080", "description": "Local Docker backend"},
        {"url": "http://localhost:8000", "description": "Local uvicorn backend"},
        {
            "url": "http://YOUR_STAGING_EC2_IP:8081",
            "description": "Staging backend",
        },
    ]
    collection = build_postman_collection(openapi)

    (ROOT / "openapi.json").write_text(
        json.dumps(openapi, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    (ROOT / "docs" / "medizinhub-hms.postman_collection.json").write_text(
        json.dumps(collection, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )

    request_count = sum(len(folder["item"]) for folder in collection["item"])
    print(f"openapi paths: {len(openapi.get('paths', {}))}")
    print(f"postman folders: {len(collection['item'])}")
    print(f"postman requests: {request_count}")


if __name__ == "__main__":
    main()
