"""add Stripe billing fields to users

Adds the subscription-tracking columns that the Stripe billing webhook syncs
(CLAUDE.md Section 12): ``subscription_status`` (raw Stripe status mirror) and
``current_period_end`` (when the paid/trial period ends). Also indexes
``stripe_customer_id`` because every webhook resolves the user by customer id.

``plan``, ``stripe_customer_id`` and ``stripe_subscription_id`` already exist from
the initial schema. All new columns are nullable, so existing rows backfill to
NULL with no manual migration needed.

Revision ID: 0004_billing_fields
Revises: 0003_review_notifications
Create Date: 2026-06-14

"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0004_billing_fields"
down_revision: str | None = "0003_review_notifications"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("subscription_status", sa.String(length=50), nullable=True),
    )
    op.add_column(
        "users",
        sa.Column(
            "current_period_end", sa.TIMESTAMP(timezone=True), nullable=True
        ),
    )
    op.create_index(
        "ix_users_stripe_customer_id",
        "users",
        ["stripe_customer_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_users_stripe_customer_id", table_name="users")
    op.drop_column("users", "current_period_end")
    op.drop_column("users", "subscription_status")
