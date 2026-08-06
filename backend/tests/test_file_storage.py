from io import BytesIO

import pytest

from app.core.config import Settings
from app.modules.files.storage.factory import get_storage_backend
from app.modules.files.storage.keys import build_storage_key, validate_storage_key
from app.modules.files.storage.local import LocalStorageBackend
from app.modules.files.storage.s3 import S3StorageBackend
from scripts.verify_document_storage import _s3_readiness
from scripts.validate_cloudformation_templates import validate


class FakeS3Client:
    def __init__(self):
        self.objects: dict[tuple[str, str], dict] = {}
        self.last_put: dict | None = None

    def put_object(self, **request):
        self.last_put = request
        self.objects[(request["Bucket"], request["Key"])] = request
        return {"VersionId": "version-1"}

    def get_object(self, **request):
        stored = self.objects[(request["Bucket"], request["Key"])]
        return {"Body": BytesIO(stored["Body"])}

    def head_object(self, **request):
        stored = self.objects[(request["Bucket"], request["Key"])]
        return {
            "ContentLength": len(stored["Body"]),
            "ContentType": stored["ContentType"],
            "Metadata": stored["Metadata"],
            "VersionId": "version-1",
        }

    def delete_object(self, **request):
        self.objects.pop((request["Bucket"], request["Key"]), None)

    def generate_presigned_url(self, operation, Params, ExpiresIn):
        return (
            f"https://example.test/{Params['Bucket']}/{Params['Key']}"
            f"?operation={operation}&expires={ExpiresIn}"
        )


def test_local_storage_contract(tmp_path):
    backend = LocalStorageBackend(tmp_path)
    stored = backend.put(
        key="local/tenants/tenant-1/files/general/unattached/file.pdf",
        data=b"%PDF-test",
        content_type="application/pdf",
        checksum_sha256="a" * 64,
    )

    assert stored.size == 9
    assert backend.exists(key=stored.key)
    assert backend.get_bytes(key=stored.key) == b"%PDF-test"
    assert backend.head(key=stored.key).size == 9

    backend.delete(key=stored.key)
    assert not backend.exists(key=stored.key)


@pytest.mark.parametrize(
    "key", ["", "/absolute.pdf", "../escape.pdf", "safe/../../escape.pdf", "a\\b"]
)
def test_storage_key_rejects_unsafe_paths(key):
    with pytest.raises(ValueError):
        validate_storage_key(key)


def test_storage_key_is_server_controlled():
    key = build_storage_key(
        environment="dev",
        tenant_id="tenant/one",
        module="billing",
        document_type="invoice",
        entity_id="invoice/one",
        extension=".pdf",
        prefix="documents",
    )

    assert key.startswith(
        "documents/dev/tenants/tenant-one/billing/invoice/invoice-one/"
    )
    assert key.endswith(".pdf")
    assert "//" not in key


def test_s3_storage_contract_and_encryption():
    client = FakeS3Client()
    backend = S3StorageBackend(
        bucket="medizinhub-dev-documents",
        region="ap-south-1",
        kms_key_id="alias/medizinhub-dev",
        client=client,
    )
    key = "dev/tenants/tenant-1/files/general/unattached/file.pdf"
    stored = backend.put(
        key=key,
        data=b"%PDF-test",
        content_type="application/pdf",
        checksum_sha256="b" * 64,
        metadata={"sha256": "b" * 64},
        tags={"artifact": "original", "retention": "permanent"},
    )

    assert stored.bucket == "medizinhub-dev-documents"
    assert stored.version_id == "version-1"
    assert client.last_put["ServerSideEncryption"] == "aws:kms"
    assert client.last_put["SSEKMSKeyId"] == "alias/medizinhub-dev"
    assert client.last_put["Tagging"] == "artifact=original&retention=permanent"
    assert backend.get_bytes(key=key) == b"%PDF-test"
    assert backend.head(key=key).checksum_sha256 == "b" * 64
    assert "expires=900" in backend.create_download_url(key=key, expires_in=900)

    backend.delete(key=key, version_id=stored.version_id)
    assert (backend.bucket, key) not in client.objects


def test_storage_factory_defaults_to_local(tmp_path):
    backend = get_storage_backend(Settings(uploads_dir=tmp_path))
    assert isinstance(backend, LocalStorageBackend)


def test_s3_configuration_requires_bucket():
    with pytest.raises(ValueError, match="aws_s3_bucket is required"):
        Settings(file_storage_backend="s3", aws_s3_bucket="")


def test_phase4_s3_readiness_requires_security_and_lifecycle_controls():
    class ReadinessClient:
        def head_bucket(self, **_request):
            return {}

        def get_bucket_encryption(self, **_request):
            return {
                "ServerSideEncryptionConfiguration": {
                    "Rules": [
                        {
                            "ApplyServerSideEncryptionByDefault": {
                                "SSEAlgorithm": "AES256"
                            }
                        }
                    ]
                }
            }

        def get_public_access_block(self, **_request):
            return {
                "PublicAccessBlockConfiguration": {
                    "BlockPublicAcls": True,
                    "IgnorePublicAcls": True,
                    "BlockPublicPolicy": True,
                    "RestrictPublicBuckets": True,
                }
            }

        def get_bucket_versioning(self, **_request):
            return {"Status": "Enabled"}

        def get_bucket_lifecycle_configuration(self, **_request):
            return {
                "Rules": [
                    {"ID": "AbortIncompleteMultipartUploads"},
                    {"ID": "DeleteExplicitTemporaryObjects"},
                ]
            }

    checks = _s3_readiness(
        ReadinessClient(), bucket="medizinhub-prod-documents", production=True
    )

    assert {check["check"] for check in checks} == {
        "bucket_access",
        "default_encryption",
        "public_access_block",
        "versioning",
        "lifecycle",
    }


def test_phase4_cloudformation_templates_have_required_controls():
    validate()
