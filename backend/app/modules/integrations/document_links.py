import base64
import hashlib
import hmac
import time

from fastapi import HTTPException, status

from app.core.config import get_settings


MAX_DOCUMENT_LINK_TTL_SECONDS = 24 * 60 * 60


def _key() -> bytes:
    secret = get_settings().credential_encryption_key.encode("utf-8")
    return hashlib.sha256(b"document-artifact-link\0" + secret).digest()


def _signature(tenant_id: str, file_id: str, expires: int) -> str:
    digest = hmac.new(
        _key(), f"{tenant_id}:{file_id}:{expires}".encode(), hashlib.sha256
    ).digest()
    return base64.urlsafe_b64encode(digest).decode().rstrip("=")


def create_signed_document_url(
    *, public_base_url: str, tenant_id: str, file_id: str, ttl_seconds: int = 3600
) -> str:
    ttl = min(max(ttl_seconds, 60), MAX_DOCUMENT_LINK_TTL_SECONDS)
    expires = int(time.time()) + ttl
    signature = _signature(tenant_id, file_id, expires)
    return (
        f"{public_base_url.rstrip('/')}/api/v1/communications/public/"
        f"document-artifacts/{file_id}?tenant_id={tenant_id}"
        f"&expires={expires}&signature={signature}"
    )


def verify_document_signature(
    *, tenant_id: str, file_id: str, expires: int, signature: str
) -> None:
    now = int(time.time())
    if expires < now:
        raise HTTPException(status_code=status.HTTP_410_GONE, detail="Link expired")
    if expires > now + MAX_DOCUMENT_LINK_TTL_SECONDS:
        raise HTTPException(status_code=404, detail="Document not found")
    if not hmac.compare_digest(signature, _signature(tenant_id, file_id, expires)):
        raise HTTPException(status_code=404, detail="Document not found")
