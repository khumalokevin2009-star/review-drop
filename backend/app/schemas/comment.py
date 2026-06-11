"""Comment Pydantic schemas (CLAUDE.md Sections 7, 8, 9).

Covers the hybrid pin-coordinate system (selector + percent + absolute) plus
the developer-facing client metadata. ``CommentRead`` is assembled in the route
layer so it can carry derived fields (author_name/type and the per-guest
``is_mine`` flag) that aren't columns on the model.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from enum import Enum
from urllib.parse import urlparse

from pydantic import BaseModel, ConfigDict, Field, field_validator


class CommentStatus(str, Enum):
    open = "open"
    in_progress = "in_progress"
    resolved = "resolved"


def _validate_http_url(value: str) -> str:
    candidate = value.strip()
    parsed = urlparse(candidate)
    if parsed.scheme not in ("http", "https") or not parsed.netloc:
        raise ValueError("page_url must be a valid http(s) URL")
    return candidate


class CommentCreate(BaseModel):
    """A guest-authored, top-level pinned comment. The author and review are
    derived from the guest token + slug; status defaults to open; screenshot_url
    is filled in later by the screenshot service."""

    body: str = Field(min_length=1)
    page_url: str = Field(max_length=2048)

    # Pin coordinates (hybrid system — all optional; a page-level note may omit them).
    pin_x_percent: float | None = Field(default=None, ge=0, le=100)
    pin_y_percent: float | None = Field(default=None, ge=0, le=100)
    element_selector: str | None = None
    viewport_width: int | None = Field(default=None, ge=0)
    viewport_height: int | None = Field(default=None, ge=0)
    pin_x_absolute: int | None = Field(default=None, ge=0)
    pin_y_absolute: int | None = Field(default=None, ge=0)

    # Region selection (drag-to-select); all four stay None for point comments.
    # The pin coordinates are the region's top-left anchor. Percent dims are
    # relative to the anchor element and may exceed 100 (region larger than
    # the element), so only the lower bound is enforced.
    region_width: float | None = Field(default=None, ge=0)
    region_height: float | None = Field(default=None, ge=0)
    region_width_percent: float | None = Field(default=None, ge=0)
    region_height_percent: float | None = Field(default=None, ge=0)

    # Client metadata (for developers).
    browser_name: str | None = Field(default=None, max_length=100)
    browser_version: str | None = Field(default=None, max_length=50)
    os_name: str | None = Field(default=None, max_length=100)
    screen_width: int | None = Field(default=None, ge=0)
    screen_height: int | None = Field(default=None, ge=0)

    @field_validator("page_url")
    @classmethod
    def _check_page_url(cls, value: str) -> str:
        return _validate_http_url(value)


class CommentReply(BaseModel):
    body: str = Field(min_length=1)


class CommentStatusUpdate(BaseModel):
    status: CommentStatus


class CommentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    review_id: uuid.UUID
    parent_id: uuid.UUID | None

    author_user_id: uuid.UUID | None
    author_guest_id: uuid.UUID | None
    author_name: str | None = None
    author_type: str | None = None  # 'designer' | 'guest'
    # Set only in the guest context: True for comments the requesting guest wrote.
    is_mine: bool | None = None

    body: str
    status: str
    page_url: str

    pin_x_percent: float | None
    pin_y_percent: float | None
    element_selector: str | None
    viewport_width: int | None
    viewport_height: int | None
    pin_x_absolute: int | None
    pin_y_absolute: int | None
    screenshot_url: str | None

    region_width: float | None
    region_height: float | None
    region_width_percent: float | None
    region_height_percent: float | None

    browser_name: str | None
    browser_version: str | None
    os_name: str | None
    screen_width: int | None
    screen_height: int | None

    created_at: datetime
    updated_at: datetime
