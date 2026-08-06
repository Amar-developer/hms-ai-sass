import re
import uuid

from app.infrastructure.integrations.object_storage_keys import validate_storage_key


_SAFE_SEGMENT = re.compile(r"[^A-Za-z0-9._-]+")
_SAFE_EXTENSION = re.compile(r"^\.[a-z0-9]{1,10}$")


def _segment(value: str, fallback: str) -> str:
    cleaned = _SAFE_SEGMENT.sub("-", str(value or "").strip()).strip(".-_")
    return (cleaned or fallback)[:160]


def build_storage_key(
    *,
    environment: str,
    tenant_id: str,
    module: str | None,
    document_type: str | None,
    entity_id: str | None,
    extension: str,
    prefix: str = "",
) -> str:
    normalized_extension = extension.lower()
    if not _SAFE_EXTENSION.fullmatch(normalized_extension):
        raise ValueError("Invalid storage extension")
    parts = [
        _segment(environment, "local"),
        "tenants",
        _segment(tenant_id, "unknown-tenant"),
        _segment(module or "files", "files"),
        _segment(document_type or "general", "general"),
        _segment(entity_id or "unattached", "unattached"),
        f"{uuid.uuid4().hex}{normalized_extension}",
    ]
    if prefix.strip("/"):
        parts.insert(0, _segment(prefix.strip("/"), "documents"))
    return validate_storage_key("/".join(parts))
