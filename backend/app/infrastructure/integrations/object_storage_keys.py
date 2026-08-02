from pathlib import PurePosixPath


def validate_storage_key(key: str) -> str:
    normalized = str(PurePosixPath(key))
    if (
        not key
        or key.startswith("/")
        or "\\" in key
        or normalized == "."
        or any(part in {"", ".", ".."} for part in key.split("/"))
    ):
        raise ValueError("Invalid storage key")
    return normalized
