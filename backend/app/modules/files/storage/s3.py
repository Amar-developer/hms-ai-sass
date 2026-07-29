import base64
from urllib.parse import urlencode

from app.modules.files.storage.base import (
    StorageBackend,
    StorageObject,
    StorageObjectMetadata,
)
from app.modules.files.storage.keys import validate_storage_key


class S3StorageBackend(StorageBackend):
    name = "s3"

    def __init__(
        self,
        *,
        bucket: str,
        region: str,
        endpoint_url: str | None = None,
        kms_key_id: str | None = None,
        client=None,
    ):
        if not bucket.strip():
            raise ValueError("AWS S3 bucket is required when S3 storage is enabled")
        self.bucket = bucket.strip()
        self.region = region.strip()
        self.kms_key_id = (kms_key_id or "").strip() or None
        if client is None:
            try:
                import boto3
            except ImportError as exc:  # pragma: no cover - deployment guard
                raise RuntimeError(
                    "boto3 is required when FILE_STORAGE_BACKEND=s3"
                ) from exc
            client = boto3.client(
                "s3", region_name=self.region, endpoint_url=endpoint_url or None
            )
        self.client = client

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
        key = validate_storage_key(key)
        request: dict[str, object] = {
            "Bucket": self.bucket,
            "Key": key,
            "Body": data,
            "ContentType": content_type,
            "ChecksumSHA256": base64.b64encode(bytes.fromhex(checksum_sha256)).decode(
                "ascii"
            ),
            "Metadata": {str(k): str(v) for k, v in (metadata or {}).items()},
        }
        if tags:
            request["Tagging"] = urlencode(
                sorted((str(key), str(value)) for key, value in tags.items())
            )
        if self.kms_key_id:
            request.update(ServerSideEncryption="aws:kms", SSEKMSKeyId=self.kms_key_id)
        else:
            request["ServerSideEncryption"] = "AES256"
        response = self.client.put_object(**request)
        return StorageObject(
            key=key,
            bucket=self.bucket,
            region=self.region,
            size=len(data),
            checksum_sha256=checksum_sha256,
            version_id=response.get("VersionId"),
            storage_class="STANDARD",
        )

    def get_bytes(self, *, key: str) -> bytes:
        response = self.client.get_object(
            Bucket=self.bucket, Key=validate_storage_key(key)
        )
        return response["Body"].read()

    def exists(self, *, key: str) -> bool:
        try:
            self.head(key=key)
            return True
        except Exception as exc:
            response = getattr(exc, "response", {})
            code = str(response.get("Error", {}).get("Code", ""))
            if code in {"404", "NoSuchKey", "NotFound"}:
                return False
            raise

    def head(self, *, key: str) -> StorageObjectMetadata:
        key = validate_storage_key(key)
        response = self.client.head_object(Bucket=self.bucket, Key=key)
        checksum = response.get("Metadata", {}).get("sha256")
        return StorageObjectMetadata(
            key=key,
            bucket=self.bucket,
            region=self.region,
            size=int(response["ContentLength"]),
            content_type=response.get("ContentType"),
            checksum_sha256=checksum,
            version_id=response.get("VersionId"),
            storage_class=response.get("StorageClass", "STANDARD"),
        )

    def delete(self, *, key: str, version_id: str | None = None) -> None:
        request = {"Bucket": self.bucket, "Key": validate_storage_key(key)}
        if version_id:
            request["VersionId"] = version_id
        self.client.delete_object(**request)

    def create_download_url(self, *, key: str, expires_in: int) -> str:
        return self.client.generate_presigned_url(
            "get_object",
            Params={"Bucket": self.bucket, "Key": validate_storage_key(key)},
            ExpiresIn=expires_in,
        )
