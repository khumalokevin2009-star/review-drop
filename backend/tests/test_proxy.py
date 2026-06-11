"""Tests for the proxy service + endpoint (CLAUDE.md Sections 9, 13, 14).

Covers URL rewriting, SSRF blocking (incl. DNS-rebind pinning), header
stripping / CSP sandbox at the route, redirect re-validation, encoding,
ownership gate, and rate limiting.
"""

from __future__ import annotations

import ipaddress
import uuid

import httpx
import pytest

from app.services import proxy_service
from app.services.proxy_service import (
    BlockedURLError,
    ProxyError,
    fetch_and_rewrite,
    rewrite_html,
    validate_target_url,
)

BASE = "https://example.com/blog/post/"


def _patch_dns(monkeypatch, mapping: dict[str, list[str]]) -> None:
    """Force hostname resolution to return fixed IPs (no real network)."""

    async def fake_resolve(host: str) -> list[str]:
        if host in mapping:
            return mapping[host]
        raise proxy_service.ProxyError(f"Could not resolve host '{host}'", 502)

    monkeypatch.setattr(proxy_service, "_resolve_host", fake_resolve)


def _transport(handler) -> httpx.MockTransport:
    return httpx.MockTransport(handler)


# ===========================================================================
# URL rewriting
# ===========================================================================


def test_rewrite_relative_src_and_href():
    html = '<img src="/img/logo.png"><a href="../about.html">About</a>'
    out = rewrite_html(html, BASE)
    assert 'src="https://example.com/img/logo.png"' in out
    assert 'href="https://example.com/blog/about.html"' in out


def test_rewrite_action_formaction_data_src_poster():
    html = (
        '<form action="submit"></form>'
        '<button formaction="save">x</button>'
        '<img data-src="lazy.jpg">'
        '<video poster="thumb.png"></video>'
    )
    out = rewrite_html(html, BASE)
    assert 'action="https://example.com/blog/post/submit"' in out
    assert 'formaction="https://example.com/blog/post/save"' in out
    assert 'data-src="https://example.com/blog/post/lazy.jpg"' in out
    assert 'poster="https://example.com/blog/post/thumb.png"' in out


def test_rewrite_object_data():
    out = rewrite_html('<object data="doc.pdf"></object>', BASE)
    assert 'data="https://example.com/blog/post/doc.pdf"' in out


def test_rewrite_srcset_multiple_candidates():
    html = '<img srcset="small.jpg 480w, /big.jpg 1080w">'
    out = rewrite_html(html, BASE)
    assert "https://example.com/blog/post/small.jpg 480w" in out
    assert "https://example.com/big.jpg 1080w" in out


def test_rewrite_imagesrcset():
    html = '<link rel="preload" as="image" imagesrcset="/a.png 1x, b.png 2x">'
    out = rewrite_html(html, BASE)
    assert "https://example.com/a.png 1x" in out
    assert "https://example.com/blog/post/b.png 2x" in out


def test_srcset_with_data_uri_candidate_not_corrupted():
    # data: URI contains a comma but is one candidate; must survive intact.
    html = '<img srcset="data:image/png;base64,AAAA 1x, /real.png 2x">'
    out = rewrite_html(html, BASE)
    assert "data:image/png;base64,AAAA 1x" in out
    assert "https://example.com/real.png 2x" in out
    assert "example.com/blog/post/AAAA" not in out  # the bug we fixed


def test_rewrite_inline_style_and_style_block():
    html = (
        '<div style="background:url(bg.png)"></div>'
        "<style>.x{background:url('/a/c.png')} @import \"base.css\";</style>"
    )
    out = rewrite_html(html, BASE)
    assert "url(https://example.com/blog/post/bg.png)" in out
    assert "url('https://example.com/a/c.png')" in out
    assert '@import "https://example.com/blog/post/base.css"' in out


def test_css_url_with_paren_inside_quotes():
    html = "<style>.x{background:url('img(1).png')}</style>"
    out = rewrite_html(html, BASE)
    assert "url('https://example.com/blog/post/img(1).png')" in out


def test_absolute_urls_and_anchors_untouched():
    html = (
        '<a href="https://other.com/x">ext</a>'
        '<a href="#section">jump</a>'
        '<img src="data:image/png;base64,AAAA">'
        '<a href="mailto:a@b.com">mail</a>'
    )
    out = rewrite_html(html, BASE)
    assert 'href="https://other.com/x"' in out
    assert 'href="#section"' in out
    assert "data:image/png;base64,AAAA" in out
    assert 'href="mailto:a@b.com"' in out


def test_protocol_relative_url_made_absolute():
    out = rewrite_html('<script src="//cdn.example.com/app.js"></script>', BASE)
    assert 'src="https://cdn.example.com/app.js"' in out


def test_query_string_entities_not_corrupted():
    # html5lib (unlike html.parser) must NOT decode &copy= inside an href.
    out = rewrite_html('<a href="/p?a=1&copy=2&reg=3">x</a>', BASE)
    assert "copy=2" in out
    assert "©" not in out


def test_base_tag_changes_resolution_and_is_removed():
    html = '<head><base href="https://cdn.example.com/v2/"></head><body><img src="x.png"></body>'
    out = rewrite_html(html, BASE)
    assert 'src="https://cdn.example.com/v2/x.png"' in out
    assert "<base" not in out


def test_script_body_is_not_rewritten():
    html = '<script>var u = "/api/data"; el.src = "/foo.js";</script>'
    out = rewrite_html(html, BASE)
    assert '"/api/data"' in out
    assert '"/foo.js"' in out
    assert "example.com/api/data" not in out


def test_meta_refresh_url_rewritten():
    html = '<meta http-equiv="refresh" content="5; url=/next">'
    out = rewrite_html(html, BASE)
    assert "https://example.com/next" in out


# ===========================================================================
# SSRF blocking
# ===========================================================================


@pytest.mark.asyncio
async def test_block_non_http_schemes():
    for url in ("file:///etc/passwd", "ftp://example.com", "gopher://x"):
        with pytest.raises(BlockedURLError):
            await validate_target_url(url)


@pytest.mark.asyncio
async def test_block_literal_private_and_loopback_ips():
    for url in (
        "http://127.0.0.1/",
        "http://10.0.0.5/",
        "http://192.168.1.1/",
        "http://172.16.0.1/",
        "http://169.254.169.254/latest/meta-data/",  # cloud metadata
        "http://0.0.0.0/",
        "http://[::1]/",
        "http://100.64.0.1/",  # CGNAT
    ):
        with pytest.raises(BlockedURLError):
            await validate_target_url(url)


@pytest.mark.asyncio
async def test_block_ipv6_embedded_private_ipv4_forms():
    for url in (
        "http://[::ffff:127.0.0.1]/",  # IPv4-mapped
        "http://[::ffff:10.0.0.1]/",  # IPv4-mapped private
        "http://[::127.0.0.1]/",  # IPv4-compatible (deprecated)
        "http://[64:ff9b::7f00:1]/",  # NAT64 -> 127.0.0.1
    ):
        with pytest.raises(BlockedURLError):
            await validate_target_url(url)


@pytest.mark.asyncio
async def test_block_link_local_and_ula_ipv6():
    for url in ("http://[fe80::1]/", "http://[fc00::1]/"):
        with pytest.raises(BlockedURLError):
            await validate_target_url(url)


@pytest.mark.asyncio
async def test_block_blocked_ports(monkeypatch):
    _patch_dns(monkeypatch, {"example.com": ["93.184.216.34"]})
    for url in (
        "http://example.com:22/",
        "http://example.com:6379/",
        "http://example.com:3306/",
    ):
        with pytest.raises(BlockedURLError):
            await validate_target_url(url)


@pytest.mark.asyncio
async def test_allow_nonstandard_web_port(monkeypatch):
    _patch_dns(monkeypatch, {"staging.example.com": ["93.184.216.34"]})
    await validate_target_url("http://staging.example.com:3000/")  # no raise


@pytest.mark.asyncio
async def test_block_hostname_resolving_to_private(monkeypatch):
    _patch_dns(monkeypatch, {"evil.internal": ["10.0.0.99"]})
    with pytest.raises(BlockedURLError):
        await validate_target_url("http://evil.internal/")


@pytest.mark.asyncio
async def test_block_dns_rebind_any_private_record(monkeypatch):
    # Public + private records => blocked (every record must be public).
    _patch_dns(monkeypatch, {"rebind.com": ["93.184.216.34", "127.0.0.1"]})
    with pytest.raises(BlockedURLError):
        await validate_target_url("http://rebind.com/")


@pytest.mark.asyncio
async def test_allow_public_host(monkeypatch):
    _patch_dns(monkeypatch, {"example.com": ["93.184.216.34"]})
    await validate_target_url("https://example.com/page")  # no raise


@pytest.mark.asyncio
async def test_block_decimal_ip_encoding(monkeypatch):
    # http://2130706433/ == 127.0.0.1; resolver normalises it.
    _patch_dns(monkeypatch, {"2130706433": ["127.0.0.1"]})
    with pytest.raises(BlockedURLError):
        await validate_target_url("http://2130706433/")


def test_ip_is_blocked_helper():
    blocked = ["10.0.0.1", "169.254.169.254", "0.0.0.0", "::1", "fe80::1", "fc00::1"]
    for s in blocked:
        assert proxy_service._ip_is_blocked(ipaddress.ip_address(s)), s
    for s in ["93.184.216.34", "2606:4700:4700::1111"]:
        assert not proxy_service._ip_is_blocked(ipaddress.ip_address(s)), s


# ===========================================================================
# Fetch path: IP pinning, header stripping, redirects, caps, encoding
# ===========================================================================


@pytest.mark.asyncio
async def test_connection_pinned_to_validated_ip(monkeypatch):
    """DNS-rebind defence: the connection must target the validated IP, while
    Host + SNI carry the real hostname."""
    _patch_dns(monkeypatch, {"example.com": ["93.184.216.34"]})
    seen = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["host"] = request.url.host
        seen["host_header"] = request.headers.get("host")
        seen["sni"] = request.extensions.get("sni_hostname")
        return httpx.Response(
            200, headers={"content-type": "text/html"}, text="<html>ok</html>"
        )

    page = await fetch_and_rewrite(
        "https://example.com/p", transport=_transport(handler)
    )
    assert seen["host"] == "93.184.216.34"  # connected to the validated IP
    assert seen["host_header"] == "example.com"
    assert seen["sni"] == "example.com"
    assert page.final_url == "https://example.com/p"  # rewriting uses real host


@pytest.mark.asyncio
async def test_fetch_html_rewritten(monkeypatch):
    _patch_dns(monkeypatch, {"example.com": ["93.184.216.34"]})

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            headers={
                "content-type": "text/html; charset=utf-8",
                "x-frame-options": "DENY",
                "content-security-policy": "frame-ancestors 'none'",
            },
            text='<html><body><img src="/a.png"></body></html>',
        )

    page = await fetch_and_rewrite(
        "https://example.com/", transport=_transport(handler)
    )
    assert page.is_html
    assert b"https://example.com/a.png" in page.content
    assert page.content_type == "text/html; charset=utf-8"


@pytest.mark.asyncio
async def test_redirect_followed_and_revalidated(monkeypatch):
    _patch_dns(
        monkeypatch,
        {"example.com": ["93.184.216.34"], "final.com": ["93.184.216.35"]},
    )

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.host == "93.184.216.34":
            return httpx.Response(302, headers={"location": "https://final.com/done"})
        return httpx.Response(
            200, headers={"content-type": "text/html"}, text="<html>ok</html>"
        )

    page = await fetch_and_rewrite(
        "https://example.com/start", transport=_transport(handler)
    )
    assert page.final_url == "https://final.com/done"
    assert b"ok" in page.content


@pytest.mark.asyncio
async def test_restrict_to_host_blocks_offhost_redirect(monkeypatch):
    _patch_dns(
        monkeypatch,
        {"example.com": ["93.184.216.34"], "evil.com": ["93.184.216.35"]},
    )

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.host == "93.184.216.34":
            return httpx.Response(302, headers={"location": "https://evil.com/x"})
        return httpx.Response(
            200, headers={"content-type": "text/html"}, text="<html>ok</html>"
        )

    with pytest.raises(BlockedURLError):
        await fetch_and_rewrite(
            "https://example.com/",
            transport=_transport(handler),
            restrict_to_host="example.com",
        )


@pytest.mark.asyncio
async def test_restrict_to_host_allows_samehost_redirect(monkeypatch):
    _patch_dns(monkeypatch, {"example.com": ["93.184.216.34"]})

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/":
            return httpx.Response(
                302, headers={"location": "https://example.com/final"}
            )
        return httpx.Response(
            200, headers={"content-type": "text/html"}, text="<html>ok</html>"
        )

    page = await fetch_and_rewrite(
        "https://example.com/",
        transport=_transport(handler),
        restrict_to_host="example.com",
    )
    assert b"ok" in page.content


@pytest.mark.asyncio
async def test_redirect_to_private_ip_blocked(monkeypatch):
    _patch_dns(monkeypatch, {"example.com": ["93.184.216.34"]})

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(302, headers={"location": "http://169.254.169.254/"})

    with pytest.raises(BlockedURLError):
        await fetch_and_rewrite("https://example.com/", transport=_transport(handler))


@pytest.mark.asyncio
async def test_timeout_maps_to_proxy_error(monkeypatch):
    _patch_dns(monkeypatch, {"example.com": ["93.184.216.34"]})

    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectTimeout("slow", request=request)

    with pytest.raises(ProxyError) as exc:
        await fetch_and_rewrite("https://example.com/", transport=_transport(handler))
    assert exc.value.status_code == 504


@pytest.mark.asyncio
async def test_total_time_budget_enforced(monkeypatch):
    import asyncio

    monkeypatch.setattr(proxy_service, "MAX_TOTAL_SECONDS", 0.2)

    async def slow_resolve(host: str) -> list[str]:
        await asyncio.sleep(5)
        return ["93.184.216.34"]

    monkeypatch.setattr(proxy_service, "_resolve_host", slow_resolve)

    def handler(request: httpx.Request) -> httpx.Response:  # never reached
        return httpx.Response(200, text="x")

    with pytest.raises(ProxyError) as exc:
        await fetch_and_rewrite("https://example.com/", transport=_transport(handler))
    assert exc.value.status_code == 504


@pytest.mark.asyncio
async def test_response_size_cap(monkeypatch):
    _patch_dns(monkeypatch, {"example.com": ["93.184.216.34"]})
    monkeypatch.setattr(proxy_service, "MAX_RESPONSE_BYTES", 1024)
    big = b"<html>" + b"a" * 5000 + b"</html>"

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, headers={"content-type": "text/html"}, content=big)

    with pytest.raises(ProxyError):
        await fetch_and_rewrite("https://example.com/", transport=_transport(handler))


@pytest.mark.asyncio
async def test_non_html_passes_through_untouched(monkeypatch):
    _patch_dns(monkeypatch, {"example.com": ["93.184.216.34"]})
    raw = b"\x89PNG\r\n\x1a\n"

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, headers={"content-type": "image/png"}, content=raw)

    page = await fetch_and_rewrite(
        "https://example.com/logo.png", transport=_transport(handler)
    )
    assert not page.is_html
    assert page.content == raw


@pytest.mark.asyncio
async def test_gzip_decoded_and_capped_on_decoded_size(monkeypatch):
    import gzip

    _patch_dns(monkeypatch, {"example.com": ["93.184.216.34"]})
    payload = gzip.compress(b"<html><body><img src='/a.png'></body></html>")

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            headers={"content-type": "text/html", "content-encoding": "gzip"},
            content=payload,
        )

    page = await fetch_and_rewrite(
        "https://example.com/", transport=_transport(handler)
    )
    assert b"https://example.com/a.png" in page.content


@pytest.mark.asyncio
async def test_too_many_redirects(monkeypatch):
    _patch_dns(monkeypatch, {"example.com": ["93.184.216.34"]})

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(302, headers={"location": "https://example.com/loop"})

    with pytest.raises(ProxyError):
        await fetch_and_rewrite("https://example.com/", transport=_transport(handler))


@pytest.mark.asyncio
async def test_non_utf8_encoding_decoded(monkeypatch):
    _patch_dns(monkeypatch, {"example.com": ["93.184.216.34"]})
    body = "<html><body>café</body></html>".encode("latin-1")

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            headers={"content-type": "text/html; charset=latin-1"},
            content=body,
        )

    page = await fetch_and_rewrite(
        "https://example.com/", transport=_transport(handler)
    )
    assert "café" in page.content.decode("utf-8")


# ===========================================================================
# Endpoint: auth/ownership gate, header stripping, CSP sandbox, rate limit
# ===========================================================================


class _FakeScalars:
    def __init__(self, rows):
        self._rows = rows

    def all(self):
        return self._rows


class _FakeResult:
    def __init__(self, rows):
        self._rows = rows

    def scalars(self):
        return _FakeScalars(self._rows)


class _FakeDB:
    def __init__(self, project_urls):
        self._urls = project_urls

    async def execute(self, *args, **kwargs):
        return _FakeResult(self._urls)


class _FakeUser:
    def __init__(self):
        self.id = uuid.uuid4()
        self.is_active = True
        self.deleted_at = None


@pytest.fixture
def client_factory():
    from fastapi.testclient import TestClient

    from app.api.deps import get_current_user, get_db
    from app.main import app

    created_users = []

    def make(project_urls):
        user = _FakeUser()
        created_users.append(user)

        async def _fake_db():
            yield _FakeDB(project_urls)

        app.dependency_overrides[get_db] = _fake_db
        app.dependency_overrides[get_current_user] = lambda: user
        return TestClient(app), user

    yield make
    app.dependency_overrides.clear()


def _stub_fetch(monkeypatch, *, raises=None):
    from app.services import proxy_service as ps

    async def fake_fetch(url, **kwargs):
        if raises is not None:
            raise raises
        return ps.ProxiedPage(
            content=b"<html>ok</html>",
            status_code=200,
            content_type="text/html; charset=utf-8",
            final_url=url,
            is_html=True,
        )

    monkeypatch.setattr(ps, "fetch_and_rewrite", fake_fetch)


def test_endpoint_requires_auth():
    from fastapi.testclient import TestClient

    from app.main import app

    # No dependency overrides -> real auth -> 403 (no bearer token).
    client = TestClient(app)
    r = client.get("/api/v1/proxy", params={"url": "https://example.com"})
    assert r.status_code == 403


def test_endpoint_strips_frame_headers_and_sets_csp(monkeypatch, client_factory):
    _stub_fetch(monkeypatch)
    client, _ = client_factory(["https://staging.example.com"])
    r = client.get("/api/v1/proxy", params={"url": "https://staging.example.com/page"})
    assert r.status_code == 200
    csp = r.headers["content-security-policy"]
    assert "sandbox" in csp
    lower = {k.lower() for k in r.headers}
    assert "x-frame-options" not in lower
    assert r.headers["x-content-type-options"] == "nosniff"
    assert r.headers["referrer-policy"] == "no-referrer"


def test_endpoint_ownership_allows_matching_host_with_www(monkeypatch, client_factory):
    _stub_fetch(monkeypatch)
    client, _ = client_factory(["https://example.com"])
    r = client.get("/api/v1/proxy", params={"url": "https://www.example.com/page"})
    assert r.status_code == 200


def test_endpoint_ownership_forbids_unowned_host(monkeypatch, client_factory):
    _stub_fetch(monkeypatch)
    client, _ = client_factory(["https://staging.example.com"])
    r = client.get("/api/v1/proxy", params={"url": "https://evil.com/x"})
    assert r.status_code == 403


def test_endpoint_blocked_url_maps_to_400(monkeypatch, client_factory):
    from app.services.proxy_service import BlockedURLError as BUE

    _stub_fetch(monkeypatch, raises=BUE("blocked"))
    client, _ = client_factory(["https://staging.example.com"])
    r = client.get("/api/v1/proxy", params={"url": "https://staging.example.com/x"})
    assert r.status_code == 400


def test_endpoint_proxy_error_maps_to_status(monkeypatch, client_factory):
    from app.services.proxy_service import ProxyError as PE

    _stub_fetch(monkeypatch, raises=PE("upstream down", status_code=502))
    client, _ = client_factory(["https://staging.example.com"])
    r = client.get("/api/v1/proxy", params={"url": "https://staging.example.com/x"})
    assert r.status_code == 502


def test_endpoint_rate_limit_per_user(monkeypatch, client_factory):
    _stub_fetch(monkeypatch)
    client, _ = client_factory(["https://staging.example.com"])
    url = "https://staging.example.com/p"
    # 60/min allowed, 61st blocked (this fresh user has its own bucket).
    statuses = [
        client.get("/api/v1/proxy", params={"url": url}).status_code for _ in range(61)
    ]
    assert statuses[:60] == [200] * 60
    assert statuses[60] == 429
