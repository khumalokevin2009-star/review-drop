"""Application configuration.

All config is loaded from environment variables (or a local `.env` file) via
Pydantic Settings. Never hardcode secrets — see CLAUDE.md Section 15.
"""

from __future__ import annotations

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore",
    )

    # App
    APP_NAME: str = "ReviewDrop"
    APP_ENV: str = "development"  # development | staging | production
    FRONTEND_URL: str = "http://localhost:5173"
    BACKEND_URL: str = "http://localhost:8000"

    # Database
    DATABASE_URL: str = (
        "postgresql+asyncpg://reviewdrop:reviewdrop@localhost:5432/reviewdrop"
    )

    # Auth
    JWT_SECRET: str = "change-me-in-production"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # Cloudflare R2 (optional until screenshots/storage are wired up)
    R2_ACCOUNT_ID: str | None = None
    R2_ACCESS_KEY_ID: str | None = None
    R2_SECRET_ACCESS_KEY: str | None = None
    R2_BUCKET_NAME: str = "reviewdrop-screenshots"
    R2_PUBLIC_URL: str | None = None

    # Stripe (optional until billing is wired up)
    STRIPE_SECRET_KEY: str | None = None
    STRIPE_WEBHOOK_SECRET: str | None = None
    STRIPE_PRO_MONTHLY_PRICE_ID: str | None = None
    STRIPE_PRO_ANNUAL_PRICE_ID: str | None = None
    STRIPE_STUDIO_MONTHLY_PRICE_ID: str | None = None
    STRIPE_STUDIO_ANNUAL_PRICE_ID: str | None = None

    # Resend (optional until email is wired up)
    RESEND_API_KEY: str | None = None
    EMAIL_FROM: str = "hello@reviewdrop.io"

    # Sentry (optional)
    SENTRY_DSN: str | None = None


settings = Settings()
