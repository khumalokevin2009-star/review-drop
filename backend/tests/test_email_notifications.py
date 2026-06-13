"""Email-notification tests (CLAUDE.md Section 11).

Covers: a guest comment notifies the owner; a designer comment does not; the
debounce batching coalesces a burst within the window; and an email failure
never breaks comment creation. No real network is used — ``send_email`` is
mocked, and the notification background task's session factory is pointed at the
test DB (its real ``AsyncSessionLocal`` targets the dev database). The transport
no-op behaviour is unit-tested separately (no DB needed).
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock

import pytest
from sqlalchemy import func, select

from app.core.config import settings
from app.models.comment import Comment
from app.models.review import Review
from app.services import email_notifications, email_service
from app.services.email_service import EmailResult, send_email
from tests.conftest import make_project, make_user

pytestmark = pytest.mark.asyncio

PAGE = "https://staging.example.com/about"


# --- transport no-op (no DB / no network) -----------------------------------


async def test_send_email_noops_when_disabled(monkeypatch):
    monkeypatch.setattr(settings, "EMAIL_ENABLED", False)
    monkeypatch.setattr(settings, "RESEND_API_KEY", "re_irrelevant")
    res = await send_email(to="a@b.co", subject="s", html="<p>x</p>")
    assert res == EmailResult(ok=False, detail="email disabled")


async def test_send_email_noops_without_api_key(monkeypatch):
    monkeypatch.setattr(settings, "EMAIL_ENABLED", True)
    monkeypatch.setattr(settings, "RESEND_API_KEY", None)
    res = await send_email(to="a@b.co", subject="s", html="<p>x</p>")
    assert res == EmailResult(ok=False, detail="email not configured")


# --- DB-backed notification flow --------------------------------------------


@pytest.fixture
def email_spy(monkeypatch, session_factory):
    """Capture every send_email call (no network) and point the notification
    background task at the test DB so it sees test data."""
    spy = AsyncMock(return_value=EmailResult(ok=True, detail="sent"))
    monkeypatch.setattr(email_service, "send_email", spy)
    monkeypatch.setattr(email_notifications, "AsyncSessionLocal", session_factory)
    return spy


async def _setup_review(client, auth, session_factory):
    user = await make_user(session_factory)
    auth.user = user
    project = await make_project(session_factory, user, name="Acme Redesign")
    review = (
        await client.post(
            f"/api/v1/projects/{project.id}/reviews", json={"name": "Round 1"}
        )
    ).json()
    return user, project, review


async def _guest_token(client, auth, slug, name="Jane Client"):
    auth.user = None
    r = await client.post(f"/api/v1/r/{slug}/session", json={"display_name": name})
    assert r.status_code == 201, r.text
    return r.json()["session_token"]


async def _post_guest_comment(client, slug, token, body="Logo feels too small"):
    return await client.post(
        f"/api/v1/r/{slug}/comments",
        headers={"X-Guest-Token": token},
        json={"body": body, "page_url": PAGE},
    )


async def test_guest_comment_notifies_owner(client, auth, session_factory, email_spy):
    user, project, review = await _setup_review(client, auth, session_factory)
    token = await _guest_token(client, auth, review["slug"])

    r = await _post_guest_comment(client, review["slug"], token)
    assert r.status_code == 201, r.text

    # The background task runs under ASGITransport before the response returns.
    email_spy.assert_awaited_once()
    kwargs = email_spy.await_args.kwargs
    assert kwargs["to"] == user.email
    assert project.name in kwargs["subject"]
    assert "Jane Client" in kwargs["html"]
    assert "Logo feels too small" in kwargs["html"]
    assert kwargs["text"]  # plain-text fallback present


async def test_designer_comment_does_not_notify(
    client, auth, session_factory, email_spy
):
    user, project, review = await _setup_review(client, auth, session_factory)
    auth.user = user  # authenticated designer

    r = await client.post(
        f"/api/v1/reviews/{review['id']}/comments",
        json={"body": "I'll fix the logo", "page_url": PAGE},
    )
    assert r.status_code == 201, r.text
    email_spy.assert_not_awaited()


async def test_batching_coalesces_within_window(
    client, auth, session_factory, email_spy
):
    user, project, review = await _setup_review(client, auth, session_factory)
    slug = review["slug"]
    token = await _guest_token(client, auth, slug)

    # First comment → one send (count 1).
    assert (await _post_guest_comment(client, slug, token, "one")).status_code == 201
    assert email_spy.await_count == 1
    assert "New feedback" in email_spy.await_args.kwargs["subject"]

    # Second comment inside the window → suppressed/coalesced.
    assert (await _post_guest_comment(client, slug, token, "two")).status_code == 201
    assert email_spy.await_count == 1

    # Simulate the debounce window elapsing.
    async with session_factory() as s:
        rev = await s.get(Review, review["id"])
        rev.last_notified_at = datetime.now(timezone.utc) - timedelta(
            minutes=settings.EMAIL_BATCH_WINDOW_MINUTES + 1
        )
        await s.commit()

    # Third comment past the window → a new send summarising the 2 pending.
    assert (await _post_guest_comment(client, slug, token, "three")).status_code == 201
    assert email_spy.await_count == 2
    assert "2 new comments" in email_spy.await_args.kwargs["subject"]


async def test_email_failure_never_breaks_comment_creation(
    client, auth, session_factory, monkeypatch
):
    # send_email raises — the notifier must swallow it and the comment must still
    # be created with a 201.
    boom = AsyncMock(side_effect=RuntimeError("resend is down"))
    monkeypatch.setattr(email_service, "send_email", boom)
    monkeypatch.setattr(email_notifications, "AsyncSessionLocal", session_factory)

    user, project, review = await _setup_review(client, auth, session_factory)
    slug = review["slug"]
    token = await _guest_token(client, auth, slug)

    r = await _post_guest_comment(client, slug, token, "does this still work?")
    assert r.status_code == 201, r.text

    async with session_factory() as s:
        count = await s.scalar(
            select(func.count())
            .select_from(Comment)
            .where(Comment.review_id == review["id"], Comment.deleted_at.is_(None))
        )
    assert count == 1
