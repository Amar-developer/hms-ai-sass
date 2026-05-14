import uuid
from pathlib import Path

from fastapi import HTTPException, UploadFile, status

UPLOADS_DIR = Path("uploads")
ALLOWED_MIME_PREFIXES = ("image/", "application/pdf", "application/msword", "application/vnd.openxmlformats")
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 MB


def _ensure_dir() -> None:
    UPLOADS_DIR.mkdir(parents=True, exist_ok=True)


async def save_upload(file: UploadFile, prefix: str) -> tuple[str, str]:
    """Save an UploadFile and return (filename, url_path)."""
    content_type = file.content_type or ""
    if not any(content_type.startswith(p) for p in ALLOWED_MIME_PREFIXES):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File type '{content_type}' is not allowed. Upload PDF or image files.",
        )
    data = await file.read()
    if len(data) > MAX_FILE_SIZE:
        raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="File too large (max 10 MB)")
    ext = Path(file.filename or "file").suffix or ".bin"
    filename = f"{prefix}_{uuid.uuid4().hex}{ext}"
    _ensure_dir()
    (UPLOADS_DIR / filename).write_bytes(data)
    return filename, f"/uploads/{filename}"
