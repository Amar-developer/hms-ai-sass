from abc import ABC, abstractmethod
from dataclasses import dataclass


@dataclass(frozen=True)
class StorageObject:
    key: str
    size: int
    checksum_sha256: str
    bucket: str | None = None
    region: str | None = None
    version_id: str | None = None
    storage_class: str | None = None


@dataclass(frozen=True)
class StorageObjectMetadata:
    key: str
    size: int
    content_type: str | None = None
    checksum_sha256: str | None = None
    bucket: str | None = None
    region: str | None = None
    version_id: str | None = None
    storage_class: str | None = None


class StorageBackend(ABC):
    name: str

    @abstractmethod
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
        raise NotImplementedError

    @abstractmethod
    def get_bytes(self, *, key: str) -> bytes:
        raise NotImplementedError

    @abstractmethod
    def exists(self, *, key: str) -> bool:
        raise NotImplementedError

    @abstractmethod
    def head(self, *, key: str) -> StorageObjectMetadata:
        raise NotImplementedError

    @abstractmethod
    def delete(self, *, key: str, version_id: str | None = None) -> None:
        raise NotImplementedError

    @abstractmethod
    def create_download_url(self, *, key: str, expires_in: int) -> str:
        raise NotImplementedError
