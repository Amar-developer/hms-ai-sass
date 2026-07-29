from app.core.config import Settings, get_settings
from app.modules.files.storage.base import StorageBackend
from app.modules.files.storage.local import LocalStorageBackend
from app.modules.files.storage.s3 import S3StorageBackend


def get_storage_backend(settings: Settings | None = None) -> StorageBackend:
    settings = settings or get_settings()
    if settings.file_storage_backend == "local":
        return LocalStorageBackend(settings.uploads_dir)
    if settings.file_storage_backend == "s3":
        return S3StorageBackend(
            bucket=settings.aws_s3_bucket or "",
            region=settings.aws_s3_region,
            endpoint_url=settings.aws_s3_endpoint_url,
            kms_key_id=settings.aws_s3_kms_key_id,
        )
    raise ValueError(
        f"Unsupported file storage backend: {settings.file_storage_backend}"
    )


def get_storage_backend_for_document(
    row, settings: Settings | None = None
) -> StorageBackend:
    settings = settings or get_settings()
    if row.storage_backend == "s3":
        return S3StorageBackend(
            bucket=row.storage_bucket or settings.aws_s3_bucket or "",
            region=row.storage_region or settings.aws_s3_region,
            endpoint_url=settings.aws_s3_endpoint_url,
            kms_key_id=settings.aws_s3_kms_key_id,
        )
    return LocalStorageBackend(settings.uploads_dir)
