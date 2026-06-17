"""Google OAuth flow tests (CLAUDE.md Sections 8, 13).

Google is fully mocked — NO real network/OAuth calls. The CSRF ``state`` is
driven through the real ``/google/login`` cookie so the state machine itself is
exercised; only the code-exchange + id_token validation (``fetch_identity``) is
stubbed, since that's the only part that would touch Google.

Covers the security-critical matrix: verified-new creates, verified-existing
links (no duplicate), UNVERIFIED is rejected (no create, no link), CSRF
mismatch is rejected, Google denial is handled, and the password paths keep
working (OAuth-only can't password-login; a linked account still can).
"""

from __future__ import annotations

import uuid
from urllib.parse import parse_qs, urlparse

from sqlalchemy import func, select

from app.core import security
from app.core.config import settings
from app.models.user import User
from app.services import google_oauth
from app.services.google_oauth import GoogleIdentity
from tests.conftest import make_user

LOGIN = "/api/v1/auth/google/login"
CALLBACK = "/api/v1/auth/google/callback"


# --- helpers ----------------------------------------------------------------


def _configure(monkeypatch) -> None:
    monkeypatch.setattr(settings, "GOOGLE_CLIENT_ID", "test-client-id")
    monkeypatch.setattr(settings, "GOOGLE_CLIENT_SECRET", "test-client-secret")


def _patch_identity(monkeypatch, *, identity=None, exc=None) -> dict:
    """Stub fetch_identity; returns a dict whose 'n' counts invocations."""
    calls = {"n": 0}

    async def fake(code: str, nonce: str):
        calls["n"] += 1
        if exc is not None:
            raise exc
        return identity

    monkeypatch.setattr(google_oauth, "fetch_identity", fake)
    return calls


async def _login_state(client) -> str:
    """Hit /google/login (sets the state cookie on the client) and return the
    state Google would echo back."""
    r = await client.get(LOGIN)
    assert r.status_code == 303, r.text
    q = parse_qs(urlparse(r.headers["location"]).query)
    return q["state"][0]


def _redirect_query(location: str) -> dict:
    return {k: v[0] for k, v in parse_qs(urlparse(location).query).items()}


def _fragment_tokens(location: str) -> tuple[str | None, str | None]:
    frag = parse_qs(urlparse(location).fragment)
    return frag.get("access_token", [None])[0], frag.get("refresh_token", [None])[0]


async def _user_by_email(session_factory, email: str) -> User | None:
    async with session_factory() as s:
        return await s.scalar(select(User).where(User.email == email))


async def _count_users(session_factory, email: str) -> int:
    async with session_factory() as s:
        return (
            await s.scalar(
                select(func.count()).select_from(User).where(User.email == email)
            )
        ) or 0


# --- /google/login ----------------------------------------------------------


async def test_login_redirects_to_google_with_state_cookie(client, monkeypatch):
    _configure(monkeypatch)
    r = await client.get(LOGIN)
    assert r.status_code == 303
    loc = r.headers["location"]
    assert loc.startswith("https://accounts.google.com/o/oauth2/v2/auth")
    q = _redirect_query(loc)
    assert q["client_id"] == "test-client-id"
    assert q["redirect_uri"].endswith("/api/v1/auth/google/callback")
    assert q["response_type"] == "code"
    assert "openid" in q["scope"]
    assert q["state"] and q["nonce"]
    # CSRF state stored in an HttpOnly cookie.
    set_cookie = r.headers.get("set-cookie", "")
    assert "g_oauth=" in set_cookie and "httponly" in set_cookie.lower()


async def test_login_not_configured_redirects_with_error(client, monkeypatch):
    monkeypatch.setattr(settings, "GOOGLE_CLIENT_ID", None)
    monkeypatch.setattr(settings, "GOOGLE_CLIENT_SECRET", None)
    r = await client.get(LOGIN)
    assert r.status_code == 303
    assert _redirect_query(r.headers["location"]).get("error") == "config"


# --- verified email, no existing user -> create + JWT -----------------------


async def test_verified_new_email_creates_account(client, session_factory, monkeypatch):
    _configure(monkeypatch)
    state = await _login_state(client)
    _patch_identity(
        monkeypatch,
        identity=GoogleIdentity(
            sub="google-sub-new",
            email="new.designer@example.com",
            email_verified=True,
            full_name="New Designer",
        ),
    )

    r = await client.get(f"{CALLBACK}?state={state}&code=good-code")
    assert r.status_code == 303
    loc = r.headers["location"]
    assert "/auth/callback#" in loc

    access, refresh = _fragment_tokens(loc)
    assert access and refresh
    user = await _user_by_email(session_factory, "new.designer@example.com")
    assert user is not None
    assert user.auth_provider == "google"
    assert user.google_sub == "google-sub-new"
    assert user.hashed_password is None
    assert user.full_name == "New Designer"
    # Tokens are our standard JWTs for that user.
    assert security.decode_token(access, expected_type=security.ACCESS_TOKEN_TYPE)[
        "sub"
    ] == str(user.id)
    assert security.decode_token(refresh, expected_type=security.REFRESH_TOKEN_TYPE)[
        "sub"
    ] == str(user.id)


# --- verified email, existing password account -> link (no duplicate) -------


async def test_verified_existing_email_links_without_duplicate(
    client, session_factory, monkeypatch
):
    existing = await make_user(session_factory, password="secret-pw-123")
    assert existing.google_sub is None
    _configure(monkeypatch)
    state = await _login_state(client)
    _patch_identity(
        monkeypatch,
        identity=GoogleIdentity(
            sub="google-sub-link",
            email=existing.email,
            email_verified=True,
            full_name="Linked Name",
        ),
    )

    r = await client.get(f"{CALLBACK}?state={state}&code=good-code")
    assert r.status_code == 303
    access, _ = _fragment_tokens(r.headers["location"])
    assert access

    # Linked onto the SAME account — no duplicate, password origin preserved.
    assert await _count_users(session_factory, existing.email) == 1
    linked = await _user_by_email(session_factory, existing.email)
    assert linked.id == existing.id
    assert linked.google_sub == "google-sub-link"
    assert linked.auth_provider == "password"
    assert linked.hashed_password is not None  # still has their password


async def test_existing_google_sub_logs_in_same_user(
    client, session_factory, monkeypatch
):
    """A second Google sign-in matches by google_sub — no second account."""
    _configure(monkeypatch)
    ident = GoogleIdentity(
        sub="google-sub-repeat",
        email="repeat@example.com",
        email_verified=True,
        full_name="Repeat",
    )
    # first sign-in creates the account
    state = await _login_state(client)
    _patch_identity(monkeypatch, identity=ident)
    await client.get(f"{CALLBACK}?state={state}&code=c1")
    first = await _user_by_email(session_factory, "repeat@example.com")
    # second sign-in (same sub)
    state2 = await _login_state(client)
    _patch_identity(monkeypatch, identity=ident)
    r = await client.get(f"{CALLBACK}?state={state2}&code=c2")
    assert r.status_code == 303
    assert await _count_users(session_factory, "repeat@example.com") == 1
    second = await _user_by_email(session_factory, "repeat@example.com")
    assert second.id == first.id


# --- UNVERIFIED email -> rejected (security-critical) -----------------------


async def test_unverified_email_is_rejected_and_never_links(
    client, session_factory, monkeypatch
):
    """An unverified Google email matching an existing password account must NOT
    link or log in — the account-takeover guard."""
    victim = await make_user(session_factory, password="victim-pw-123")
    _configure(monkeypatch)
    state = await _login_state(client)
    calls = _patch_identity(
        monkeypatch,
        identity=GoogleIdentity(
            sub="attacker-sub",
            email=victim.email,  # same email as the victim
            email_verified=False,  # but NOT verified
            full_name="Attacker",
        ),
    )

    r = await client.get(f"{CALLBACK}?state={state}&code=evil-code")
    assert r.status_code == 303
    q = _redirect_query(r.headers["location"])
    assert q.get("error") == "unverified"
    # No tokens issued, and the victim account is untouched.
    assert "access_token" not in r.headers["location"]
    fresh = await _user_by_email(session_factory, victim.email)
    assert fresh.google_sub is None  # NOT linked
    assert calls["n"] == 1  # identity was fetched, then rejected on verification


async def test_unverified_new_email_creates_nothing(
    client, session_factory, monkeypatch
):
    _configure(monkeypatch)
    state = await _login_state(client)
    _patch_identity(
        monkeypatch,
        identity=GoogleIdentity(
            sub="sub-x",
            email="nobody@example.com",
            email_verified=False,
            full_name="Nobody",
        ),
    )
    r = await client.get(f"{CALLBACK}?state={state}&code=c")
    assert _redirect_query(r.headers["location"]).get("error") == "unverified"
    assert await _count_users(session_factory, "nobody@example.com") == 0


# --- CSRF / state -----------------------------------------------------------


async def test_state_mismatch_is_rejected(client, session_factory, monkeypatch):
    _configure(monkeypatch)
    await _login_state(client)  # sets a real cookie
    calls = _patch_identity(
        monkeypatch,
        identity=GoogleIdentity("s", "x@example.com", True, "X"),
    )
    # wrong state value -> rejected before any code exchange
    r = await client.get(f"{CALLBACK}?state=not-the-real-state&code=c")
    assert r.status_code == 303
    assert _redirect_query(r.headers["location"]).get("error") == "state"
    assert calls["n"] == 0  # fetch_identity never called


async def test_missing_state_cookie_is_rejected(client, monkeypatch):
    _configure(monkeypatch)
    calls = _patch_identity(
        monkeypatch, identity=GoogleIdentity("s", "x@example.com", True, "X")
    )
    # no /google/login first -> no cookie
    r = await client.get(f"{CALLBACK}?state=anything&code=c")
    assert _redirect_query(r.headers["location"]).get("error") == "state"
    assert calls["n"] == 0


# --- Google denial / errors -------------------------------------------------


async def test_google_denial_is_handled(client, monkeypatch):
    _configure(monkeypatch)
    state = await _login_state(client)
    r = await client.get(f"{CALLBACK}?state={state}&error=access_denied")
    assert r.status_code == 303
    assert _redirect_query(r.headers["location"]).get("error") == "cancelled"


async def test_token_exchange_failure_is_handled(client, monkeypatch):
    _configure(monkeypatch)
    state = await _login_state(client)
    _patch_identity(monkeypatch, exc=google_oauth.GoogleOAuthError("boom"))
    r = await client.get(f"{CALLBACK}?state={state}&code=bad")
    assert r.status_code == 303
    assert _redirect_query(r.headers["location"]).get("error") == "failed"


async def test_missing_code_is_rejected(client, monkeypatch):
    """Valid state but Google returned neither code nor error -> handled."""
    _configure(monkeypatch)
    state = await _login_state(client)
    calls = _patch_identity(
        monkeypatch, identity=GoogleIdentity("s", "x@example.com", True, "X")
    )
    r = await client.get(f"{CALLBACK}?state={state}")
    assert r.status_code == 303
    assert _redirect_query(r.headers["location"]).get("error") == "failed"
    assert calls["n"] == 0


async def test_state_mismatch_does_not_clear_cookie(client, monkeypatch):
    """A forged cross-site callback must NOT wipe the victim's pending state
    cookie (the error redirect leaves it intact)."""
    _configure(monkeypatch)
    await _login_state(client)  # sets the cookie
    _patch_identity(
        monkeypatch, identity=GoogleIdentity("s", "x@example.com", True, "X")
    )
    r = await client.get(f"{CALLBACK}?state=forged&code=c")
    assert _redirect_query(r.headers["location"]).get("error") == "state"
    # No Set-Cookie deleting g_oauth on the mismatch path.
    assert "g_oauth" not in r.headers.get("set-cookie", "")


# --- deleted / inactive accounts are rejected -------------------------------


async def test_inactive_account_is_rejected_and_not_linked(
    client, session_factory, monkeypatch
):
    user = await make_user(session_factory, password="pw-123456")
    async with session_factory() as s:
        db_user = await s.get(User, user.id)
        db_user.is_active = False
        await s.commit()

    _configure(monkeypatch)
    state = await _login_state(client)
    _patch_identity(
        monkeypatch,
        identity=GoogleIdentity("sub-inactive", user.email, True, "X"),
    )
    r = await client.get(f"{CALLBACK}?state={state}&code=c")
    assert _redirect_query(r.headers["location"]).get("error") == "unavailable"
    assert "access_token" not in r.headers["location"]
    fresh = await _user_by_email(session_factory, user.email)
    assert fresh.google_sub is None  # never linked onto a disabled account


# --- password-login interplay (regression) ----------------------------------


async def test_oauth_only_user_cannot_password_login(
    client, session_factory, monkeypatch
):
    """A Google-only user (NULL hash) is rejected at password login, not 500."""
    _configure(monkeypatch)
    state = await _login_state(client)
    _patch_identity(
        monkeypatch,
        identity=GoogleIdentity("sub-only", "googleonly@example.com", True, "G Only"),
    )
    await client.get(f"{CALLBACK}?state={state}&code=c")

    r = await client.post(
        "/api/v1/auth/login",
        json={"email": "googleonly@example.com", "password": "anything"},
    )
    assert r.status_code == 401


async def test_linked_user_can_still_password_login(
    client, session_factory, monkeypatch
):
    existing = await make_user(session_factory, password="orig-pw-123")
    _configure(monkeypatch)
    state = await _login_state(client)
    _patch_identity(
        monkeypatch,
        identity=GoogleIdentity("sub-linked", existing.email, True, "Linked"),
    )
    await client.get(f"{CALLBACK}?state={state}&code=c")  # link Google

    # original password still works
    r = await client.post(
        "/api/v1/auth/login",
        json={"email": existing.email, "password": "orig-pw-123"},
    )
    assert r.status_code == 200, r.text
    assert r.json()["access_token"]


# --- /auth/me reflects the OAuth account ------------------------------------


async def test_me_after_google_signin(client, auth, session_factory, monkeypatch):
    _configure(monkeypatch)
    state = await _login_state(client)
    _patch_identity(
        monkeypatch,
        identity=GoogleIdentity("sub-me", "me@example.com", True, "Me Myself"),
    )
    r = await client.get(f"{CALLBACK}?state={state}&code=c")
    access, _ = _fragment_tokens(r.headers["location"])

    # The access token authenticates against the real get_current_user.
    user_id = uuid.UUID(
        security.decode_token(access, expected_type=security.ACCESS_TOKEN_TYPE)["sub"]
    )
    async with session_factory() as s:
        user = await s.get(User, user_id)
    assert user.email == "me@example.com"
    assert user.auth_provider == "google"
