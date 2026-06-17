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
    APP_NAME: str = "Orvelle"
    APP_ENV: str = "development"  # development | staging | production
    FRONTEND_URL: str = "http://localhost:5173"
    BACKEND_URL: str = "http://localhost:8000"

    # Database
    # Note: the `reviewdrop` role/db identifiers are legacy by design — kept to
    # avoid breaking existing local volumes and managed instances on the rebrand.
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
    R2_BUCKET_NAME: str = "orvelle-screenshots"
    R2_PUBLIC_URL: str | None = None

    # Stripe (TEST MODE — billing). Keys come from backend/.env; never hardcode.
    # When STRIPE_SECRET_KEY is unset the billing endpoints return a clean 503 so
    # local dev without keys doesn't crash (see routes/billing.py).
    STRIPE_SECRET_KEY: str | None = None
    STRIPE_PUBLISHABLE_KEY: str | None = None
    STRIPE_WEBHOOK_SECRET: str | None = None
    STRIPE_PRO_MONTHLY_PRICE_ID: str | None = None
    # Launching with Free + Pro only — the annual/Studio price slots stay
    # nullable and unused for now (Studio = "Coming soon" in the UI).
    STRIPE_PRO_ANNUAL_PRICE_ID: str | None = None
    STRIPE_STUDIO_MONTHLY_PRICE_ID: str | None = None
    STRIPE_STUDIO_ANNUAL_PRICE_ID: str | None = None
    # Days of free trial granted on the Pro Checkout (card collected upfront,
    # charged after the trial unless cancelled).
    STRIPE_TRIAL_PERIOD_DAYS: int = 30

    # Google OAuth (sign-in / sign-up — OIDC authorization-code flow).
    # Secrets come from backend/.env; never hardcode. When CLIENT_ID/SECRET are
    # unset the /auth/google/* endpoints return a clean 503. The redirect URI
    # defaults to BACKEND_URL + the callback path and must match a URI
    # registered in the Google console (dev: http://localhost:8000/..., prod:
    # https://orvellehq.com/...).
    GOOGLE_CLIENT_ID: str | None = None
    GOOGLE_CLIENT_SECRET: str | None = None
    GOOGLE_REDIRECT_URI: str | None = None

    # Resend (transactional email — CLAUDE.md Section 11)
    RESEND_API_KEY: str | None = None
    EMAIL_FROM: str = "Orvelle <hello@orvellehq.com>"
    # Global kill-switch: when false (or RESEND_API_KEY unset) the email service
    # no-ops gracefully so dev/tests never send real mail.
    EMAIL_ENABLED: bool = True
    # Debounce window for new-comment notifications: a burst of client comments
    # on one review collapses into a single email per this many minutes.
    EMAIL_BATCH_WINDOW_MINUTES: int = 5

    # Sentry (optional)
    SENTRY_DSN: str | None = None


settings = Settings()
