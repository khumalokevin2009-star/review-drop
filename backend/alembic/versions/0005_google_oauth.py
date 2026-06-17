"""add Google OAuth identity fields to users

Supports Google sign-in/sign-up alongside email+password (CLAUDE.md Sections 5,
8, 13):

* ``auth_provider`` — 'password' | 'google'; how the account was created.
  NOT NULL with a server default of 'password', so every existing row backfills
  to 'password' automatically.
* ``google_sub`` — Google's stable subject id, set when a Google identity is
  linked. UNIQUE (a Google account maps to at most one user); nullable, so
  password-only users keep NULL (Postgres allows many NULLs under a unique
  index).
* ``hashed_password`` becomes NULLABLE — OAuth-only users have no password.

Revision ID: 0005_google_oauth
Revises: 0004_billing_fields
Create Date: 2026-06-17

"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0005_google_oauth"
down_revision: str | None = "0004_billing_fields"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column(
            "auth_provider",
            sa.String(length=50),
            nullable=False,
            server_default="password",
        ),
    )
    op.add_column(
        "users",
        sa.Column("google_sub", sa.String(length=255), nullable=True),
    )
    op.create_index("ix_users_google_sub", "users", ["google_sub"], unique=True)
    # OAuth-only users have no password.
    op.alter_column(
        "users", "hashed_password", existing_type=sa.String(length=255), nullable=True
    )


def downgrade() -> None:
    op.alter_column(
        "users", "hashed_password", existing_type=sa.String(length=255), nullable=False
    )
    op.drop_index("ix_users_google_sub", table_name="users")
    op.drop_column("users", "google_sub")
    op.drop_column("users", "auth_provider")
