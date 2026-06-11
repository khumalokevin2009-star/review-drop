"""Comment API tests: guest-token validation, coordinate round-trip, status
transitions, reply threading, cross-review token rejection, guest visibility,
and designer ownership scoping."""

from __future__ import annotations

import pytest

from app.models.comment import Comment
from tests.conftest import make_project, make_user

pytestmark = pytest.mark.asyncio

PAGE = "https://staging.example.com/about"
FULL_PIN = {
    "body": "Make this heading bigger",
    "page_url": PAGE,
    "pin_x_percent": 42.5,
    "pin_y_percent": 88.0,
    "element_selector": "div.hero > h1",
    "viewport_width": 1440,
    "viewport_height": 900,
    "pin_x_absolute": 612,
    "pin_y_absolute": 792,
    "browser_name": "Chrome",
    "browser_version": "125.0",
    "os_name": "macOS",
    "screen_width": 2560,
    "screen_height": 1440,
}
REGION_FIELDS = {
    "region_width": 320.0,
    "region_height": 180.0,
    "region_width_percent": 25.5,
    "region_height_percent": 47.25,
}
REGION_PIN = {**FULL_PIN, "body": "Tighten this hero section", **REGION_FIELDS}


async def _setup_review(client, auth, session_factory, plan="free", project=None):
    """Create (designer, project, review) and return them. Leaves auth.user set
    to the designer."""
    user = await make_user(session_factory, plan)
    auth.user = user
    project = project or await make_project(session_factory, user)
    review = (
        await client.post(f"/api/v1/projects/{project.id}/reviews", json={})
    ).json()
    return user, project, review


async def _guest_token(client, auth, slug, name="Jane"):
    auth.user = None
    r = await client.post(f"/api/v1/r/{slug}/session", json={"display_name": name})
    assert r.status_code == 201, r.text
    return r.json()["session_token"]


def _h(token):
    return {"X-Guest-Token": token}


# --- guest token validation -------------------------------------------------


async def test_guest_token_validation(client, auth, session_factory):
    _, _, review = await _setup_review(client, auth, session_factory)
    slug = review["slug"]
    body = {"body": "hi", "page_url": PAGE}

    auth.user = None
    # missing token
    assert (
        await client.post(f"/api/v1/r/{slug}/comments", json=body)
    ).status_code == 401
    # bogus token
    assert (
        await client.post(
            f"/api/v1/r/{slug}/comments", headers=_h("deadbeef"), json=body
        )
    ).status_code == 401
    # valid token
    token = await _guest_token(client, auth, slug)
    assert (
        await client.post(f"/api/v1/r/{slug}/comments", headers=_h(token), json=body)
    ).status_code == 201


async def test_guest_cannot_comment_on_inactive_review(client, auth, session_factory):
    user, _, review = await _setup_review(client, auth, session_factory)
    token = await _guest_token(client, auth, review["slug"])
    # designer deactivates the link
    auth.user = user
    await client.patch(f"/api/v1/reviews/{review['id']}", json={"is_active": False})

    auth.user = None
    r = await client.post(
        f"/api/v1/r/{review['slug']}/comments",
        headers=_h(token),
        json={"body": "x", "page_url": PAGE},
    )
    assert r.status_code == 403


# --- coordinate round-trip --------------------------------------------------


async def test_coordinate_round_trip(client, auth, session_factory):
    user, _, review = await _setup_review(client, auth, session_factory)
    token = await _guest_token(client, auth, review["slug"])

    auth.user = None
    created = await client.post(
        f"/api/v1/r/{review['slug']}/comments", headers=_h(token), json=FULL_PIN
    )
    assert created.status_code == 201, created.text
    body = created.json()
    for key, value in FULL_PIN.items():
        assert body[key] == value, key
    assert body["status"] == "open"
    assert body["screenshot_url"] is None
    assert body["author_guest_id"] is not None
    assert body["author_user_id"] is None
    assert body["author_type"] == "guest"
    assert body["is_mine"] is True

    # a point comment leaves every region dimension null
    for key in REGION_FIELDS:
        assert body[key] is None, key

    # round-trips identically through the designer view
    auth.user = user
    listed = (await client.get(f"/api/v1/reviews/{review['id']}/comments")).json()
    assert len(listed) == 1
    for key, value in FULL_PIN.items():
        assert listed[0][key] == value, key
    for key in REGION_FIELDS:
        assert listed[0][key] is None, key


async def test_region_comment_round_trip(client, auth, session_factory):
    user, project, review = await _setup_review(client, auth, session_factory)
    token = await _guest_token(client, auth, review["slug"])

    auth.user = None
    created = await client.post(
        f"/api/v1/r/{review['slug']}/comments", headers=_h(token), json=REGION_PIN
    )
    assert created.status_code == 201, created.text
    body = created.json()
    for key, value in {**FULL_PIN, **REGION_PIN}.items():
        assert body[key] == value, key

    # round-trips through the guest list...
    guest_view = (
        await client.get(f"/api/v1/r/{review['slug']}/comments", headers=_h(token))
    ).json()
    assert len(guest_view) == 1
    for key, value in REGION_FIELDS.items():
        assert guest_view[0][key] == value, key

    # ...and both designer list endpoints
    auth.user = user
    for url in (
        f"/api/v1/reviews/{review['id']}/comments",
        f"/api/v1/projects/{project.id}/comments",
    ):
        listed = (await client.get(url)).json()
        assert len(listed) == 1
        for key, value in REGION_FIELDS.items():
            assert listed[0][key] == value, key


async def test_region_dimensions_must_be_non_negative(
    client, auth, session_factory
):
    _, _, review = await _setup_review(client, auth, session_factory)
    token = await _guest_token(client, auth, review["slug"])

    auth.user = None
    for field in REGION_FIELDS:
        bad = await client.post(
            f"/api/v1/r/{review['slug']}/comments",
            headers=_h(token),
            json={**REGION_PIN, field: -1},
        )
        assert bad.status_code == 422, field


# --- status transitions -----------------------------------------------------


async def test_status_transitions(client, auth, session_factory):
    user, _, review = await _setup_review(client, auth, session_factory)
    token = await _guest_token(client, auth, review["slug"])
    auth.user = None
    cid = (
        await client.post(
            f"/api/v1/r/{review['slug']}/comments",
            headers=_h(token),
            json={"body": "fix", "page_url": PAGE},
        )
    ).json()["id"]

    auth.user = user
    for new_status in ("in_progress", "resolved", "open"):
        r = await client.patch(f"/api/v1/comments/{cid}", json={"status": new_status})
        assert r.status_code == 200
        assert r.json()["status"] == new_status

    # invalid status rejected
    bad = await client.patch(f"/api/v1/comments/{cid}", json={"status": "bogus"})
    assert bad.status_code == 422


# --- reply threading --------------------------------------------------------


async def test_reply_threading(client, auth, session_factory):
    user, _, review = await _setup_review(client, auth, session_factory)
    token = await _guest_token(client, auth, review["slug"])
    auth.user = None
    parent = (
        await client.post(
            f"/api/v1/r/{review['slug']}/comments",
            headers=_h(token),
            json={"body": "top-level", "page_url": PAGE},
        )
    ).json()

    auth.user = user
    reply = await client.post(
        f"/api/v1/comments/{parent['id']}/reply", json={"body": "On it"}
    )
    assert reply.status_code == 201, reply.text
    rbody = reply.json()
    assert rbody["parent_id"] == parent["id"]
    assert rbody["author_user_id"] is not None
    assert rbody["author_guest_id"] is None
    assert rbody["author_type"] == "designer"
    assert rbody["page_url"] == PAGE  # inherited from parent

    listed = (await client.get(f"/api/v1/reviews/{review['id']}/comments")).json()
    assert len(listed) == 2
    # guest sees the designer's reply too
    guest_view = (
        await client.get(f"/api/v1/r/{review['slug']}/comments", headers=_h(token))
    ).json()
    assert {c["body"] for c in guest_view} == {"top-level", "On it"}


# --- cross-review token rejection -------------------------------------------


async def test_cross_review_token_rejected(client, auth, session_factory):
    # one pro user, two projects -> two independent reviews
    user = await make_user(session_factory, "pro")
    auth.user = user
    p1 = await make_project(session_factory, user, name="P1")
    p2 = await make_project(session_factory, user, name="P2")
    rev_a = (await client.post(f"/api/v1/projects/{p1.id}/reviews", json={})).json()
    rev_b = (await client.post(f"/api/v1/projects/{p2.id}/reviews", json={})).json()

    token_a = await _guest_token(client, auth, rev_a["slug"])

    auth.user = None
    # token from review A cannot post to review B
    r = await client.post(
        f"/api/v1/r/{rev_b['slug']}/comments",
        headers=_h(token_a),
        json={"body": "x", "page_url": PAGE},
    )
    assert r.status_code == 403
    # ...but works on its own review
    ok = await client.post(
        f"/api/v1/r/{rev_a['slug']}/comments",
        headers=_h(token_a),
        json={"body": "x", "page_url": PAGE},
    )
    assert ok.status_code == 201


# --- guest visibility (sees all, is_mine flags own) -------------------------


async def test_guest_sees_all_with_is_mine(client, auth, session_factory):
    user, _, review = await _setup_review(client, auth, session_factory)
    slug = review["slug"]
    token_a = await _guest_token(client, auth, slug, name="Alice")
    token_b = await _guest_token(client, auth, slug, name="Bob")

    auth.user = None
    await client.post(
        f"/api/v1/r/{slug}/comments",
        headers=_h(token_a),
        json={"body": "from A", "page_url": PAGE},
    )
    await client.post(
        f"/api/v1/r/{slug}/comments",
        headers=_h(token_b),
        json={"body": "from B", "page_url": PAGE},
    )

    view_a = (
        await client.get(f"/api/v1/r/{slug}/comments", headers=_h(token_a))
    ).json()
    mine = {c["body"]: c["is_mine"] for c in view_a}
    assert mine == {"from A": True, "from B": False}
    # author names surface for the designer's benefit
    names = {c["body"]: c["author_name"] for c in view_a}
    assert names == {"from A": "Alice", "from B": "Bob"}


# --- designer filtering + ownership + soft delete ---------------------------


async def test_project_comments_status_filter(client, auth, session_factory):
    user, project, review = await _setup_review(client, auth, session_factory)
    token = await _guest_token(client, auth, review["slug"])
    auth.user = None
    ids = []
    for _ in range(2):
        ids.append(
            (
                await client.post(
                    f"/api/v1/r/{review['slug']}/comments",
                    headers=_h(token),
                    json={"body": "c", "page_url": PAGE},
                )
            ).json()["id"]
        )

    auth.user = user
    await client.patch(f"/api/v1/comments/{ids[0]}", json={"status": "resolved"})

    resolved = (
        await client.get(f"/api/v1/projects/{project.id}/comments?status=resolved")
    ).json()
    assert [c["id"] for c in resolved] == [ids[0]]
    open_only = (
        await client.get(f"/api/v1/projects/{project.id}/comments?status=open")
    ).json()
    assert [c["id"] for c in open_only] == [ids[1]]


async def test_comment_ownership_scoping(client, auth, session_factory):
    owner, project, review = await _setup_review(client, auth, session_factory)
    token = await _guest_token(client, auth, review["slug"])
    auth.user = None
    cid = (
        await client.post(
            f"/api/v1/r/{review['slug']}/comments",
            headers=_h(token),
            json={"body": "c", "page_url": PAGE},
        )
    ).json()["id"]

    other = await make_user(session_factory, "free")
    auth.user = other
    assert (
        await client.patch(f"/api/v1/comments/{cid}", json={"status": "resolved"})
    ).status_code == 404
    assert (await client.delete(f"/api/v1/comments/{cid}")).status_code == 404
    assert (
        await client.post(f"/api/v1/comments/{cid}/reply", json={"body": "x"})
    ).status_code == 404
    assert (
        await client.get(f"/api/v1/projects/{project.id}/comments")
    ).status_code == 404
    assert (
        await client.get(f"/api/v1/reviews/{review['id']}/comments")
    ).status_code == 404


async def test_soft_delete_excludes_comment(client, auth, session_factory):
    import uuid

    from sqlalchemy import select

    user, _, review = await _setup_review(client, auth, session_factory)
    token = await _guest_token(client, auth, review["slug"])
    auth.user = None
    cid = (
        await client.post(
            f"/api/v1/r/{review['slug']}/comments",
            headers=_h(token),
            json={"body": "bye", "page_url": PAGE},
        )
    ).json()["id"]

    auth.user = user
    assert (await client.delete(f"/api/v1/comments/{cid}")).status_code == 204
    assert (await client.get(f"/api/v1/reviews/{review['id']}/comments")).json() == []

    # row still present with deleted_at set
    async with session_factory() as s:
        row = await s.scalar(select(Comment).where(Comment.id == uuid.UUID(cid)))
        assert row is not None and row.deleted_at is not None
