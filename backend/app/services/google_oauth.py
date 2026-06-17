"""Google OAuth 2.0 / OpenID Connect — authorization-code flow (CLAUDE.md
Sections 5, 8, 13).

A small, direct implementation over httpx + python-jose (both already
dependencies — no heavy/abandoned OAuth library). The flow:

1. ``build_authorization_url`` — the route redirects the browser to Google with
   our client id, the registered redirect URI, ``openid email profile`` scope,
   a CSRF ``state`` and an OIDC ``nonce``.
2. Google redirects back with a one-time ``code``.
3. ``fetch_identity`` exchanges that code server-to-server (so the id_token
   never transits the browser), then VALIDATES the returned id_token:
   - signature against Google's published JWKS (RS256),
   - ``aud`` == our client id,
   - ``iss`` is a Google issuer,
   - ``exp`` not passed (enforced by jose),
   - ``nonce`` matches the one we issued,
   and returns the verified identity (sub, email, email_verified, name).

Security notes:
* Secrets (client id/secret) come from settings/env only.
* ``email_verified`` is parsed STRICTLY — Google may send a JSON bool or the
  legacy string "true"; anything else is treated as unverified. The caller must
  refuse to auto-link/create on an unverified email (account-takeover guard).
* The code exchange uses the SAME redirect_uri registered with Google.
"""

from __future__ import annotations

import time
from dataclasses import dataclass
from urllib.parse import urlencode

import httpx
from jose import JWTError, jwt

from app.core.config import settings

# Google's stable OIDC endpoints (per its discovery document). Hardcoded to
# avoid an extra discovery round-trip; they have been stable for years.
AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth"
TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token"
JWKS_URI = "https://www.googleapis.com/oauth2/v3/certs"
ISSUERS = frozenset({"https://accounts.google.com", "accounts.google.com"})
SCOPES = "openid email profile"
CALLBACK_PATH = "/api/v1/auth/google/callback"
_HTTP_TIMEOUT = 10.0
_JWKS_TTL_SECONDS = 3600.0


class GoogleOAuthError(Exception):
    """Any failure exchanging the code or validating the id_token."""


class GoogleNotConfigured(GoogleOAuthError):
    """Raised when client id/secret aren't set."""


@dataclass(frozen=True)
class GoogleIdentity:
    sub: str
    email: str
    email_verified: bool
    full_name: str | None


def is_configured() -> bool:
    return bool(settings.GOOGLE_CLIENT_ID and settings.GOOGLE_CLIENT_SECRET)


def redirect_uri() -> str:
    """The redirect URI sent to Google — must match a console-registered URI.
    Defaults to BACKEND_URL + the callback path (dev: localhost:8000, prod:
    orvellehq.com), overridable via GOOGLE_REDIRECT_URI."""
    if settings.GOOGLE_REDIRECT_URI:
        return settings.GOOGLE_REDIRECT_URI
    return f"{settings.BACKEND_URL.rstrip('/')}{CALLBACK_PATH}"


def build_authorization_url(state: str, nonce: str) -> str:
    """Google authorization URL carrying our CSRF state and OIDC nonce."""
    params = {
        "client_id": settings.GOOGLE_CLIENT_ID,
        "redirect_uri": redirect_uri(),
        "response_type": "code",
        "scope": SCOPES,
        "state": state,
        "nonce": nonce,
        "access_type": "online",
        # Always show the account chooser rather than silently reusing a session.
        "prompt": "select_account",
    }
    return f"{AUTH_ENDPOINT}?{urlencode(params)}"


# --- token exchange + id_token validation -----------------------------------

# Tiny in-process JWKS cache (Google rotates keys ~daily). Refreshed on TTL.
_jwks: dict | None = None
_jwks_fetched_at = 0.0


async def _get_jwks() -> dict:
    global _jwks, _jwks_fetched_at
    now = time.monotonic()
    if _jwks is None or now - _jwks_fetched_at > _JWKS_TTL_SECONDS:
        try:
            async with httpx.AsyncClient(timeout=_HTTP_TIMEOUT) as client:
                resp = await client.get(JWKS_URI)
                resp.raise_for_status()
                _jwks = resp.json()
        except httpx.HTTPError as exc:  # network/HTTP error -> handled, not a 500
            raise GoogleOAuthError(f"Could not fetch Google JWKS: {exc}") from exc
        _jwks_fetched_at = now
    return _jwks


async def _exchange_code(code: str) -> dict:
    data = {
        "grant_type": "authorization_code",
        "code": code,
        "client_id": settings.GOOGLE_CLIENT_ID,
        "client_secret": settings.GOOGLE_CLIENT_SECRET,
        "redirect_uri": redirect_uri(),
    }
    try:
        async with httpx.AsyncClient(timeout=_HTTP_TIMEOUT) as client:
            resp = await client.post(TOKEN_ENDPOINT, data=data)
    except httpx.HTTPError as exc:  # connection/timeout -> handled, not a 500
        raise GoogleOAuthError(f"Token exchange request failed: {exc}") from exc
    if resp.status_code != 200:
        raise GoogleOAuthError(
            f"Token exchange failed ({resp.status_code}): {resp.text[:300]}"
        )
    return resp.json()


def _email_verified(claim: object) -> bool:
    """Strict: only a real True or the legacy string 'true' counts as verified.
    Anything else (False, 'false', None, missing) is unverified."""
    return claim is True or (isinstance(claim, str) and claim.lower() == "true")


async def _verify_id_token(id_token: str, expected_nonce: str) -> dict:
    jwks = await _get_jwks()
    try:
        claims = jwt.decode(
            id_token,
            jwks,
            algorithms=["RS256"],
            audience=settings.GOOGLE_CLIENT_ID,
            # require_aud/require_exp make those claims MANDATORY — python-jose
            # otherwise skips audience validation when 'aud' is simply absent.
            options={
                "verify_at_hash": False,
                "require_aud": True,
                "require_exp": True,
                "require_iat": True,
            },
        )
    except JWTError as exc:
        raise GoogleOAuthError(f"Invalid id_token: {exc}") from exc
    if claims.get("iss") not in ISSUERS:
        raise GoogleOAuthError("Invalid id_token issuer")
    if claims.get("nonce") != expected_nonce:
        raise GoogleOAuthError("id_token nonce mismatch")
    if not claims.get("sub"):
        raise GoogleOAuthError("id_token missing sub")
    return claims


async def fetch_identity(code: str, expected_nonce: str) -> GoogleIdentity:
    """Exchange ``code`` and return the fully-validated Google identity. Raises
    ``GoogleOAuthError`` on any exchange/validation failure."""
    if not is_configured():
        raise GoogleNotConfigured("Google OAuth is not configured")
    tokens = await _exchange_code(code)
    id_token = tokens.get("id_token")
    if not id_token:
        raise GoogleOAuthError("No id_token in token response")
    claims = await _verify_id_token(id_token, expected_nonce)
    email = (claims.get("email") or "").strip().lower()
    # We request the 'email' scope, so a missing/blank email is a malformed
    # identity — refuse it rather than create/match a blank-email account (an
    # empty string would otherwise collide across distinct Google accounts).
    if not email:
        raise GoogleOAuthError("id_token has no email")
    return GoogleIdentity(
        sub=str(claims["sub"]),
        email=email,
        email_verified=_email_verified(claims.get("email_verified")),
        full_name=claims.get("name"),
    )
