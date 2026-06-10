"""Comment ORM model — a pinned comment on a review (CLAUDE.md Section 7).

Implements the hybrid pin-coordinate system (selector + percent + absolute +
screenshot) described in Section 9. A comment is authored either by a designer
(``author_user_id``) or a guest (``author_guest_id``), and may be a reply to
another comment (``parent_id``).
"""

from __future__ import annotations

import uuid
from typing import TYPE_CHECKING

from sqlalchemy import Float, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base, SoftDeleteMixin, TimestampMixin, UUIDMixin

if TYPE_CHECKING:
    from app.models.guest import GuestSession
    from app.models.review import Review
    from app.models.user import User


class Comment(UUIDMixin, TimestampMixin, SoftDeleteMixin, Base):
    __tablename__ = "comments"

    review_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("reviews.id"),
        nullable=False,
        index=True,
    )
    parent_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("comments.id"),
        nullable=True,
        index=True,
    )  # NULL = top-level; set = reply
    author_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id"),
        nullable=True,
        index=True,
    )  # set if a designer commented
    author_guest_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("guest_sessions.id"),
        nullable=True,
        index=True,
    )  # set if a client (guest) commented

    body: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(
        String(50), nullable=False, server_default="open"
    )  # 'open' | 'in_progress' | 'resolved'
    page_url: Mapped[str] = mapped_column(Text, nullable=False)

    # Pin coordinates (hybrid system)
    pin_x_percent: Mapped[float | None] = mapped_column(Float, nullable=True)
    pin_y_percent: Mapped[float | None] = mapped_column(Float, nullable=True)
    element_selector: Mapped[str | None] = mapped_column(Text, nullable=True)
    viewport_width: Mapped[int | None] = mapped_column(Integer, nullable=True)
    viewport_height: Mapped[int | None] = mapped_column(Integer, nullable=True)
    pin_x_absolute: Mapped[int | None] = mapped_column(Integer, nullable=True)
    pin_y_absolute: Mapped[int | None] = mapped_column(Integer, nullable=True)
    screenshot_url: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Client metadata (for developers)
    browser_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    browser_version: Mapped[str | None] = mapped_column(String(50), nullable=True)
    os_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    screen_width: Mapped[int | None] = mapped_column(Integer, nullable=True)
    screen_height: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # Relationships
    review: Mapped["Review"] = relationship(back_populates="comments")
    author_user: Mapped["User | None"] = relationship(back_populates="comments")
    author_guest: Mapped["GuestSession | None"] = relationship(
        back_populates="comments"
    )
    parent: Mapped["Comment | None"] = relationship(
        back_populates="replies", remote_side="Comment.id"
    )
    replies: Mapped[list["Comment"]] = relationship(back_populates="parent")
