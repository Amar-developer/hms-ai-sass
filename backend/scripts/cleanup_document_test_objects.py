"""Dry-run-first cleanup for the dedicated Phase 4 S3 probe prefix."""

import argparse
import sys

from app.core.config import get_settings
from app.modules.files.storage.factory import get_storage_backend


PROBE_PREFIX = "phase4-probes/"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--execute", action="store_true")
    parser.add_argument(
        "--confirm-bucket",
        help="Required with --execute; must exactly equal the configured bucket",
    )
    args = parser.parse_args()
    settings = get_settings()
    environment = settings.environment.strip().lower()
    if settings.file_storage_backend != "s3":
        raise SystemExit("Cleanup requires the S3 storage backend")
    if environment in {"production", "prod"}:
        raise SystemExit("This tool never cleans production storage")
    backend = get_storage_backend(settings)
    if args.execute and args.confirm_bucket != backend.bucket:
        raise SystemExit("--confirm-bucket must exactly match the configured bucket")

    paginator = backend.client.get_paginator("list_object_versions")
    targets: list[dict[str, str]] = []
    for page in paginator.paginate(Bucket=backend.bucket, Prefix=PROBE_PREFIX):
        for item in [*page.get("Versions", []), *page.get("DeleteMarkers", [])]:
            targets.append({"Key": item["Key"], "VersionId": item["VersionId"]})
    print(
        f"bucket={backend.bucket} prefix={PROBE_PREFIX} "
        f"versions_and_markers={len(targets)} mode={'execute' if args.execute else 'dry-run'}"
    )
    if not args.execute or not targets:
        return 0
    for offset in range(0, len(targets), 1000):
        response = backend.client.delete_objects(
            Bucket=backend.bucket,
            Delete={"Objects": targets[offset : offset + 1000], "Quiet": True},
        )
        if response.get("Errors"):
            raise RuntimeError(f"S3 cleanup errors: {response['Errors']}")
    print(f"deleted={len(targets)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
