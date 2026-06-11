"""Review + guest-session Pydantic schemas (CLAUDE.md Sections 7, 8, 9).

ReviewRead exposes a computed ``share_url`` (the public, slug-based link the
designer copies — never an internal UUID). Guest-session schemas live here
since the public review routes own the guest-onboarding flow.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from pydantic import (
    BaseModel,
    ConfigDict,
    EmailStr,
    Field,
    computed_field,
    field_validator,
)

from app.core.config import settings
from app.schemas.project import ProjectRead


def _ensure_utc(value: datetime | None) -> datetime | None:
    """Treat a naive expiry as UTC so it compares correctly against now()."""
    if value is not None and value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value


class ReviewCreate(BaseModel):
    name: str | None = Field(default=None, max_length=255)
    expires_at: datetime | None = None

    @field_validator("expires_at")
    @classmethod
    def _utc(cls, value: datetime | None) -> datetime | None:
        return _ensure_utc(value)


class ReviewUpdate(BaseModel):
    name: str | None = Field(default=None, max_length=255)
    is_active: bool | None = None
    expires_at: datetime | None = None

    @field_validator("expires_at")
    @classmethod
    def _utc(cls, value: datetime | None) -> datetime | None:
        return _ensure_utc(value)


class ReviewRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    project_id: uuid.UUID
    slug: str
    name: str | None
    is_active: bool
    expires_at: datetime | None
    created_at: datetime
    updated_at: datetime

    @computed_field  # type: ignore[prop-decorator]
    @property
    def share_url(self) -> str:
        return f"{settings.FRONTEND_URL}/r/{self.slug}"


class GuestCanvasData(BaseModel):
    """Public payload for the guest canvas: the review plus its project."""

    review: ReviewRead
    project: ProjectRead


class GuestSessionCreate(BaseModel):
    display_name: str = Field(min_length=1, max_length=255)
    email: EmailStr | None = None


class GuestSessionTokenRead(BaseModel):
    session_token: str
