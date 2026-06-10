"""initial schema: users, projects, reviews, guest_sessions, comments

Revision ID: 0001_initial
Revises:
Create Date: 2026-06-10

"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0001_initial"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # --- users --------------------------------------------------------------
    op.create_table(
        "users",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("hashed_password", sa.String(length=255), nullable=False),
        sa.Column("full_name", sa.String(length=255), nullable=True),
        sa.Column(
            "plan", sa.String(length=50), server_default="free", nullable=False
        ),
        sa.Column("stripe_customer_id", sa.String(length=255), nullable=True),
        sa.Column("stripe_subscription_id", sa.String(length=255), nullable=True),
        sa.Column(
            "is_active", sa.Boolean(), server_default="true", nullable=False
        ),
        sa.Column(
            "created_at",
            sa.TIMESTAMP(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.TIMESTAMP(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("deleted_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id", name="pk_users"),
    )
    op.create_index("ix_users_email", "users", ["email"], unique=True)

    # --- projects -----------------------------------------------------------
    op.create_table(
        "projects",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("client_name", sa.String(length=255), nullable=True),
        sa.Column("url", sa.Text(), nullable=False),
        sa.Column("thumbnail_url", sa.Text(), nullable=True),
        sa.Column(
            "status", sa.String(length=50), server_default="active", nullable=False
        ),
        sa.Column(
            "created_at",
            sa.TIMESTAMP(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.TIMESTAMP(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("deleted_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"], name="fk_projects_user_id_users"
        ),
        sa.PrimaryKeyConstraint("id", name="pk_projects"),
    )
    op.create_index("ix_projects_user_id", "projects", ["user_id"], unique=False)

    # --- reviews ------------------------------------------------------------
    op.create_table(
        "reviews",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("project_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("slug", sa.String(length=12), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=True),
        sa.Column(
            "is_active", sa.Boolean(), server_default="true", nullable=False
        ),
        sa.Column("expires_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.TIMESTAMP(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.TIMESTAMP(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["project_id"], ["projects.id"], name="fk_reviews_project_id_projects"
        ),
        sa.PrimaryKeyConstraint("id", name="pk_reviews"),
    )
    op.create_index("ix_reviews_slug", "reviews", ["slug"], unique=True)
    op.create_index(
        "ix_reviews_project_id", "reviews", ["project_id"], unique=False
    )

    # --- guest_sessions -----------------------------------------------------
    op.create_table(
        "guest_sessions",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("review_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("display_name", sa.String(length=255), nullable=False),
        sa.Column("email", sa.String(length=255), nullable=True),
        sa.Column("session_token", sa.String(length=255), nullable=False),
        sa.Column(
            "created_at",
            sa.TIMESTAMP(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["review_id"],
            ["reviews.id"],
            name="fk_guest_sessions_review_id_reviews",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_guest_sessions"),
    )
    op.create_index(
        "ix_guest_sessions_review_id",
        "guest_sessions",
        ["review_id"],
        unique=False,
    )
    op.create_index(
        "ix_guest_sessions_session_token",
        "guest_sessions",
        ["session_token"],
        unique=True,
    )

    # --- comments -----------------------------------------------------------
    op.create_table(
        "comments",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("review_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("parent_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("author_user_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("author_guest_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column(
            "status", sa.String(length=50), server_default="open", nullable=False
        ),
        sa.Column("page_url", sa.Text(), nullable=False),
        sa.Column("pin_x_percent", sa.Float(), nullable=True),
        sa.Column("pin_y_percent", sa.Float(), nullable=True),
        sa.Column("element_selector", sa.Text(), nullable=True),
        sa.Column("viewport_width", sa.Integer(), nullable=True),
        sa.Column("viewport_height", sa.Integer(), nullable=True),
        sa.Column("pin_x_absolute", sa.Integer(), nullable=True),
        sa.Column("pin_y_absolute", sa.Integer(), nullable=True),
        sa.Column("screenshot_url", sa.Text(), nullable=True),
        sa.Column("browser_name", sa.String(length=100), nullable=True),
        sa.Column("browser_version", sa.String(length=50), nullable=True),
        sa.Column("os_name", sa.String(length=100), nullable=True),
        sa.Column("screen_width", sa.Integer(), nullable=True),
        sa.Column("screen_height", sa.Integer(), nullable=True),
        sa.Column(
            "created_at",
            sa.TIMESTAMP(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.TIMESTAMP(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("deleted_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(
            ["review_id"], ["reviews.id"], name="fk_comments_review_id_reviews"
        ),
        sa.ForeignKeyConstraint(
            ["parent_id"], ["comments.id"], name="fk_comments_parent_id_comments"
        ),
        sa.ForeignKeyConstraint(
            ["author_user_id"], ["users.id"], name="fk_comments_author_user_id_users"
        ),
        sa.ForeignKeyConstraint(
            ["author_guest_id"],
            ["guest_sessions.id"],
            name="fk_comments_author_guest_id_guest_sessions",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_comments"),
    )
    op.create_index("ix_comments_review_id", "comments", ["review_id"], unique=False)
    op.create_index("ix_comments_parent_id", "comments", ["parent_id"], unique=False)
    op.create_index(
        "ix_comments_author_user_id", "comments", ["author_user_id"], unique=False
    )
    op.create_index(
        "ix_comments_author_guest_id", "comments", ["author_guest_id"], unique=False
    )


def downgrade() -> None:
    op.drop_index("ix_comments_author_guest_id", table_name="comments")
    op.drop_index("ix_comments_author_user_id", table_name="comments")
    op.drop_index("ix_comments_parent_id", table_name="comments")
    op.drop_index("ix_comments_review_id", table_name="comments")
    op.drop_table("comments")

    op.drop_index("ix_guest_sessions_session_token", table_name="guest_sessions")
    op.drop_index("ix_guest_sessions_review_id", table_name="guest_sessions")
    op.drop_table("guest_sessions")

    op.drop_index("ix_reviews_project_id", table_name="reviews")
    op.drop_index("ix_reviews_slug", table_name="reviews")
    op.drop_table("reviews")

    op.drop_index("ix_projects_user_id", table_name="projects")
    op.drop_table("projects")

    op.drop_index("ix_users_email", table_name="users")
    op.drop_table("users")
