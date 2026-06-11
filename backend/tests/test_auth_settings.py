"""Settings-surface auth tests: PATCH /auth/me (profile) and
POST /auth/change-password (verify current, hash new, generic 401)."""

from __future__ import annotations

import pytest
from sqlalchemy import select

from app.core import security
from app.models.user import User
from tests.conftest import make_user

pytestmark = pytest.mark.asyncio

ME = "/api/v1/auth/me"
CHANGE_PASSWORD = "/api/v1/auth/change-password"


# --- PATCH /auth/me -----------------------------------------------------------


async def test_update_full_name(client, auth, session_factory):
    auth.user = await make_user(session_factory)
    r = await client.patch(ME, json={"full_name": "New Name"})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["full_name"] == "New Name"
    assert body["email"] == auth.user.email
    assert "hashed_password" not in body

    # persisted (checked via DB — GET /me under the test override returns the
    # fixture's detached user object, not a fresh row)
    async with session_factory() as s:
        row = await s.scalar(select(User).where(User.id == auth.user.id))
        assert row.full_name == "New Name"


async def test_update_me_rejects_email_change(client, auth, session_factory):
    auth.user = await make_user(session_factory)
    r = await client.patch(
        ME, json={"email": "other@test.co", "full_name": "X"}
    )
    assert r.status_code == 400
    # same email is a no-op, not an error
    ok = await client.patch(
        ME, json={"email": auth.user.email, "full_name": "Kept"}
    )
    assert ok.status_code == 200
    assert ok.json()["full_name"] == "Kept"


async def test_update_me_rejects_password_field(client, auth, session_factory):
    auth.user = await make_user(session_factory)
    r = await client.patch(ME, json={"password": "newpassword123"})
    assert r.status_code == 400


# --- POST /auth/change-password ------------------------------------------------


async def test_change_password_happy_path(client, auth, session_factory):
    auth.user = await make_user(session_factory, password="originalpass1")
    r = await client.post(
        CHANGE_PASSWORD,
        json={"current_password": "originalpass1", "new_password": "freshpass99"},
    )
    assert r.status_code == 200, r.text

    async with session_factory() as s:
        row = await s.scalar(select(User).where(User.id == auth.user.id))
        assert security.verify_password("freshpass99", row.hashed_password)
        assert not security.verify_password("originalpass1", row.hashed_password)


async def test_change_password_wrong_current_is_generic_401(
    client, auth, session_factory
):
    auth.user = await make_user(session_factory, password="originalpass1")
    r = await client.post(
        CHANGE_PASSWORD,
        json={"current_password": "wrong-guess", "new_password": "freshpass99"},
    )
    assert r.status_code == 401
    # generic: no hint about users/emails/which field failed
    assert r.json()["detail"] == "Incorrect password"

    # password unchanged
    async with session_factory() as s:
        row = await s.scalar(select(User).where(User.id == auth.user.id))
        assert security.verify_password("originalpass1", row.hashed_password)


async def test_change_password_validates_new_length(client, auth, session_factory):
    auth.user = await make_user(session_factory, password="originalpass1")
    r = await client.post(
        CHANGE_PASSWORD,
        json={"current_password": "originalpass1", "new_password": "short"},
    )
    assert r.status_code == 422
