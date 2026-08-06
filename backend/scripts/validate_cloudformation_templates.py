"""Offline structural validation for CloudFormation templates with intrinsic tags."""

from pathlib import Path
import sys

import yaml


ROOT = Path(__file__).resolve().parents[2]
TEMPLATE = ROOT / "infra/aws/document-storage.yaml"


class CloudFormationLoader(yaml.SafeLoader):
    pass


def _intrinsic(loader, suffix, node):
    if isinstance(node, yaml.SequenceNode):
        value = loader.construct_sequence(node)
    elif isinstance(node, yaml.MappingNode):
        value = loader.construct_mapping(node)
    else:
        value = loader.construct_scalar(node)
    return {f"Fn::{suffix}" if suffix != "Ref" else "Ref": value}


CloudFormationLoader.add_multi_constructor("!", _intrinsic)


def validate() -> None:
    storage = yaml.load(
        TEMPLATE.read_text(encoding="utf-8"), Loader=CloudFormationLoader
    )
    resources = storage.get("Resources", {})
    bucket = resources["DocumentBucket"]["Properties"]
    public = bucket["PublicAccessBlockConfiguration"]
    if not all(public.values()):
        raise ValueError("Document bucket must block every form of public access")
    if "BucketEncryption" not in bucket or "LifecycleConfiguration" not in bucket:
        raise ValueError("Document bucket requires encryption and lifecycle controls")
    if resources["DocumentBucket"].get("DeletionPolicy") != "Retain":
        raise ValueError("Document bucket deletion policy must retain healthcare data")


def main() -> int:
    validate()
    print("S3 CloudFormation template: structurally valid")
    return 0


if __name__ == "__main__":
    sys.exit(main())
