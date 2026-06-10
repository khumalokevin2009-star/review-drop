"""FastAPI dependencies and the shared rate limiter.

Provides the async DB session, the current-user dependency (JWT-authenticated),
and a SlowAPI limiter keyed by client IP (CLAUDE.md Section 13: auth endpoints
rate-limited to 10 req/min per IP).
"""

from __future__ import annotations

import uuid
from collections.abc import AsyncGenerator

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError
from slowapi import Limiter
from slowapi.util import get_remote_address
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import security
from app.core.database import AsyncSessionLocal
from app.models.user import User

# Shared limiter — wired into the app in main.py, used to decorate routes.
limiter = Limiter(key_func=get_remote_address)

# Bearer-token scheme (we use JSON login, not OAuth2 form, so HTTPBearer fits).
bearer_scheme = HTTPBearer(auto_error=True)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """Yield an async DB session, ensuring it is closed after the request."""
    async with AsyncSessionLocal() as session:
        yield session


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    """Resolve the authenticated user from a Bearer access token.

    Rejects missing/invalid/expired tokens, wrong token types, unknown users,
    and soft-deleted or deactivated accounts.
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    try:
        payload = security.decode_token(
            credentials.credentials, expected_type=security.ACCESS_TOKEN_TYPE
        )
    except JWTError:
        raise credentials_exception

    subject = payload.get("sub")
    if not subject:
        raise credentials_exception
    try:
        user_id = uuid.UUID(str(subject))
    except (ValueError, TypeError):
        raise credentials_exception

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None or user.deleted_at is not None or not user.is_active:
        raise credentials_exception

    return user
