from __future__ import annotations

import hashlib
import hmac
import secrets
from datetime import datetime, timedelta, timezone

from sqlalchemy import or_
from sqlmodel import Session, select

from app.modules.identity.models import AuthSession, User

PBKDF2_ITERATIONS = 260_000
SESSION_TTL_HOURS = 12


def hash_password(password: str, salt: str | None = None) -> str:
    password_salt = salt or secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        password_salt.encode("utf-8"),
        PBKDF2_ITERATIONS,
    ).hex()
    return f"pbkdf2_sha256${PBKDF2_ITERATIONS}${password_salt}${digest}"


def verify_password(password: str, password_hash: str) -> bool:
    try:
        algorithm, iterations, salt, expected = password_hash.split("$", 3)
    except ValueError:
        return False
    if algorithm != "pbkdf2_sha256":
        return False
    digest = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt.encode("utf-8"),
        int(iterations),
    ).hex()
    return hmac.compare_digest(digest, expected)


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def create_access_session(session: Session, user: User) -> tuple[str, AuthSession]:
    token = secrets.token_urlsafe(32)
    auth_session = AuthSession(
        user_id=user.id,
        tenant_id=user.tenant_id,
        token_hash=hash_token(token),
        expires_at=datetime.now(timezone.utc) + timedelta(hours=SESSION_TTL_HOURS),
    )
    user.last_login_at = datetime.now(timezone.utc)
    session.add(auth_session)
    session.add(user)
    session.commit()
    session.refresh(auth_session)
    session.refresh(user)
    return token, auth_session


def find_user_by_login(
    session: Session, identifier: str, tenant_id: str | None = None
) -> User | None:
    normalized = identifier.strip().lower()
    statement = select(User).where(
        or_(User.email == normalized, User.username == normalized),
        User.is_active == True,  # noqa: E712
    )
    if tenant_id:
        statement = statement.where(User.tenant_id == tenant_id)
    return session.exec(statement).first()
