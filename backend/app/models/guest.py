"""GuestSession ORM model — an anonymous client commenter (no account).

See CLAUDE.md Section 7 (guest_sessions) and Section 9 (guest session rules).
Note: only ``created_at`` per the schema — no ``updated_at`` / ``deleted_at``.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import TIMESTAMP, ForeignKey, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base, UUIDMixin

if TYPE_CHECKING:
    from app.models.comment import Comment
    from app.models.review import Review


class GuestSession(UUIDMixin, Base):
    __tablename__ = "guest_sessions"

    review_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("reviews.id"),
        nullable=False,
        index=True,
    )
    display_name: Mapped[str] = mapped_column(String(255), nullable=False)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    session_token: Mapped[str] = mapped_column(
        String(255), unique=True, index=True, nullable=False
    )  # secrets.token_hex(16), stored in client localStorage
    created_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), nullable=False, server_default=func.now()
    )

    # Relationships
    review: Mapped["Review"] = relationship(back_populates="guest_sessions")
    comments: Mapped[list["Comment"]] = relationship(back_populates="author_guest")
