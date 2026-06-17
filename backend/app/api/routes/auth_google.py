"""Google OAuth sign-in / sign-up routes (CLAUDE.md Sections 5, 8, 13).

    GET /api/v1/auth/google/login     -> redirect to Google (sets CSRF cookie)
    GET /api/v1/auth/google/callback  -> validate, link/create, issue our JWTs

The session this issues is our STANDARD JWT pair (identical to password login),
so /auth/me, refresh and every protected route keep working unchanged.

ACCOUNT-LINKING POLICY (the core security decision):
* email_verified=false  -> REJECT. Never match or create against an existing
  email on an unverified Google email (account-takeover guard).
* verified + google_sub already linked -> log that user in.
* verified + email matches an existing account -> LINK the Google identity to
  it (no duplicate account).
* verified + no existing account -> create a new user from the Google profile
  (no password; auth_provider='google').

CSRF: a random ``state`` (and OIDC ``nonce``) are stored in an HttpOnly,
SameSite=Lax cookie at /google/login and verified on /google/callback. Google
errors/denials and any validation failure redirect back to /login?error=... —
never a 500.
"""

import logging
import secrets

from fastapi import APIRouter, Depends, Request, status
from fastapi.responses import RedirectResponse
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.core import security
from app.core.config import settings
from app.models.user import User
from app.services import google_oauth

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["auth"])

# One cookie carrying "state.nonce" (both url-safe base64, so '.' is a safe
# separator). Scoped to the callback path; cleared on every callback response.
STATE_COOKIE = "g_oauth"
COOKIE_PATH = "/api/v1/auth/google"
COOKIE_MAX_AGE = 600  # 10 minutes to complete the round-trip


# --- redirect helpers -------------------------------------------------------


def _frontend(path_and_query: str) -> RedirectResponse:
    base = settings.FRONTEND_URL.rstrip("/")
    return RedirectResponse(
        f"{base}{path_and_query}", status_code=status.HTTP_303_SEE_OTHER
    )


def _clear_state_cookie(resp: RedirectResponse) -> None:
    """Delete the state cookie with the SAME attributes it was set with, so
    every browser reliably drops it."""
    resp.delete_cookie(
        STATE_COOKIE,
        path=COOKIE_PATH,
        httponly=True,
        samesite="lax",
        secure=settings.APP_ENV == "production",
    )


def _error_redirect(code: str, *, clear_cookie: bool = True) -> RedirectResponse:
    """Back to the login page with an error code the UI maps to a message. On a
    state mismatch we pass clear_cookie=False so a cross-site /callback can't
    wipe a victim's in-flight login cookie."""
    resp = _frontend(f"/login?error={code}")
    if clear_cookie:
        _clear_state_cookie(resp)
    return resp


def _success_redirect(user_id: object) -> RedirectResponse:
    """Hand our standard JWT pair to the SPA via the URL fragment (never sent to
    a server / not logged), landing the user logged-in on /auth/callback."""
    from urllib.parse import urlencode

    fragment = urlencode(
        {
            "access_token": security.create_access_token(user_id),
            "refresh_token": security.create_refresh_token(user_id),
        }
    )
    resp = _frontend(f"/auth/callback#{fragment}")
    _clear_state_cookie(resp)
    return resp


# --- account linking --------------------------------------------------------


def _ensure_usable(user: User) -> None:
    if user.deleted_at is not None or not user.is_active:
        raise google_oauth.GoogleOAuthError("account unavailable")


async def _find_existing(
    db: AsyncSession, identity: google_oauth.GoogleIdentity
) -> User | None:
    """Return the existing user this verified identity maps to (by google_sub,
    else by email — linking on the latter), or None if there's no account yet."""
    # 1. already-linked Google identity -> that user.
    user = await db.scalar(select(User).where(User.google_sub == identity.sub))
    if user is not None:
        _ensure_usable(user)
        return user

    # 2. existing account with this (verified) email -> link, never duplicate.
    #    No deleted_at filter: the email is globally unique, so a soft-deleted
    #    row still owns it — link onto a live account, reject a dead one.
    user = await db.scalar(select(User).where(User.email == identity.email))
    if user is not None:
        _ensure_usable(user)
        if user.google_sub is None:
            user.google_sub = identity.sub
            await db.commit()
            await db.refresh(user)
        elif user.google_sub != identity.sub:
            # This email is already bound to a DIFFERENT Google identity — don't
            # silently rebind (defensive; shouldn't happen, one email = one sub).
            raise google_oauth.GoogleOAuthError("email bound to another identity")
        return user

    return None


async def _resolve_user(
    db: AsyncSession, identity: google_oauth.GoogleIdentity
) -> User:
    """Apply the linking policy to a VERIFIED identity and return the user.
    Caller must have already rejected unverified/empty emails."""
    existing = await _find_existing(db, identity)
    if existing is not None:
        return existing

    # Brand-new account from the Google profile (no password).
    user = User(
        email=identity.email,
        full_name=identity.full_name,
        hashed_password=None,
        auth_provider="google",
        google_sub=identity.sub,
    )
    db.add(user)
    try:
        await db.commit()
    except IntegrityError:
        # A concurrent first-time sign-in inserted the row first (unique email /
        # google_sub). Roll back and reuse the row that won the race.
        await db.rollback()
        winner = await _find_existing(db, identity)
        if winner is None:
            raise google_oauth.GoogleOAuthError("account creation conflict") from None
        return winner
    await db.refresh(user)
    return user


# --- routes -----------------------------------------------------------------


@router.get("/google/login")
async def google_login() -> RedirectResponse:
    if not google_oauth.is_configured():
        return _error_redirect("config")
    state = secrets.token_urlsafe(32)
    nonce = secrets.token_urlsafe(32)
    resp = RedirectResponse(
        google_oauth.build_authorization_url(state, nonce),
        status_code=status.HTTP_303_SEE_OTHER,
    )
    resp.set_cookie(
        STATE_COOKIE,
        f"{state}.{nonce}",
        max_age=COOKIE_MAX_AGE,
        httponly=True,
        samesite="lax",  # sent on Google's top-level redirect back to us
        secure=settings.APP_ENV == "production",  # required over HTTPS in prod
        path=COOKIE_PATH,
    )
    return resp


@router.get("/google/callback")
async def google_callback(
    request: Request,
    state: str | None = None,
    code: str | None = None,
    error: str | None = None,
    db: AsyncSession = Depends(get_db),
) -> RedirectResponse:
    # CSRF FIRST: the state echoed by Google must match our cookie (constant
    # time). A missing/mismatched state isn't our flow — reject WITHOUT clearing
    # the cookie, so a forged cross-site /callback can't wipe a victim's pending
    # login. From here on the request is bound to our cookie.
    cookie_state, _, cookie_nonce = (request.cookies.get(STATE_COOKIE) or "").partition(
        "."
    )
    if not state or not cookie_state or not secrets.compare_digest(state, cookie_state):
        return _error_redirect("state", clear_cookie=False)

    # User denied consent or Google returned an error (state already verified).
    if error:
        return _error_redirect("cancelled")

    if not code:
        return _error_redirect("failed")

    # Server-to-server code exchange + full id_token validation. Any network or
    # validation failure (incl. JWKS fetch) is surfaced as GoogleOAuthError.
    try:
        identity = await google_oauth.fetch_identity(code, cookie_nonce)
    except google_oauth.GoogleOAuthError as exc:
        logger.warning("Google callback: identity fetch failed: %s", exc)
        return _error_redirect("failed")

    # NEVER auto-link/create on an unverified email.
    if not identity.email_verified:
        return _error_redirect("unverified")

    try:
        user = await _resolve_user(db, identity)
    except google_oauth.GoogleOAuthError:
        return _error_redirect("unavailable")
    except SQLAlchemyError:
        await db.rollback()
        return _error_redirect("failed")

    return _success_redirect(user.id)
