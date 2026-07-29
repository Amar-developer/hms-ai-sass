import os
from pathlib import Path
import uuid

from app.modules.files.storage.base import (
    StorageBackend,
    StorageObject,
    StorageObjectMetadata,
)
from app.modules.files.storage.keys import validate_storage_key


class LocalStorageBackend(StorageBackend):
    name = "local"

    def __init__(self, root: Path):
        self.root = root.expanduser().resolve()

    def resolve_path(self, key: str) -> Path:
        validated = validate_storage_key(key)
        candidate = (self.root / validated).resolve()
        try:
            candidate.relative_to(self.root)
        except ValueError as exc:
            raise ValueError("Storage key escapes the configured root") from exc
        return candidate

    def put(
        self,
        *,
        key: str,
        data: bytes,
        content_type: str,
        checksum_sha256: str,
        metadata: dict[str, str] | None = None,
        tags: dict[str, str] | None = None,
    ) -> StorageObject:
        destination = self.resolve_path(key)
        destination.parent.mkdir(parents=True, exist_ok=True)
        temporary = destination.with_name(f".{destination.name}.{uuid.uuid4().hex}.tmp")
        try:
            temporary.write_bytes(data)
            os.replace(temporary, destination)
        finally:
            temporary.unlink(missing_ok=True)
        return StorageObject(
            key=key,
            size=len(data),
            checksum_sha256=checksum_sha256,
            storage_class="LOCAL",
        )

    def get_bytes(self, *, key: str) -> bytes:
        return self.resolve_path(key).read_bytes()

    def exists(self, *, key: str) -> bool:
        return self.resolve_path(key).is_file()

    def head(self, *, key: str) -> StorageObjectMetadata:
        path = self.resolve_path(key)
        stat = path.stat()
        return StorageObjectMetadata(key=key, size=stat.st_size, storage_class="LOCAL")

    def delete(self, *, key: str, version_id: str | None = None) -> None:
        self.resolve_path(key).unlink(missing_ok=True)

    def create_download_url(self, *, key: str, expires_in: int) -> str:
        raise NotImplementedError("Local storage does not create presigned URLs")
