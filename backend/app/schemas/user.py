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
    is_active: bool
    created_at: datetime


class UserUpdate(BaseModel):
    email: EmailStr | None = None
    full_name: str | None = None
    password: str | None = Field(default=None, min_length=8, max_length=72)
