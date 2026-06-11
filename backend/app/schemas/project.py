"""Project Pydantic schemas (CLAUDE.md Sections 7, 8).

ProjectRead intentionally omits ``user_id`` and ``deleted_at``: the owner is
always the current user, and the same schema is reused for the public guest
canvas, where the owner's id must not leak.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Literal
from urllib.parse import urlparse

from pydantic import BaseModel, ConfigDict, Field, field_validator


def _validate_http_url(value: str) -> str:
    candidate = value.strip()
    parsed = urlparse(candidate)
    if parsed.scheme not in ("http", "https") or not parsed.netloc:
        raise ValueError("url must be a valid http(s) URL")
    return candidate


class ProjectCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    url: str = Field(max_length=2048)
    client_name: str | None = Field(default=None, max_length=255)

    @field_validator("url")
    @classmethod
    def _check_url(cls, value: str) -> str:
        return _validate_http_url(value)


class ProjectUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    url: str | None = Field(default=None, max_length=2048)
    client_name: str | None = Field(default=None, max_length=255)
    status: Literal["active", "archived"] | None = None

    @field_validator("url")
    @classmethod
    def _check_url(cls, value: str | None) -> str | None:
        return None if value is None else _validate_http_url(value)


class ProjectRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    client_name: str | None
    url: str
    thumbnail_url: str | None
    status: str
    created_at: datetime
    updated_at: datetime
