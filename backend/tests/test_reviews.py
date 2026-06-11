"""Review API tests: ownership scoping, free-plan limits, public share-link
rules (404/410/403), and guest sessions."""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import func, select

from app.models.guest import GuestSession
from app.models.review import Review
from tests.conftest import make_project, make_user

pytestmark = pytest.mark.asyncio


async def _create_review(client, project_id, **body):
    return await client.post(f"/api/v1/projects/{project_id}/reviews", json=body)


async def test_create_review_includes_share_url(client, auth, session_factory):
    user = auth.user = await make_user(session_factory, "free")
    project = await make_project(session_factory, user)
    r = await _create_review(client, project.id, name="Round 1")
    assert r.status_code == 201, r.text
    body = r.json()
    assert len(body["slug"]) == 8
    assert body["share_url"].endswith(f"/r/{body['slug']}")
    assert body["is_active"] is True


async def test_free_plan_one_review_per_project(client, auth, session_factory):
    user = auth.user = await make_user(session_factory, "free")
    project = await make_project(session_factory, user)
    assert (await _create_review(client, project.id)).status_code == 201
    assert (await _create_review(client, project.id)).status_code == 403


async def test_pro_plan_unlimited_reviews(client, auth, session_factory):
    user = auth.user = await make_user(session_factory, "pro")
    project = await make_project(session_factory, user)
    assert (await _create_review(client, project.id)).status_code == 201
    assert (await _create_review(client, project.id)).status_code == 201


async def test_review_ownership_scoping(client, auth, session_factory):
    owner = await make_user(session_factory, "free")
    other = await make_user(session_factory, "free")
    project = await make_project(session_factory, owner)

    auth.user = owner
    review_id = (await _create_review(client, project.id)).json()["id"]

    auth.user = other
    assert (
        await client.patch(f"/api/v1/reviews/{review_id}", json={"name": "x"})
    ).status_code == 404
    assert (await client.delete(f"/api/v1/reviews/{review_id}")).status_code == 404
    # cannot create a review under someone else's project either
    assert (await _create_review(client, project.id)).status_code == 404


async def test_public_review_ok_and_not_found(client, auth, session_factory):
    user = auth.user = await make_user(session_factory, "free")
    project = await make_project(session_factory, user)
    slug = (await _create_review(client, project.id, name="R1")).json()["slug"]

    auth.user = None  # public, no auth
    ok = await client.get(f"/api/v1/r/{slug}")
    assert ok.status_code == 200, ok.text
    data = ok.json()
    assert data["review"]["slug"] == slug
    assert data["project"]["url"] == "https://staging.example.com"

    assert (await client.get("/api/v1/r/missing00")).status_code == 404


async def test_public_inactive_returns_403(client, auth, session_factory):
    user = auth.user = await make_user(session_factory, "free")
    project = await make_project(session_factory, user)
    review = (await _create_review(client, project.id)).json()
    assert (
        await client.patch(f"/api/v1/reviews/{review['id']}", json={"is_active": False})
    ).status_code == 200

    auth.user = None
    assert (await client.get(f"/api/v1/r/{review['slug']}")).status_code == 403


async def test_public_expired_returns_410(client, auth, session_factory):
    user = auth.user = await make_user(session_factory, "free")
    project = await make_project(session_factory, user)
    review = (await _create_review(client, project.id)).json()
    past = (datetime.now(timezone.utc) - timedelta(days=1)).isoformat()
    assert (
        await client.patch(f"/api/v1/reviews/{review['id']}", json={"expires_at": past})
    ).status_code == 200

    auth.user = None
    assert (await client.get(f"/api/v1/r/{review['slug']}")).status_code == 410


async def test_guest_session_creation(client, auth, session_factory):
    user = auth.user = await make_user(session_factory, "free")
    project = await make_project(session_factory, user)
    slug = (await _create_review(client, project.id)).json()["slug"]

    auth.user = None
    r = await client.post(
        f"/api/v1/r/{slug}/session",
        json={"display_name": "Jane", "email": "jane@client.co"},
    )
    assert r.status_code == 201, r.text
    token = r.json()["session_token"]
    assert len(token) == 32 and all(c in "0123456789abcdef" for c in token)

    async with session_factory() as s:
        guest = await s.scalar(
            select(GuestSession).where(GuestSession.session_token == token)
        )
        assert guest is not None and guest.display_name == "Jane"


async def test_guest_session_blocked_on_inactive(client, auth, session_factory):
    user = auth.user = await make_user(session_factory, "free")
    project = await make_project(session_factory, user)
    review = (await _create_review(client, project.id)).json()
    await client.patch(f"/api/v1/reviews/{review['id']}", json={"is_active": False})

    auth.user = None
    r = await client.post(
        f"/api/v1/r/{review['slug']}/session", json={"display_name": "X"}
    )
    assert r.status_code == 403


async def test_delete_review_hard_deletes_with_dependents(
    client, auth, session_factory
):
    user = auth.user = await make_user(session_factory, "free")
    project = await make_project(session_factory, user)
    review = (await _create_review(client, project.id)).json()
    review_id = uuid.UUID(review["id"])

    # add a guest session so we can prove the cascade cleanup
    auth.user = None
    await client.post(f"/api/v1/r/{review['slug']}/session", json={"display_name": "G"})

    auth.user = user
    assert (await client.delete(f"/api/v1/reviews/{review_id}")).status_code == 204

    async with session_factory() as s:
        assert await s.get(Review, review_id) is None
        guest_count = await s.scalar(
            select(func.count())
            .select_from(GuestSession)
            .where(GuestSession.review_id == review_id)
        )
        assert guest_count == 0
