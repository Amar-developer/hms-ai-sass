"""Dry-run-first, resumable migration of legacy local documents to S3."""

import argparse
import hashlib
import json
import sys

from sqlmodel import Session, select

from app.core.config import get_settings
from app.core.database import engine
from app.modules.audit.service import record_audit_event
from app.modules.files.models import FileDocument
from app.modules.files.services.artifact_service import ArtifactService
from app.modules.files.storage.factory import get_storage_backend
from app.modules.files.storage.keys import build_storage_key
from app.modules.tenants.models import now_utc


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--execute", action="store_true")
    parser.add_argument("--confirm-bucket")
    parser.add_argument("--limit", type=int, default=500)
    args = parser.parse_args()
    settings = get_settings()
    if settings.file_storage_backend != "s3":
        raise SystemExit("Configure the S3 backend before running migration")
    backend = get_storage_backend(settings)
    if args.execute and args.confirm_bucket != backend.bucket:
        raise SystemExit("--confirm-bucket must exactly match the configured bucket")

    summary = {
        "candidates": 0,
        "migrated": 0,
        "failed": 0,
        "mode": "execute" if args.execute else "dry-run",
    }
    with Session(engine) as session:
        rows = session.exec(
            select(FileDocument)
            .where(FileDocument.storage_backend != "s3")
            .order_by(FileDocument.created_at)
            .limit(max(1, min(args.limit, 5000)))
        ).all()
        summary["candidates"] = len(rows)
        for row in rows:
            if not args.execute:
                print(f"candidate file_id={row.id} tenant_id={row.tenant_id}")
                continue
            stored = None
            old_url = row.file_url
            try:
                data = ArtifactService.read_bytes(row)
                checksum = hashlib.sha256(data).hexdigest()
                extension = (
                    "." + row.file_name.rsplit(".", 1)[-1]
                    if "." in row.file_name
                    else ".bin"
                )
                key = build_storage_key(
                    environment=settings.environment,
                    tenant_id=row.tenant_id,
                    module=row.source_module,
                    document_type=row.category,
                    entity_id=row.attached_to_name or row.id,
                    extension=extension,
                    prefix=settings.aws_s3_prefix,
                )
                stored = backend.put(
                    key=key,
                    data=data,
                    content_type=row.content_type or "application/octet-stream",
                    checksum_sha256=checksum,
                    metadata={"sha256": checksum, "document-id": row.id},
                    tags={
                        "artifact": row.artifact_type or "original",
                        "retention": "permanent",
                        "environment": settings.environment,
                    },
                )
                head = backend.head(key=stored.key)
                if head.size != len(data) or head.checksum_sha256 != checksum:
                    raise RuntimeError("S3 size/checksum verification failed")
                row.storage_backend = "s3"
                row.storage_key = stored.key
                row.storage_bucket = stored.bucket
                row.storage_region = stored.region
                row.storage_version_id = stored.version_id
                row.storage_class = stored.storage_class
                row.checksum_sha256 = checksum
                row.stored_size_bytes = stored.size
                row.file_size = stored.size
                row.file_url = f"/api/v1/files/{row.id}/download"
                row.updated_at = now_utc()
                session.add(row)
                session.commit()
                record_audit_event(
                    session,
                    tenant_id=row.tenant_id,
                    branch_id=row.branch_id,
                    action="file.migrated_to_s3",
                    resource_type="file",
                    resource_id=row.id,
                    purpose="storage_migration",
                    metadata_json=json.dumps(
                        {
                            "old_url": old_url,
                            "storage_key": stored.key,
                            "checksum": checksum,
                        }
                    ),
                )
                summary["migrated"] += 1
            except Exception as exc:
                session.rollback()
                if stored:
                    try:
                        backend.delete(key=stored.key, version_id=stored.version_id)
                    except Exception:
                        pass
                summary["failed"] += 1
                print(f"failed file_id={row.id}: {exc}", file=sys.stderr)
    print(json.dumps(summary, indent=2))
    return 1 if summary["failed"] else 0


if __name__ == "__main__":
    sys.exit(main())
