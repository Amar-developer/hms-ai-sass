from app.core.config import Settings, get_settings
from app.infrastructure.integrations.adapters.object_storage.s3 import S3ObjectStorage
from app.infrastructure.integrations.ports.object_storage import ObjectStorage
from app.modules.files.storage.local import LocalStorageBackend


def get_storage_backend(settings: Settings | None = None) -> ObjectStorage:
    settings = settings or get_settings()
    if settings.file_storage_backend == "local":
        return LocalStorageBackend(settings.uploads_dir)
    if settings.file_storage_backend == "s3":
        return S3ObjectStorage(
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
) -> ObjectStorage:
    settings = settings or get_settings()
    if row.storage_backend == "s3":
        return S3ObjectStorage(
            bucket=row.storage_bucket or settings.aws_s3_bucket or "",
            region=row.storage_region or settings.aws_s3_region,
            endpoint_url=settings.aws_s3_endpoint_url,
            kms_key_id=settings.aws_s3_kms_key_id,
        )
    return LocalStorageBackend(settings.uploads_dir)
