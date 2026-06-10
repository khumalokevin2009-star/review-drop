"""Project ORM model — a website under review (CLAUDE.md Section 7: projects)."""

from __future__ import annotations

import uuid
from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base, SoftDeleteMixin, TimestampMixin, UUIDMixin

if TYPE_CHECKING:
    from app.models.review import Review
    from app.models.user import User


class Project(UUIDMixin, TimestampMixin, SoftDeleteMixin, Base):
    __tablename__ = "projects"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    client_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    url: Mapped[str] = mapped_column(Text, nullable=False)  # staging URL under review
    thumbnail_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(
        String(50), nullable=False, server_default="active"
    )  # 'active' | 'archived'

    # Relationships
    user: Mapped["User"] = relationship(back_populates="projects")
    reviews: Mapped[list["Review"]] = relationship(
        back_populates="project", cascade="all, delete-orphan"
    )
