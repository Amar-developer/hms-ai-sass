"""Read-only reconciliation between document metadata, deliveries, and S3."""

import argparse
import json
import sys

from sqlmodel import Session, select

from app.core.config import get_settings
from app.core.database import engine
from app.modules.files.models import FileDocument
from app.modules.files.storage.factory import get_storage_backend
from app.modules.notifications.models import DocumentDelivery


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--list-orphans", action="store_true")
    parser.add_argument("--limit", type=int, default=5000)
    args = parser.parse_args()
    settings = get_settings()
    backend = get_storage_backend(settings)
    issues: list[dict[str, str]] = []
    known_keys: set[str] = set()
    with Session(engine) as session:
        rows = session.exec(
            select(FileDocument).order_by(FileDocument.created_at).limit(args.limit)
        ).all()
        for row in rows:
            if row.storage_backend != "s3" or not row.storage_key:
                continue
            known_keys.add(row.storage_key)
            try:
                head = backend.head(key=row.storage_key)
                expected_size = int(row.stored_size_bytes or row.file_size or 0)
                if expected_size and head.size != expected_size:
                    issues.append({"type": "size_mismatch", "file_id": row.id})
                if row.checksum_sha256 and head.checksum_sha256 != row.checksum_sha256:
                    issues.append({"type": "checksum_mismatch", "file_id": row.id})
                tags = backend.client.get_object_tagging(
                    Bucket=backend.bucket, Key=row.storage_key
                ).get("TagSet", [])
                tag_map = {tag["Key"]: tag["Value"] for tag in tags}
                if tag_map.get("retention") != "permanent":
                    issues.append({"type": "retention_tag", "file_id": row.id})
            except Exception as exc:
                issues.append(
                    {
                        "type": "missing_or_unreadable",
                        "file_id": row.id,
                        "detail": str(exc),
                    }
                )
        deliveries = session.exec(select(DocumentDelivery)).all()
        for delivery in deliveries:
            artifact = session.get(FileDocument, delivery.artifact_file_id)
            if not artifact or artifact.tenant_id != delivery.tenant_id:
                issues.append(
                    {"type": "delivery_artifact_missing", "delivery_id": delivery.id}
                )
            elif artifact.document_version != delivery.artifact_version:
                issues.append(
                    {"type": "delivery_version_mismatch", "delivery_id": delivery.id}
                )

    if args.list_orphans and settings.file_storage_backend == "s3":
        paginator = backend.client.get_paginator("list_objects_v2")
        prefix = settings.aws_s3_prefix.strip("/")
        for page in paginator.paginate(Bucket=backend.bucket, Prefix=prefix):
            for item in page.get("Contents", []):
                key = item["Key"]
                if key not in known_keys and not key.startswith("phase4-probes/"):
                    issues.append({"type": "orphan_object", "storage_key": key})
    print(json.dumps({"healthy": not issues, "issues": issues}, indent=2))
    return 1 if issues else 0


if __name__ == "__main__":
    sys.exit(main())
