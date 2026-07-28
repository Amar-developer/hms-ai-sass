import uuid
from pathlib import Path

from fastapi import HTTPException, UploadFile, status

from app.core.config import get_settings

UPLOADS_DIR = get_settings().uploads_dir.expanduser().resolve()
PRIVATE_UPLOADS_DIR = (UPLOADS_DIR.parent / "private_uploads").resolve()
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 MB
_CHUNK = 1024 * 1024  # 1 MB streamed read

# Content is validated by inspecting the actual bytes (magic numbers), never by
# trusting the client-supplied Content-Type or filename. Each allowed type maps
# to a canonical, server-owned extension so a malicious ".svg"/".html"/".php"
# can never be persisted or later served with an executable extension.
# SVG and HTML are deliberately absent — they are script-executable when served
# inline and are the stored-XSS vector.
_MAGIC_SIGNATURES: tuple[tuple[bytes, str, str], ...] = (
    (b"%PDF", "application/pdf", ".pdf"),
    (b"\x89PNG\r\n\x1a\n", "image/png", ".png"),
    (b"\xff\xd8\xff", "image/jpeg", ".jpg"),
    (b"GIF87a", "image/gif", ".gif"),
    (b"GIF89a", "image/gif", ".gif"),
    # DOCX / XLSX (OOXML) and legacy DOC.
    (b"PK\x03\x04", "application/vnd.openxmlformats-officedocument", ".docx"),
    (b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1", "application/msword", ".doc"),
)


def _ensure_dir(directory: Path) -> None:
    directory.mkdir(parents=True, exist_ok=True)


def _sniff(data: bytes) -> tuple[str, str]:
    """Return (canonical_content_type, safe_extension) or raise 400.

    WEBP/RIFF is handled explicitly because its magic is split (RIFF....WEBP)."""
    for magic, content_type, ext in _MAGIC_SIGNATURES:
        if data.startswith(magic):
            return content_type, ext
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp", ".webp"
    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail="Unsupported or unrecognized file. Upload a PDF, image (PNG/JPG/GIF/WEBP), or Word document.",
    )


async def _read_bounded(file: UploadFile) -> bytes:
    """Stream the upload in chunks, aborting as soon as the size cap is exceeded
    so an oversized body is never fully buffered in memory (DoS guard)."""
    buffer = bytearray()
    while True:
        chunk = await file.read(_CHUNK)
        if not chunk:
            break
        buffer.extend(chunk)
        if len(buffer) > MAX_FILE_SIZE:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail="File too large (max 10 MB)",
            )
    return bytes(buffer)


async def _save_upload_to(
    file: UploadFile, prefix: str, directory: Path, url_prefix: str
) -> tuple[str, str, str]:
    """Validate and persist an UploadFile.

    Returns (filename, url_path, content_type) where content_type is the
    server-verified type — callers should store this, not the client's header.
    """
    data = await _read_bounded(file)
    if not data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Empty file"
        )
    content_type, ext = _sniff(data)
    # Filename is fully server-generated: opaque id + validated extension. The
    # client's original filename/extension is never used on disk.
    filename = f"{prefix}_{uuid.uuid4().hex}{ext}"
    _ensure_dir(directory)
    (directory / filename).write_bytes(data)
    return filename, f"{url_prefix}/{filename}", content_type


async def save_upload(file: UploadFile, prefix: str) -> tuple[str, str, str]:
    return await _save_upload_to(file, prefix, UPLOADS_DIR, "/uploads")


async def save_private_upload(file: UploadFile, prefix: str) -> tuple[str, str, str]:
    return await _save_upload_to(file, prefix, PRIVATE_UPLOADS_DIR, "private:/")
