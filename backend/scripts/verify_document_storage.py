"""Read-only storage readiness checks with an explicit optional write probe."""

import argparse
import hashlib
import json
import os
from pathlib import Path
import sys
import uuid

from app.core.config import get_settings
from app.modules.files.storage.factory import get_storage_backend


def _result(name: str, status: str, detail: str) -> dict[str, str]:
    return {"check": name, "status": status, "detail": detail}


def _s3_readiness(client, *, bucket: str, production: bool) -> list[dict[str, str]]:
    checks: list[dict[str, str]] = []
    client.head_bucket(Bucket=bucket)
    checks.append(_result("bucket_access", "pass", "Bucket metadata is readable"))

    encryption = client.get_bucket_encryption(Bucket=bucket)
    rules = encryption["ServerSideEncryptionConfiguration"]["Rules"]
    algorithms = sorted(
        {rule["ApplyServerSideEncryptionByDefault"]["SSEAlgorithm"] for rule in rules}
    )
    checks.append(
        _result("default_encryption", "pass", f"Algorithms: {', '.join(algorithms)}")
    )

    public = client.get_public_access_block(Bucket=bucket)[
        "PublicAccessBlockConfiguration"
    ]
    if not all(public.get(key) for key in public):
        raise RuntimeError("All four S3 public-access-block controls must be enabled")
    checks.append(_result("public_access_block", "pass", "All controls enabled"))

    versioning = client.get_bucket_versioning(Bucket=bucket).get("Status", "Disabled")
    if production and versioning != "Enabled":
        raise RuntimeError("Production bucket versioning must be enabled")
    checks.append(_result("versioning", "pass", versioning))

    lifecycle = client.get_bucket_lifecycle_configuration(Bucket=bucket).get(
        "Rules", []
    )
    rule_ids = {str(rule.get("ID") or "") for rule in lifecycle}
    required = {"AbortIncompleteMultipartUploads", "DeleteExplicitTemporaryObjects"}
    if not required.issubset(rule_ids):
        raise RuntimeError(
            "Lifecycle rules are incomplete; deploy infra/aws/document-storage.yaml"
        )
    checks.append(_result("lifecycle", "pass", f"Configured rules: {len(lifecycle)}"))
    return checks


def _write_probe(*, production_allowed: bool) -> dict[str, str]:
    settings = get_settings()
    production = settings.environment.strip().lower() in {"production", "prod"}
    if production and not production_allowed:
        raise RuntimeError(
            "Production write probes require --allow-production-write-probe"
        )
    backend = get_storage_backend(settings)
    data = b"MedizinHub document storage Phase 4 probe\n"
    checksum = hashlib.sha256(data).hexdigest()
    key = f"phase4-probes/{settings.environment}/{uuid.uuid4().hex}.txt"
    stored = None
    try:
        stored = backend.put(
            key=key,
            data=data,
            content_type="text/plain",
            checksum_sha256=checksum,
            metadata={"sha256": checksum, "probe": "phase4"},
            tags={
                "artifact": "probe",
                "retention": "temporary",
                "environment": settings.environment,
            },
        )
        if backend.get_bytes(key=key) != data:
            raise RuntimeError("Write probe content did not round-trip correctly")
        return _result("write_read_delete_probe", "pass", "Round trip succeeded")
    finally:
        if stored:
            backend.delete(key=stored.key, version_id=stored.version_id)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--live", action="store_true", help="Call read-only AWS APIs")
    parser.add_argument(
        "--write-probe",
        action="store_true",
        help="Create, read, and immediately delete one temporary probe object",
    )
    parser.add_argument("--allow-production-write-probe", action="store_true")
    args = parser.parse_args()
    settings = get_settings()
    checks = [
        _result("configuration", "pass", "Application settings validated"),
        _result("backend", "pass", settings.file_storage_backend),
        _result("environment", "pass", settings.environment),
    ]
    try:
        if settings.file_storage_backend == "local":
            root = Path(settings.uploads_dir)
            parent = root if root.exists() else root.parent
            if not parent.exists() or not os.access(parent, os.W_OK):
                raise RuntimeError("Local storage path is not writable")
            checks.append(_result("local_path", "pass", "Writable path available"))
        elif args.live or args.write_probe:
            backend = get_storage_backend(settings)
            checks.extend(
                _s3_readiness(
                    backend.client,
                    bucket=backend.bucket,
                    production=settings.environment.strip().lower()
                    in {"production", "prod"},
                )
            )
        else:
            checks.append(
                _result("aws_live_checks", "skipped", "Run again with --live")
            )
        if args.write_probe:
            checks.append(
                _write_probe(
                    production_allowed=args.allow_production_write_probe,
                )
            )
    except Exception as exc:
        checks.append(_result("readiness", "fail", str(exc)))
        print(json.dumps({"ready": False, "checks": checks}, indent=2))
        return 1
    print(json.dumps({"ready": True, "checks": checks}, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
