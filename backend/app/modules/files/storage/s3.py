"""Compatibility import for the external S3 adapter."""

from app.infrastructure.integrations.adapters.object_storage.s3 import (
    S3ObjectStorage,
    S3StorageBackend,
)

__all__ = ["S3ObjectStorage", "S3StorageBackend"]
