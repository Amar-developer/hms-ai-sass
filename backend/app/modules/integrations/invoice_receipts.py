import base64
import hashlib
import hmac
import time
from pathlib import Path
from urllib.parse import quote

from fastapi import HTTPException, status
from sqlmodel import Session, select

from app.core.config import get_settings
from app.core.uploads import UPLOADS_DIR
from app.modules.billing.models import Invoice
from app.modules.files.models import FileDocument
from app.modules.files.storage.factory import get_storage_backend_for_document


DEFAULT_RECEIPT_TTL_SECONDS = 60 * 60
MAX_RECEIPT_TTL_SECONDS = 24 * 60 * 60


def _signing_key() -> bytes:
    secret = get_settings().credential_encryption_key.encode("utf-8")
    return hashlib.sha256(b"invoice-receipt-signing\0" + secret).digest()


def _signature(
    tenant_id: str, invoice_id: str, expires: int, file_id: str | None = None
) -> str:
    message = f"{tenant_id}:{invoice_id}:{file_id or ''}:{expires}".encode("utf-8")
    digest = hmac.new(_signing_key(), message, hashlib.sha256).digest()
    return base64.urlsafe_b64encode(digest).decode("ascii").rstrip("=")


def create_signed_invoice_receipt_url(
    *,
    public_base_url: str,
    tenant_id: str,
    invoice_id: str,
    file_id: str | None = None,
    now_timestamp: int | None = None,
    ttl_seconds: int = DEFAULT_RECEIPT_TTL_SECONDS,
) -> str:
    ttl = min(max(int(ttl_seconds), 60), MAX_RECEIPT_TTL_SECONDS)
    expires = int(now_timestamp if now_timestamp is not None else time.time()) + ttl
    signature = _signature(tenant_id, invoice_id, expires, file_id)
    base = public_base_url.rstrip("/")
    file_query = f"&file_id={quote(file_id, safe='')}" if file_id else ""
    return (
        f"{base}/api/v1/communications/public/invoice-receipts/"
        f"{quote(invoice_id, safe='')}.pdf?tenant_id={quote(tenant_id, safe='')}"
        f"{file_query}&expires={expires}&signature={signature}"
    )


def verify_invoice_receipt_signature(
    *,
    tenant_id: str,
    invoice_id: str,
    file_id: str | None = None,
    expires: int,
    signature: str,
    now_timestamp: int | None = None,
) -> None:
    now = int(now_timestamp if now_timestamp is not None else time.time())
    if expires < now:
        raise HTTPException(
            status_code=status.HTTP_410_GONE,
            detail="Invoice receipt link has expired",
        )
    if expires > now + MAX_RECEIPT_TTL_SECONDS:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Receipt not found"
        )
    expected = _signature(tenant_id, invoice_id, expires, file_id)
    if not hmac.compare_digest(signature, expected):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Receipt not found"
        )


def render_invoice_receipt_pdf(
    session: Session, *, tenant_id: str, invoice_id: str, file_id: str | None = None
) -> tuple[bytes, str]:
    invoice = session.get(Invoice, invoice_id)
    if not invoice or invoice.tenant_id != tenant_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Receipt not found"
        )
    if file_id:
        stored = session.get(FileDocument, file_id)
        if not (
            stored
            and stored.tenant_id == tenant_id
            and stored.attached_to_doctype == "Invoice"
            and stored.attached_to_name == invoice.id
            and stored.attached_to_field == "invoice_pdf"
            and stored.artifact_type == "final"
            and stored.document_status == "ready"
        ):
            stored = None
    else:
        stored = session.exec(
            select(FileDocument)
            .where(
                FileDocument.tenant_id == tenant_id,
                FileDocument.attached_to_doctype == "Invoice",
                FileDocument.attached_to_name == invoice.id,
                FileDocument.attached_to_field == "invoice_pdf",
                FileDocument.is_active == True,  # noqa: E712
            )
            .order_by(FileDocument.document_version.desc())
        ).first()
    if stored and str(stored.content_type or "").lower() == "application/pdf":
        if stored.storage_key:
            try:
                backend = get_storage_backend_for_document(stored)
                return backend.get_bytes(key=stored.storage_key), stored.file_name
            except Exception:
                pass
        else:
            candidate = UPLOADS_DIR / Path(stored.file_url).name
            try:
                resolved = candidate.resolve()
                resolved.relative_to(UPLOADS_DIR.resolve())
            except (ValueError, OSError):
                resolved = None
            if resolved and resolved.is_file():
                return resolved.read_bytes(), stored.file_name
    raise HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail="The printed invoice PDF is not available",
    )
