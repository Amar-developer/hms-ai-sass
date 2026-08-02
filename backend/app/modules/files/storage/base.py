"""Compatibility imports for the Files domain's storage contract.

New code should import the contract from ``app.infrastructure.integrations.ports``.
"""

from app.infrastructure.integrations.ports.object_storage import (
    StorageBackend,
    StorageObject,
    StorageObjectMetadata,
)

__all__ = ["StorageBackend", "StorageObject", "StorageObjectMetadata"]
