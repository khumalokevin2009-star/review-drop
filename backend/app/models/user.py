"""User ORM model — the paying designer (CLAUDE.md Section 7: users)."""

from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import TIMESTAMP, Boolean, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base, SoftDeleteMixin, TimestampMixin, UUIDMixin

if TYPE_CHECKING:
    from app.models.comment import Comment
    from app.models.project import Project


class User(UUIDMixin, TimestampMixin, SoftDeleteMixin, Base):
    __tablename__ = "users"

    email: Mapped[str] = mapped_column(
        String(255), unique=True, index=True, nullable=False
    )
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    full_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    # `plan` is DERIVED from Stripe subscription state by the billing webhook
    # (services/billing_service.plan_for_status) — never set it manually. The
    # plan-limit checks (projects/reviews/export/watermark) read this field, so a
    # trialing/active subscriber is 'pro' and a past_due/ended one is 'free'.
    plan: Mapped[str] = mapped_column(
        String(50), nullable=False, server_default="free"
    )  # 'free' | 'pro' | 'studio'
    stripe_customer_id: Mapped[str | None] = mapped_column(
        String(255), nullable=True, index=True  # webhooks look users up by this
    )
    stripe_subscription_id: Mapped[str | None] = mapped_column(
        String(255), nullable=True
    )
    # Raw Stripe subscription status mirror: 'trialing' | 'active' | 'past_due'
    # | 'canceled' | None. `plan` is the access-control projection of this.
    subscription_status: Mapped[str | None] = mapped_column(String(50), nullable=True)
    # When the current paid/trial period ends — a cancelled sub keeps Pro until
    # this moment, then drops to free.
    current_period_end: Mapped[datetime | None] = mapped_column(
        TIMESTAMP(timezone=True), nullable=True
    )
    is_active: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default="true"
    )

    # Relationships
    projects: Mapped[list["Project"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )
    comments: Mapped[list["Comment"]] = relationship(back_populates="author_user")
