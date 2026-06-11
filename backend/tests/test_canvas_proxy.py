"""Canvas proxy tests: pin-agent script injection, the guest page-rendering
endpoint's slug rules (404/410/403), and same-host path validation."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from app.services import proxy_service
from tests.conftest import make_project, make_user

# asyncio_mode=auto (pyproject) runs the async tests; the script-injection tests
# below are intentionally synchronous pure-function checks.

PAGE_URL = "https://staging.example.com/about"


# --- script injection (pure function) ---------------------------------------


def test_agent_injected_before_body_when_requested():
    html = "<html><head></head><body><h1>Hi</h1></body></html>"
    out = proxy_service.rewrite_html(html, PAGE_URL, inject_agent=True)
    assert "<script>" in out
    assert "rd:ready" in out and "rd:render-pins" in out
    # injected before </body>
    assert out.index("rd:ready") < out.lower().rindex("</body>")
    # the real page URL is embedded for the agent
    assert PAGE_URL in out


def test_meta_csp_stripped_so_agent_runs():
    html = (
        '<html><head><meta http-equiv="Content-Security-Policy" '
        "content=\"script-src 'self'\"></head><body></body></html>"
    )
    out = proxy_service.rewrite_html(html, PAGE_URL, inject_agent=True)
    assert "Content-Security-Policy" not in out
    assert "rd:ready" in out  # the agent still injected


def test_agent_not_injected_by_default():
    html = "<html><body><h1>Hi</h1></body></html>"
    out = proxy_service.rewrite_html(html, PAGE_URL)
    assert "rd:ready" not in out


def test_agent_includes_region_selection():
    """The injected agent carries the drag-to-select region system: the rd:click
    region payload fields, the dim overlay, and the focused-region rectangle."""
    html = "<html><body></body></html>"
    out = proxy_service.rewrite_html(html, PAGE_URL, inject_agent=True)
    for marker in (
        "regionWidth",
        "regionHeight",
        "regionWidthPercent",
        "regionHeightPercent",
        "data-rd-overlay",  # drag dim overlay
        "data-rd-region",   # focused-pin region rectangle
        "data-rd-mode",     # crosshair / user-select suppression hook
    ):
        assert marker in out, marker


def test_agent_script_url_injection_hardened():
    # A hostile final_url (e.g. via a crafted redirect) must not break out of
    # the injected <script> via </script> in the embedded page URL.
    evil = "https://x/</script><script>alert(1)</script>/p"
    out = proxy_service.rewrite_html(
        "<html><body></body></html>", evil, inject_agent=True
    )
    assert "</script><script>alert(1)" not in out  # no breakout
    assert "\\u003c/script>" in out  # the '<' was escaped in the embedded URL


def test_agent_script_not_html_escaped():
    out = proxy_service.rewrite_html(
        "<html><body></body></html>", PAGE_URL, inject_agent=True
    )
    start = out.index("<script>")
    script = out[start : out.index("</script>", start)]
    # JS operators must survive verbatim (no entity-escaping of < > &).
    assert "e.source !== parentWin" in script
    assert "&lt;" not in script and "&gt;" not in script and "&amp;" not in script


# --- guest page endpoint ----------------------------------------------------


async def _make_review(client, auth, session_factory):
    user = await make_user(session_factory, "free")
    auth.user = user
    project = await make_project(session_factory, user)
    review = (
        await client.post(f"/api/v1/projects/{project.id}/reviews", json={})
    ).json()
    return user, project, review


def _stub_fetch(monkeypatch):
    """Replace the network fetch; record the target URL it was asked to load."""
    calls: list[str] = []

    async def fake(url, **_kwargs):
        calls.append(url)
        return proxy_service.ProxiedPage(
            content=b"<html><body>ok</body></html>",
            status_code=200,
            content_type="text/html; charset=utf-8",
            final_url=url,
            is_html=True,
        )

    monkeypatch.setattr(proxy_service, "fetch_and_rewrite", fake)
    return calls


async def test_guest_page_unknown_slug_404(client, auth, session_factory):
    auth.user = None
    r = await client.get("/api/v1/r/missing00/page")
    assert r.status_code == 404


async def test_guest_page_expired_410(client, auth, session_factory):
    user, _, review = await _make_review(client, auth, session_factory)
    past = (datetime.now(timezone.utc) - timedelta(days=1)).isoformat()
    await client.patch(f"/api/v1/reviews/{review['id']}", json={"expires_at": past})
    auth.user = None
    r = await client.get(f"/api/v1/r/{review['slug']}/page")
    assert r.status_code == 410


async def test_guest_page_inactive_403(client, auth, session_factory):
    user, _, review = await _make_review(client, auth, session_factory)
    await client.patch(f"/api/v1/reviews/{review['id']}", json={"is_active": False})
    auth.user = None
    r = await client.get(f"/api/v1/r/{review['slug']}/page")
    assert r.status_code == 403


async def test_guest_page_rejects_cross_host_path(
    client, auth, session_factory, monkeypatch
):
    calls = _stub_fetch(monkeypatch)
    _user, _project, review = await _make_review(client, auth, session_factory)
    auth.user = None
    r = await client.get(
        f"/api/v1/r/{review['slug']}/page", params={"path": "https://evil.com/x"}
    )
    assert r.status_code == 400
    assert calls == []  # never fetched the off-host URL


async def test_guest_page_success_same_host(client, auth, session_factory, monkeypatch):
    calls = _stub_fetch(monkeypatch)
    _user, _project, review = await _make_review(client, auth, session_factory)
    auth.user = None
    r = await client.get(f"/api/v1/r/{review['slug']}/page", params={"path": "/about"})
    assert r.status_code == 200
    assert b"ok" in r.content
    # same-host path joined onto the project URL
    assert calls == ["https://staging.example.com/about"]
    # served with the sandbox CSP (opaque origin) + frame-ancestors lock
    csp = r.headers["content-security-policy"]
    assert csp.startswith("sandbox allow-scripts")
    assert "allow-same-origin" not in csp
    assert "frame-ancestors" in csp


async def test_guest_page_default_path_loads_project_url(
    client, auth, session_factory, monkeypatch
):
    calls = _stub_fetch(monkeypatch)
    _user, _project, review = await _make_review(client, auth, session_factory)
    auth.user = None
    r = await client.get(f"/api/v1/r/{review['slug']}/page")
    assert r.status_code == 200
    assert calls == ["https://staging.example.com"]
