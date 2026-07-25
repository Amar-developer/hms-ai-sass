import base64
import hashlib

from cryptography.fernet import Fernet, InvalidToken

from app.core.config import get_settings


LOCAL_DEVELOPMENT_KEY = "local-development-credential-key-change-before-production"


def _fernet() -> Fernet:
    settings = get_settings()
    secret = settings.credential_encryption_key
    unsafe_defaults = {
        LOCAL_DEVELOPMENT_KEY,
        "replace-with-at-least-32-random-characters",
    }
    if settings.environment.lower() in {"production", "staging"} and (
        secret in unsafe_defaults
    ):
        raise RuntimeError(
            "MEDIZINHUB_CREDENTIAL_ENCRYPTION_KEY must be configured outside "
            "local development"
        )
    derived_key = base64.urlsafe_b64encode(
        hashlib.sha256(secret.encode("utf-8")).digest()
    )
    return Fernet(derived_key)


def encrypt_credential(value: str) -> str:
    normalized = value.strip()
    if not normalized:
        raise ValueError("Credential cannot be empty")
    return _fernet().encrypt(normalized.encode("utf-8")).decode("ascii")


def decrypt_credential(value: str) -> str:
    try:
        return _fernet().decrypt(value.encode("ascii")).decode("utf-8")
    except InvalidToken as exc:
        raise ValueError("Stored credential could not be decrypted") from exc
