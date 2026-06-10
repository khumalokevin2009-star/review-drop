"""Authentication routes (CLAUDE.md Section 8 — Auth).

Endpoints: register, login, refresh, forgot-password, reset-password, and /me.
All are rate-limited to 10 req/min per IP (Section 13). Passwords are bcrypt
hashed; tokens are JWTs signed with the app secret.

Note: no ``from __future__ import annotations`` here — slowapi's ``@limiter.limit``
wraps each route and would otherwise leave FastAPI resolving stringized
annotations against slowapi's module globals instead of this one.
"""

import logging

from fastapi import APIRouter, Depends, HTTPException, Request, status
from jose import JWTError
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_db, limiter
from app.core import security
from app.core.config import settings
from app.models.user import User
from app.schemas.user import UserCreate, UserRead

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["auth"])

_AUTH_RATE_LIMIT = "10/minute"  # per IP (Section 13)


# --- Request/response models for the auth flows -----------------------------


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenPair(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class AccessToken(BaseModel):
    access_token: str
    token_type: str = "bearer"


class RefreshRequest(BaseModel):
    refresh_token: str


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str = Field(min_length=8, max_length=72)


class MessageResponse(BaseModel):
    message: str


# --- Helpers ----------------------------------------------------------------


async def _get_user_by_email(db: AsyncSession, email: str) -> User | None:
    result = await db.execute(select(User).where(User.email == email.lower()))
    return result.scalar_one_or_none()


# --- Routes -----------------------------------------------------------------


@router.post(
    "/register", response_model=UserRead, status_code=status.HTTP_201_CREATED
)
@limiter.limit(_AUTH_RATE_LIMIT)
async def register(
    request: Request,
    data: UserCreate,
    db: AsyncSession = Depends(get_db),
) -> User:
    if await _get_user_by_email(db, data.email):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Email already registered",
        )

    user = User(
        email=data.email.lower(),
        full_name=data.full_name,
        hashed_password=security.hash_password(data.password),
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


@router.post("/login", response_model=TokenPair)
@limiter.limit(_AUTH_RATE_LIMIT)
async def login(
    request: Request,
    data: LoginRequest,
    db: AsyncSession = Depends(get_db),
) -> TokenPair:
    user = await _get_user_by_email(db, data.email)
    # Same generic error whether the email is unknown or the password is wrong,
    # so we don't leak which emails are registered.
    if (
        user is None
        or user.deleted_at is not None
        or not security.verify_password(data.password, user.hashed_password)
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
        )
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Account is inactive"
        )

    return TokenPair(
        access_token=security.create_access_token(user.id),
        refresh_token=security.create_refresh_token(user.id),
    )


@router.post("/refresh", response_model=AccessToken)
@limiter.limit(_AUTH_RATE_LIMIT)
async def refresh(
    request: Request,
    data: RefreshRequest,
    db: AsyncSession = Depends(get_db),
) -> AccessToken:
    invalid = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token"
    )
    try:
        payload = security.decode_token(
            data.refresh_token, expected_type=security.REFRESH_TOKEN_TYPE
        )
    except JWTError:
        raise invalid

    subject = payload.get("sub")
    if not subject:
        raise invalid

    result = await db.execute(select(User).where(User.id == subject))
    user = result.scalar_one_or_none()
    if user is None or user.deleted_at is not None or not user.is_active:
        raise invalid

    return AccessToken(access_token=security.create_access_token(user.id))


@router.post("/forgot-password", response_model=MessageResponse)
@limiter.limit(_AUTH_RATE_LIMIT)
async def forgot_password(
    request: Request,
    data: ForgotPasswordRequest,
    db: AsyncSession = Depends(get_db),
) -> MessageResponse:
    user = await _get_user_by_email(db, data.email)
    if user is not None and user.deleted_at is None:
        token = security.create_password_reset_token(user.email)
        # The Email agent (Section 11) sends the reset link via Resend. Until
        # that's wired up, log the token in non-production for manual testing.
        if settings.APP_ENV != "production":
            logger.info("Password reset token for %s: %s", user.email, token)

    # Always return the same response so we don't reveal whether the email exists.
    return MessageResponse(
        message="If an account exists for that email, a reset link has been sent."
    )


@router.post("/reset-password", response_model=MessageResponse)
@limiter.limit(_AUTH_RATE_LIMIT)
async def reset_password(
    request: Request,
    data: ResetPasswordRequest,
    db: AsyncSession = Depends(get_db),
) -> MessageResponse:
    invalid = HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail="Invalid or expired reset token",
    )
    try:
        payload = security.decode_token(
            data.token, expected_type=security.RESET_TOKEN_TYPE
        )
    except JWTError:
        raise invalid

    email = payload.get("sub")
    if not email:
        raise invalid

    user = await _get_user_by_email(db, email)
    if user is None or user.deleted_at is not None:
        raise invalid

    user.hashed_password = security.hash_password(data.new_password)
    await db.commit()
    return MessageResponse(message="Your password has been reset.")


@router.get("/me", response_model=UserRead)
async def me(current_user: User = Depends(get_current_user)) -> User:
    return current_user
