"""Review ORM model — a shareable review link (CLAUDE.md Section 7: reviews).

Note: reviews have no ``deleted_at`` per the schema — they are deactivated via
``is_active`` / ``expires_at`` rather than soft-deleted.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import TIMESTAMP, Boolean, ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base, TimestampMixin, UUIDMixin

if TYPE_CHECKING:
    from app.models.comment import Comment
    from app.models.guest import GuestSession
    from app.models.project import Project


class Review(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "reviews"

    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("projects.id"),
        nullable=False,
        index=True,
    )
    slug: Mapped[str] = mapped_column(
        String(12), unique=True, index=True, nullable=False
    )  # random string for the public share URL
    name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    is_active: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default="true"
    )
    expires_at: Mapped[datetime | None] = mapped_column(
        TIMESTAMP(timezone=True), nullable=True
    )

    # Relationships
    project: Mapped["Project"] = relationship(back_populates="reviews")
    guest_sessions: Mapped[list["GuestSession"]] = relationship(
        back_populates="review", cascade="all, delete-orphan"
    )
    comments: Mapped[list["Comment"]] = relationship(
        back_populates="review", cascade="all, delete-orphan"
    )
