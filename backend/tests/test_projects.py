"""Project API tests: ownership scoping, free-plan limits, soft delete."""

from __future__ import annotations

import pytest

from app.models.project import Project
from tests.conftest import make_project, make_user

pytestmark = pytest.mark.asyncio

API = "/api/v1/projects"


async def test_create_and_list(client, auth, session_factory):
    auth.user = await make_user(session_factory, "free")
    r = await client.post(
        API, json={"name": "Acme", "url": "https://acme.test", "client_name": "Acme"}
    )
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["name"] == "Acme"
    assert body["status"] == "active"
    assert "user_id" not in body  # owner id must not leak

    listed = await client.get(API)
    assert listed.status_code == 200
    assert len(listed.json()) == 1


async def test_invalid_url_rejected(client, auth, session_factory):
    auth.user = await make_user(session_factory, "free")
    r = await client.post(API, json={"name": "Bad", "url": "not-a-url"})
    assert r.status_code == 422


async def test_ownership_scoping(client, auth, session_factory):
    owner = await make_user(session_factory, "free")
    other = await make_user(session_factory, "free")
    project = await make_project(session_factory, owner)

    auth.user = other
    assert (await client.get(f"{API}/{project.id}")).status_code == 404
    assert (
        await client.patch(f"{API}/{project.id}", json={"name": "hijack"})
    ).status_code == 404
    assert (await client.delete(f"{API}/{project.id}")).status_code == 404

    auth.user = owner
    assert (await client.get(f"{API}/{project.id}")).status_code == 200


async def test_free_plan_active_project_limit(client, auth, session_factory):
    auth.user = await make_user(session_factory, "free")
    assert (
        await client.post(API, json={"name": "1", "url": "https://a.test"})
    ).status_code == 201
    assert (
        await client.post(API, json={"name": "2", "url": "https://b.test"})
    ).status_code == 201
    # third active project is blocked
    third = await client.post(API, json={"name": "3", "url": "https://c.test"})
    assert third.status_code == 403

    # archiving one frees a slot
    pid = (await client.get(API)).json()[0]["id"]
    assert (
        await client.patch(f"{API}/{pid}", json={"status": "archived"})
    ).status_code == 200
    assert (
        await client.post(API, json={"name": "4", "url": "https://d.test"})
    ).status_code == 201


async def test_reactivating_archived_respects_limit(client, auth, session_factory):
    user = auth.user = await make_user(session_factory, "free")
    archived = await make_project(session_factory, user, name="old", status="archived")
    # two active projects exist
    await client.post(API, json={"name": "a", "url": "https://a.test"})
    await client.post(API, json={"name": "b", "url": "https://b.test"})
    # un-archiving the third would exceed the active limit
    r = await client.patch(f"{API}/{archived.id}", json={"status": "active"})
    assert r.status_code == 403


async def test_pro_plan_has_no_project_limit(client, auth, session_factory):
    auth.user = await make_user(session_factory, "pro")
    for i in range(4):
        r = await client.post(API, json={"name": str(i), "url": f"https://x{i}.test"})
        assert r.status_code == 201


async def test_soft_delete_only(client, auth, session_factory):
    user = auth.user = await make_user(session_factory, "free")
    project = await make_project(session_factory, user)

    assert (await client.delete(f"{API}/{project.id}")).status_code == 204
    assert (await client.get(f"{API}/{project.id}")).status_code == 404
    assert (await client.get(API)).json() == []

    # row still present with deleted_at set (never hard-deleted)
    async with session_factory() as s:
        row = await s.get(Project, project.id)
        assert row is not None
        assert row.deleted_at is not None
