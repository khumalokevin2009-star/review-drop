"""User Pydantic schemas (CLAUDE.md Section 8). Never expose hashed_password."""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field

# bcrypt only considers the first 72 bytes of a password, so cap input there to
# avoid silent truncation surprises.
_PASSWORD = Field(min_length=8, max_length=72)


class UserBase(BaseModel):
    email: EmailStr
    full_name: str | None = None


class UserCreate(UserBase):
    password: str = _PASSWORD


class UserRead(UserBase):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    plan: str
    # 'password' | 'google' — how the account signs in (lets the UI hide the
    # password-change card for OAuth-only users, show "Signed in with Google").
    auth_provider: str
    # Billing state (CLAUDE.md Section 12). Surfaced so the UI can show
    # "Pro — trial ends 14 Jul" etc. Never exposes Stripe secret identifiers.
    subscription_status: str | None = None
    current_period_end: datetime | None = None
    is_active: bool
    created_at: datetime


class UserUpdate(BaseModel):
    email: EmailStr | None = None
    full_name: str | None = None
    password: str | None = Field(default=None, min_length=8, max_length=72)
