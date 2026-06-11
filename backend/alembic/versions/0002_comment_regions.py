"""add region-selection dimensions to comments

Adds the four nullable region columns for drag-to-select comments. Point
comments leave all four NULL, so existing rows need no backfill and the
change is fully backward compatible (old API payloads simply never set them).

Revision ID: 0002_comment_regions
Revises: 0001_initial
Create Date: 2026-06-11

"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0002_comment_regions"
down_revision: str | None = "0001_initial"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("comments", sa.Column("region_width", sa.Float(), nullable=True))
    op.add_column("comments", sa.Column("region_height", sa.Float(), nullable=True))
    op.add_column(
        "comments", sa.Column("region_width_percent", sa.Float(), nullable=True)
    )
    op.add_column(
        "comments", sa.Column("region_height_percent", sa.Float(), nullable=True)
    )


def downgrade() -> None:
    op.drop_column("comments", "region_height_percent")
    op.drop_column("comments", "region_width_percent")
    op.drop_column("comments", "region_height")
    op.drop_column("comments", "region_width")
