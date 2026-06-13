"""add new-comment email batching fields to reviews

Adds ``last_notified_at`` (nullable) and ``pending_comment_count`` (NOT NULL,
default 0) to ``reviews``. These back the debounce/coalesce batching for the
designer's new-comment notification emails (CLAUDE.md Section 11). Existing rows
backfill to NULL / 0 via the server default, so the change is fully backward
compatible and needs no manual backfill.

Revision ID: 0003_review_notifications
Revises: 0002_comment_regions
Create Date: 2026-06-13

"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0003_review_notifications"
down_revision: str | None = "0002_comment_regions"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "reviews",
        sa.Column("last_notified_at", sa.TIMESTAMP(timezone=True), nullable=True),
    )
    op.add_column(
        "reviews",
        sa.Column(
            "pending_comment_count",
            sa.Integer(),
            nullable=False,
            server_default="0",
        ),
    )


def downgrade() -> None:
    op.drop_column("reviews", "pending_comment_count")
    op.drop_column("reviews", "last_notified_at")
