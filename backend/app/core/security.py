"""Security helpers: JWT creation/verification and password hashing.

See CLAUDE.md Section 5 (Auth stack — JWT via python-jose, bcrypt via passlib)
and Section 13 (Security checklist). Secrets are read from settings, never
hardcoded.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

from jose import JWTError, jwt
from passlib.context import CryptContext

from app.core.config import settings

# bcrypt for password hashing. Passwords are never stored in plaintext.
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# JWT token type markers (carried in the "type" claim) so an access token can
# never be replayed where a refresh/reset token is expected, and vice versa.
ACCESS_TOKEN_TYPE = "access"
REFRESH_TOKEN_TYPE = "refresh"
RESET_TOKEN_TYPE = "reset"

# Password reset links are short-lived.
PASSWORD_RESET_EXPIRE_MINUTES = 60


# --- Passwords --------------------------------------------------------------


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


# --- JWT --------------------------------------------------------------------


def _create_token(subject: Any, token_type: str, expires_delta: timedelta) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(subject),
        "type": token_type,
        "iat": now,
        "exp": now + expires_delta,
    }
    return jwt.encode(
        payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM
    )


def create_access_token(subject: Any) -> str:
    return _create_token(
        subject,
        ACCESS_TOKEN_TYPE,
        timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES),
    )


def create_refresh_token(subject: Any) -> str:
    return _create_token(
        subject,
        REFRESH_TOKEN_TYPE,
        timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS),
    )


def create_password_reset_token(email: str) -> str:
    return _create_token(
        email,
        RESET_TOKEN_TYPE,
        timedelta(minutes=PASSWORD_RESET_EXPIRE_MINUTES),
    )


def decode_token(token: str, expected_type: str | None = None) -> dict[str, Any]:
    """Decode and verify a JWT. Raises ``jose.JWTError`` (incl. on expiry or a
    token-type mismatch); callers translate that into a 401/400."""
    payload = jwt.decode(
        token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM]
    )
    if expected_type is not None and payload.get("type") != expected_type:
        raise JWTError(
            f"Invalid token type: expected '{expected_type}', "
            f"got '{payload.get('type')}'"
        )
    return payload
