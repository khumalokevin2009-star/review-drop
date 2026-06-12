"""Screenshot + storage tests (no real browser, no real R2).

Covers: storage backend selection and the local fallback, key safety,
capture_and_store failure isolation, SSRF refusal in capture(), the
POST /screenshots auth scoping, and the background-task wiring on project
creation and guest comment creation.
"""

from __future__ import annotations

import uuid

import pytest
from sqlalchemy import select

from app.core.config import settings
from app.services import screenshot_service, storage_service
from app.services.storage_service import (
    LocalStorage,
    R2Storage,
    StorageError,
    get_storage,
)
from tests.conftest import make_project, make_user

pytestmark = pytest.mark.asyncio

PAGE = "https://staging.example.com/about"


# --- storage backend selection ------------------------------------------------


async def test_local_backend_selected_without_r2(monkeypatch):
    monkeypatch.setattr(settings, "R2_ACCOUNT_ID", None)
    get_storage.cache_clear()
    try:
        assert isinstance(get_storage(), LocalStorage)
    finally:
        get_storage.cache_clear()


async def test_r2_backend_selected_when_configured(monkeypatch):
    monkeypatch.setattr(settings, "R2_ACCOUNT_ID", "acct123")
    monkeypatch.setattr(settings, "R2_ACCESS_KEY_ID", "key")
    monkeypatch.setattr(settings, "R2_SECRET_ACCESS_KEY", "secret")
    monkeypatch.setattr(settings, "R2_PUBLIC_URL", "https://pub-x.r2.dev")
    get_storage.cache_clear()
    try:
        assert isinstance(get_storage(), R2Storage)
    finally:
        get_storage.cache_clear()


async def test_local_storage_roundtrip(tmp_path):
    storage = LocalStorage(root=tmp_path)
    url = await storage.upload("thumbnails/abc/img.jpg", b"jpeg-bytes", "image/jpeg")
    assert url == f"{settings.BACKEND_URL.rstrip('/')}/storage/thumbnails/abc/img.jpg"
    assert (tmp_path / "thumbnails/abc/img.jpg").read_bytes() == b"jpeg-bytes"


@pytest.mark.parametrize("key", ["../evil.jpg", "/etc/passwd", "a/../../b", ""])
async def test_local_storage_rejects_unsafe_keys(tmp_path, key):
    storage = LocalStorage(root=tmp_path)
    with pytest.raises(StorageError):
        await storage.upload(key, b"x", "image/jpeg")


# --- capture_and_store failure isolation ---------------------------------------


async def test_capture_and_store_swallows_capture_failure(monkeypatch):
    async def boom(url):
        raise screenshot_service.ScreenshotError("nope")

    monkeypatch.setattr(screenshot_service, "capture", boom)
    assert await screenshot_service.capture_and_store(PAGE, "t") is None


async def test_capture_and_store_uploads_on_success(monkeypatch, tmp_path):
    async def fake_capture(url):
        return b"jpeg-bytes"

    monkeypatch.setattr(screenshot_service, "capture", fake_capture)
    monkeypatch.setattr(
        screenshot_service, "get_storage", lambda: LocalStorage(root=tmp_path)
    )
    url = await screenshot_service.capture_and_store(PAGE, "thumbnails/p1")
    assert url is not None and "/storage/thumbnails/p1/" in url


async def test_capture_refuses_internal_urls():
    # SSRF guard fires before any browser launches.
    with pytest.raises(screenshot_service.ScreenshotError):
        await screenshot_service.capture("http://127.0.0.1:8000/admin")
    with pytest.raises(screenshot_service.ScreenshotError):
        await screenshot_service.capture("http://192.168.1.1/")


# --- POST /screenshots auth scoping ---------------------------------------------


async def _fake_capture_and_store(url, key_prefix):
    return f"https://cdn.test/{key_prefix}/shot.jpg"


async def test_screenshot_endpoint_scoping(client, auth, session_factory, monkeypatch):
    monkeypatch.setattr(
        "app.api.routes.screenshots.capture_and_store", _fake_capture_and_store
    )
    user = await make_user(session_factory)
    auth.user = user
    await make_project(session_factory, user)  # url=https://staging.example.com

    # Own project host (any path, www-insensitive) -> allowed.
    ok = await client.post(
        "/api/v1/screenshots", json={"url": "https://www.staging.example.com/about"}
    )
    assert ok.status_code == 200, ok.text
    assert ok.json()["screenshot_url"].startswith("https://cdn.test/")

    # A host the caller has no project for -> refused.
    other = await client.post(
        "/api/v1/screenshots", json={"url": "https://evil.example.net/"}
    )
    assert other.status_code == 403

    # Another user's project host is NOT enough — scoping is per caller.
    stranger = await make_user(session_factory)
    auth.user = stranger
    denied = await client.post(
        "/api/v1/screenshots", json={"url": "https://staging.example.com/"}
    )
    assert denied.status_code == 403

    # Garbage URL -> 422.
    auth.user = user
    bad = await client.post("/api/v1/screenshots", json={"url": "not-a-url"})
    assert bad.status_code == 422


async def test_screenshot_endpoint_502_when_capture_fails(
    client, auth, session_factory, monkeypatch
):
    async def fails(url, key_prefix):
        return None

    monkeypatch.setattr("app.api.routes.screenshots.capture_and_store", fails)
    user = await make_user(session_factory)
    auth.user = user
    await make_project(session_factory, user)
    r = await client.post(
        "/api/v1/screenshots", json={"url": "https://staging.example.com/p"}
    )
    assert r.status_code == 502


# --- background-task wiring ------------------------------------------------------


async def test_project_create_fires_thumbnail_task(
    client, auth, session_factory, monkeypatch
):
    async def fake_cas(url, key_prefix):
        return "https://cdn.test/thumb.jpg"

    monkeypatch.setattr(screenshot_service, "capture_and_store", fake_cas)
    # The task opens its own session — point it at the test DB.
    monkeypatch.setattr(screenshot_service, "AsyncSessionLocal", session_factory)

    auth.user = await make_user(session_factory)
    created = await client.post(
        "/api/v1/projects", json={"name": "Shot", "url": "https://acme.test"}
    )
    assert created.status_code == 201
    # ASGITransport runs BackgroundTasks before returning, so it's visible now.
    fetched = await client.get(f"/api/v1/projects/{created.json()['id']}")
    assert fetched.json()["thumbnail_url"] == "https://cdn.test/thumb.jpg"


async def test_project_create_survives_capture_failure(
    client, auth, session_factory, monkeypatch
):
    async def fake_cas(url, key_prefix):
        return None  # capture failed

    monkeypatch.setattr(screenshot_service, "capture_and_store", fake_cas)
    monkeypatch.setattr(screenshot_service, "AsyncSessionLocal", session_factory)

    auth.user = await make_user(session_factory)
    created = await client.post(
        "/api/v1/projects", json={"name": "NoShot", "url": "https://acme.test"}
    )
    assert created.status_code == 201  # parent flow unaffected
    fetched = await client.get(f"/api/v1/projects/{created.json()['id']}")
    assert fetched.json()["thumbnail_url"] is None


async def test_guest_comment_fires_screenshot_task(
    client, auth, session_factory, monkeypatch
):
    from app.models.comment import Comment

    async def fake_cas(url, key_prefix):
        return "https://cdn.test/comment-shot.jpg"

    monkeypatch.setattr(screenshot_service, "capture_and_store", fake_cas)
    monkeypatch.setattr(screenshot_service, "AsyncSessionLocal", session_factory)

    user = await make_user(session_factory)
    auth.user = user
    project = await make_project(session_factory, user)
    review = (
        await client.post(f"/api/v1/projects/{project.id}/reviews", json={})
    ).json()
    auth.user = None
    token = (
        await client.post(
            f"/api/v1/r/{review['slug']}/session", json={"display_name": "Jane"}
        )
    ).json()["session_token"]
    created = await client.post(
        f"/api/v1/r/{review['slug']}/comments",
        headers={"X-Guest-Token": token},
        json={"body": "pin me", "page_url": PAGE},
    )
    assert created.status_code == 201

    async with session_factory() as s:
        row = await s.scalar(
            select(Comment).where(Comment.id == uuid.UUID(created.json()["id"]))
        )
        assert row.screenshot_url == "https://cdn.test/comment-shot.jpg"


async def test_guest_comment_off_host_page_url_not_captured(
    client, auth, session_factory, monkeypatch
):
    """A guest must not be able to use a review link as a screenshot service
    for arbitrary URLs: off-host page_urls skip capture entirely."""
    from app.models.comment import Comment

    captured: list[str] = []

    async def fake_cas(url, key_prefix):
        captured.append(url)
        return "https://cdn.test/should-not-happen.jpg"

    monkeypatch.setattr(screenshot_service, "capture_and_store", fake_cas)
    monkeypatch.setattr(screenshot_service, "AsyncSessionLocal", session_factory)

    user = await make_user(session_factory)
    auth.user = user
    project = await make_project(session_factory, user)
    review = (
        await client.post(f"/api/v1/projects/{project.id}/reviews", json={})
    ).json()
    auth.user = None
    token = (
        await client.post(
            f"/api/v1/r/{review['slug']}/session", json={"display_name": "Mal"}
        )
    ).json()["session_token"]
    created = await client.post(
        f"/api/v1/r/{review['slug']}/comments",
        headers={"X-Guest-Token": token},
        json={"body": "sneaky", "page_url": "https://unrelated.example.net/x"},
    )
    assert created.status_code == 201  # the comment itself is fine

    assert captured == []  # no capture attempted
    async with session_factory() as s:
        row = await s.scalar(
            select(Comment).where(Comment.id == uuid.UUID(created.json()["id"]))
        )
        assert row.screenshot_url is None
