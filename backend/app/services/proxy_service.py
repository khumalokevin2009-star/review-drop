"""Proxy service — the core of ReviewDrop's rendering pipeline.

Fetches a target staging site server-side, blocks SSRF attempts, pins the
validated IP into the connection (defeating DNS-rebinding), follows redirects
manually (re-validating every hop), rewrites relative URLs in the HTML so the
page renders correctly inside our iframe, and returns content ready to serve
without the target's frame-busting headers.

See CLAUDE.md Section 5 (Website Rendering), Section 9 (Proxy security),
Section 16 Phase 2.
"""

from __future__ import annotations

import asyncio
import codecs
import ipaddress
import re
import socket
from dataclasses import dataclass
from urllib.parse import urljoin, urlparse, urlunparse

import httpx
from bs4 import BeautifulSoup

FETCH_TIMEOUT_SECONDS = 10.0  # per network operation (connect/read/write)
MAX_TOTAL_SECONDS = (
    20.0  # overall wall-clock budget for the whole fetch (incl. redirects)
)
MAX_REDIRECTS = 5
MAX_RESPONSE_BYTES = 10 * 1024 * 1024  # cap on BOTH compressed and decoded bytes

ALLOWED_SCHEMES = {"http", "https"}
HTML_CONTENT_TYPES = ("text/html", "application/xhtml+xml")

# Browser-accurate HTML parsing: html5lib parses malformed markup the way the
# client's browser will, and (unlike html.parser) does NOT decode bare named
# entities like `&copy=` inside attribute values — which would corrupt query
# strings in URLs.
HTML_PARSER = "html5lib"

# Single-URL attributes (rewritten on any tag they appear on).
URL_ATTRS = ("src", "href", "action", "formaction", "data-src", "poster", "xlink:href")
# srcset-style candidate lists.
SRCSET_ATTRS = ("srcset", "data-srcset", "imagesrcset")
# URL values never rewritten. '#' covers in-page anchors and SVG same-document
# references (<use href="#icon">, url(#filter)).
_SKIP_PREFIXES = ("data:", "javascript:", "mailto:", "tel:", "blob:", "about:", "#")

_REDIRECT_STATUSES = {301, 302, 303, 307, 308}

# Non-web service ports we refuse to reach even on a public host the caller
# "owns" — defence-in-depth against using the proxy to hit co-located internal
# services (SSH, SMTP, databases, caches, container/orchestrator APIs, ...).
# Arbitrary high web ports (staging on :3000/:8080/...) remain allowed.
BLOCKED_PORTS = frozenset(
    {
        22,
        23,
        25,
        53,
        110,
        135,
        137,
        138,
        139,
        143,
        389,
        445,
        465,
        587,
        636,
        993,
        995,
        1433,
        1521,
        2049,
        2181,
        2375,
        2376,
        3306,
        3389,
        5432,
        5433,
        5984,
        6379,
        6443,
        7000,
        7001,
        8086,
        9042,
        9092,
        9200,
        9300,
        11211,
        27017,
        27018,
        27019,
        50000,
    }
)

_NAT64_PREFIX = ipaddress.ip_network("64:ff9b::/96")

# Plain Chrome UA: staging hosts (and WP security plugins) routinely block
# python/unknown user agents, and reliable rendering is the whole product.
# Accept-Encoding is restricted to gzip/deflate so httpx never negotiates
# brotli/zstd (whose decoded size we can't bound as easily).
_REQUEST_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36"
    ),
    "Accept": (
        "text/html,application/xhtml+xml,application/xml;q=0.9,"
        "image/avif,image/webp,*/*;q=0.8"
    ),
    "Accept-Language": "en-GB,en;q=0.9",
    "Accept-Encoding": "gzip, deflate",
}

# Test seam: when set, used as the transport for all fetches.
_DEFAULT_TRANSPORT: httpx.AsyncBaseTransport | None = None


class ProxyError(Exception):
    """Upstream fetch failed; maps to a 5xx from the proxy endpoint."""

    def __init__(self, detail: str, status_code: int = 502) -> None:
        super().__init__(detail)
        self.detail = detail
        self.status_code = status_code


class BlockedURLError(ProxyError):
    """URL refused by policy (bad scheme/port or SSRF); maps to a 400."""

    def __init__(self, detail: str) -> None:
        super().__init__(detail, status_code=400)


@dataclass
class ProxiedPage:
    content: bytes
    status_code: int
    content_type: str
    final_url: str
    is_html: bool


# --- SSRF protection ---------------------------------------------------------


def _embedded_ipv4(
    ip6: ipaddress.IPv6Address,
) -> ipaddress.IPv4Address | None:
    """Extract an embedded IPv4 address from an IPv6 address, covering the
    forms an attacker can use to smuggle a private IPv4 past a naive check:
    IPv4-mapped (::ffff:a.b.c.d), 6to4, Teredo, NAT64 (64:ff9b::/96), and the
    deprecated IPv4-compatible form (::a.b.c.d)."""
    if ip6.ipv4_mapped is not None:
        return ip6.ipv4_mapped
    if ip6.sixtofour is not None:
        return ip6.sixtofour
    if ip6.teredo is not None:
        return ip6.teredo[1]  # the embedded client IPv4
    if ip6 in _NAT64_PREFIX:
        return ipaddress.IPv4Address(int(ip6) & 0xFFFFFFFF)
    value = int(ip6)
    if 0 < value < (1 << 32):  # ::/96 IPv4-compatible (e.g. ::127.0.0.1)
        return ipaddress.IPv4Address(value)
    return None


def _ip_is_blocked(ip: ipaddress.IPv4Address | ipaddress.IPv6Address) -> bool:
    """True for anything that isn't a plain global unicast address.

    ``not is_global`` covers RFC-1918, loopback, link-local (incl. cloud
    metadata 169.254.169.254), CGNAT 100.64/10, ULA fc00::/7, unspecified,
    0.0.0.0/8, and reserved ranges. The multicast check catches globally
    routable multicast. For IPv6, any embedded IPv4 is validated too.
    """
    if isinstance(ip, ipaddress.IPv6Address):
        embedded = _embedded_ipv4(ip)
        if embedded is not None and _ip_is_blocked(embedded):
            return True
    return (not ip.is_global) or ip.is_multicast


async def _resolve_host(host: str) -> list[str]:
    """Resolve a hostname to all of its A/AAAA addresses."""
    loop = asyncio.get_running_loop()
    try:
        infos = await loop.getaddrinfo(host, None, type=socket.SOCK_STREAM)
    except socket.gaierror as exc:
        raise ProxyError(f"Could not resolve host '{host}'", status_code=502) from exc
    # Strip IPv6 zone IDs (fe80::1%en0) so ipaddress can parse them.
    return sorted({info[4][0].split("%")[0] for info in infos})


async def resolve_and_validate(url: str) -> str:
    """Validate a URL against SSRF policy and return a single validated IP to
    connect to.

    Blocks non-http(s) schemes, blocked ports, and any host that is — or
    resolves to — a private/loopback/link-local/non-global address. If a
    hostname has multiple DNS records, *every* one must be public (DNS-rebind
    defence). The returned IP is what the caller must connect to so that the
    address actually used is the one that was validated (no re-resolution).

    Raises ``BlockedURLError`` on policy violations, ``ProxyError`` on DNS
    failure.
    """
    parsed = urlparse(url)
    if parsed.scheme.lower() not in ALLOWED_SCHEMES:
        raise BlockedURLError("Only http(s) URLs can be proxied")
    host = parsed.hostname
    if not host:
        raise BlockedURLError("URL has no hostname")
    try:
        port = parsed.port
    except ValueError:
        raise BlockedURLError("URL has an invalid port") from None
    if port is not None and port in BLOCKED_PORTS:
        raise BlockedURLError("URL targets a blocked port")

    try:
        literal_ip = ipaddress.ip_address(host)
    except ValueError:
        literal_ip = None

    if literal_ip is not None:
        if _ip_is_blocked(literal_ip):
            raise BlockedURLError("URL points to a blocked address")
        return host

    # Not an IP literal: resolve and validate every record. Exotic encodings
    # (decimal/hex/octal like http://2130706433/) fall through to the resolver,
    # which normalises them to dotted quads we then validate.
    addrs = await _resolve_host(host)
    if not addrs:
        raise ProxyError(f"Could not resolve host '{host}'", status_code=502)
    for addr in addrs:
        if _ip_is_blocked(ipaddress.ip_address(addr)):
            raise BlockedURLError("URL resolves to a blocked address")
    # Prefer IPv4 for connectivity reliability.
    return sorted(addrs, key=lambda a: ipaddress.ip_address(a).version)[0]


async def validate_target_url(url: str) -> None:
    """Thin wrapper that raises if ``url`` is not proxyable (SSRF policy)."""
    await resolve_and_validate(url)


def _build_pinned_request(parsed, pinned_ip: str) -> tuple[str, str, str]:
    """Given a parsed URL and the validated IP to connect to, build the
    connection URL (host replaced by the literal IP, userinfo stripped), the
    ``Host`` header (real hostname + port), and the SNI hostname."""
    hostname = parsed.hostname
    port = parsed.port
    ip_netloc = f"[{pinned_ip}]" if ":" in pinned_ip else pinned_ip
    if port is not None:
        ip_netloc = f"{ip_netloc}:{port}"
    connect_url = urlunparse(
        (parsed.scheme, ip_netloc, parsed.path or "/", parsed.params, parsed.query, "")
    )
    host_disp = f"[{hostname}]" if ":" in hostname else hostname
    host_header = f"{host_disp}:{port}" if port is not None else host_disp
    return connect_url, host_header, hostname


# --- URL rewriting -----------------------------------------------------------


def _absolutize(value: str, base_url: str) -> str:
    """Resolve one URL value against ``base_url``, leaving non-URL schemes,
    fragments, and empty values untouched."""
    raw = value.strip()
    if not raw or raw.lower().startswith(_SKIP_PREFIXES):
        return value
    try:
        return urljoin(base_url, raw)
    except ValueError:
        return value


_SRCSET_WS = " \t\n\r\f"


def _rewrite_srcset(value: str, base_url: str) -> str:
    """Rewrite a srcset/imagesrcset candidate list.

    Follows the WHATWG srcset grammar: each candidate is a URL that runs up to
    the first whitespace, then an optional descriptor up to the next comma. A
    naive ``split(",")`` would shatter ``data:``/``blob:`` URIs (which contain
    a comma before any whitespace); this tokenizer preserves them.
    """
    out: list[str] = []
    pos, length = 0, len(value)
    while pos < length:
        # Skip leading whitespace and stray commas between candidates.
        while pos < length and value[pos] in _SRCSET_WS + ",":
            pos += 1
        if pos >= length:
            break
        # URL: up to the next whitespace.
        start = pos
        while pos < length and value[pos] not in _SRCSET_WS:
            pos += 1
        url_token = value[start:pos]
        if url_token.endswith(","):
            # Trailing commas terminate this candidate with no descriptor.
            url = url_token.rstrip(",")
            descriptor = ""
        else:
            url = url_token
            while pos < length and value[pos] in _SRCSET_WS:
                pos += 1
            desc_start = pos
            while pos < length and value[pos] != ",":
                pos += 1
            descriptor = value[desc_start:pos].strip()
            if pos < length:  # consume the comma
                pos += 1
        candidate = _absolutize(url, base_url)
        out.append(f"{candidate} {descriptor}".strip())
    return ", ".join(out)


# url(...) with an optional quote; quoted forms may contain a literal ')'.
_CSS_URL_RE = re.compile(
    r"""url\(\s*(?:'(?P<sq>[^']*)'|"(?P<dq>[^"]*)"|(?P<uq>[^)"'\s]+))\s*\)""",
    re.IGNORECASE,
)
_CSS_IMPORT_RE = re.compile(
    r"""@import\s+(?P<quote>['"])(?P<url>[^'"]+)(?P=quote)""", re.IGNORECASE
)


def _rewrite_css_urls(css: str, base_url: str) -> str:
    """Rewrite url(...) and @import "..." references in CSS."""

    def _url_sub(match: re.Match[str]) -> str:
        if match.group("sq") is not None:
            url, quote = match.group("sq"), "'"
        elif match.group("dq") is not None:
            url, quote = match.group("dq"), '"'
        else:
            url, quote = match.group("uq"), ""
        return f"url({quote}{_absolutize(url, base_url)}{quote})"

    def _import_sub(match: re.Match[str]) -> str:
        quote = match.group("quote")
        return f"@import {quote}{_absolutize(match.group('url'), base_url)}{quote}"

    return _CSS_IMPORT_RE.sub(_import_sub, _CSS_URL_RE.sub(_url_sub, css))


_META_REFRESH_URL_RE = re.compile(r"(url\s*=\s*)(['\"]?)([^'\";]+)\2", re.IGNORECASE)


def rewrite_html(html: str, base_url: str) -> str:
    """Rewrite every relative URL in an HTML document to absolute.

    Covers src/href/action/formaction/data-src/poster/xlink:href, <object data>,
    srcset/data-srcset/imagesrcset, inline style attributes, <style> blocks
    (url() and @import), and meta-refresh redirects. Honours and removes any
    <base href> tag. Script bodies are never touched.
    """
    soup = BeautifulSoup(html, HTML_PARSER)

    base_tag = soup.find("base", href=True)
    if base_tag is not None:
        base_url = urljoin(base_url, base_tag["href"])
        base_tag.decompose()

    for tag in soup.find_all(True):
        for attr in URL_ATTRS:
            if tag.has_attr(attr):
                tag[attr] = _absolutize(tag[attr], base_url)
        for attr in SRCSET_ATTRS:
            if tag.has_attr(attr):
                tag[attr] = _rewrite_srcset(tag[attr], base_url)
        if tag.name == "object" and tag.has_attr("data"):
            tag["data"] = _absolutize(tag["data"], base_url)
        if tag.has_attr("style"):
            tag["style"] = _rewrite_css_urls(tag["style"], base_url)
        if (
            tag.name == "meta"
            and tag.get("http-equiv", "").lower() == "refresh"
            and tag.has_attr("content")
        ):
            tag["content"] = _META_REFRESH_URL_RE.sub(
                lambda m: f"{m.group(1)}{m.group(2)}"
                f"{_absolutize(m.group(3), base_url)}{m.group(2)}",
                tag["content"],
            )

    for style_tag in soup.find_all("style"):
        if style_tag.string:
            style_tag.string.replace_with(
                _rewrite_css_urls(str(style_tag.string), base_url)
            )

    return str(soup)


# --- Fetching ----------------------------------------------------------------


async def fetch_target(
    url: str, *, transport: httpx.AsyncBaseTransport | None = None
) -> tuple[bytes, int, str, str]:
    """Fetch ``url`` and return ``(body, status_code, content_type, final_url)``.

    Enforces a per-operation timeout and an overall wall-clock budget, follows
    up to ``MAX_REDIRECTS`` redirects manually, and on every hop resolves +
    validates the host and connects to the *validated* IP (pinned via the
    connection URL + Host header + SNI) so DNS can't be rebound between the
    check and the connection. Caps both compressed and decoded bytes.
    """
    current_url = url
    try:
        async with asyncio.timeout(MAX_TOTAL_SECONDS):
            async with httpx.AsyncClient(
                timeout=httpx.Timeout(FETCH_TIMEOUT_SECONDS),
                follow_redirects=False,
                transport=transport or _DEFAULT_TRANSPORT,
                headers=_REQUEST_HEADERS,
            ) as client:
                for _hop in range(MAX_REDIRECTS + 1):
                    parsed = urlparse(current_url)
                    pinned_ip = await resolve_and_validate(current_url)
                    connect_url, host_header, sni = _build_pinned_request(
                        parsed, pinned_ip
                    )
                    try:
                        async with client.stream(
                            "GET",
                            connect_url,
                            headers={"Host": host_header},
                            extensions={"sni_hostname": sni},
                        ) as response:
                            if response.status_code in _REDIRECT_STATUSES:
                                location = response.headers.get("location")
                                if not location:
                                    raise ProxyError("Redirect with no Location header")
                                current_url = urljoin(current_url, location)
                                continue

                            body = bytearray()
                            async for chunk in response.aiter_bytes():
                                body.extend(chunk)
                                if (
                                    len(body) > MAX_RESPONSE_BYTES
                                    or response.num_bytes_downloaded
                                    > MAX_RESPONSE_BYTES
                                ):
                                    raise ProxyError("Page is too large to proxy")
                            return (
                                bytes(body),
                                response.status_code,
                                response.headers.get("content-type", ""),
                                current_url,
                            )
                    except httpx.TimeoutException as exc:
                        raise ProxyError(
                            "The site took too long to respond", status_code=504
                        ) from exc
                    except httpx.InvalidURL as exc:
                        raise BlockedURLError("Invalid URL") from exc
                    except (httpx.HTTPError, httpx.StreamError) as exc:
                        raise ProxyError(
                            f"Could not reach the site ({exc.__class__.__name__})"
                        ) from exc
                raise ProxyError("Too many redirects")
    except TimeoutError as exc:  # overall budget exceeded (asyncio.timeout)
        raise ProxyError("The site took too long to respond", status_code=504) from exc


_META_CHARSET_RE = re.compile(
    rb"""<meta[^>]+charset\s*=\s*["']?\s*([a-zA-Z0-9_\-]+)""", re.IGNORECASE
)


def _detect_encoding(content_type: str, body: bytes) -> str:
    # A byte-order mark is authoritative for UTF-16/32.
    if body[:4] in (b"\xff\xfe\x00\x00", b"\x00\x00\xfe\xff"):
        return "utf-32"
    if body[:2] in (b"\xff\xfe", b"\xfe\xff"):
        return "utf-16"
    match = re.search(r"charset=([\w\-]+)", content_type, re.IGNORECASE)
    if match:
        candidate = match.group(1)
    elif body[:3] == b"\xef\xbb\xbf":
        candidate = "utf-8-sig"  # strip the UTF-8 BOM on decode
    else:
        meta = _META_CHARSET_RE.search(body[:2048])
        candidate = meta.group(1).decode("ascii", "ignore") if meta else "utf-8"
    try:
        codecs.lookup(candidate)
        return candidate
    except LookupError:
        return "utf-8"


def _looks_like_html(body: bytes) -> bool:
    head = body[:512].lstrip(b"\xef\xbb\xbf").lstrip().lower()
    return head.startswith(b"<!doctype") or b"<html" in head


async def fetch_and_rewrite(
    url: str, *, transport: httpx.AsyncBaseTransport | None = None
) -> ProxiedPage:
    """Fetch a page and prepare it for iframe embedding.

    HTML responses are decoded (BOM, then header charset, then meta charset,
    then UTF-8), rewritten, and re-encoded as UTF-8. Anything else passes
    through untouched. Upstream status codes are preserved.
    """
    body, status_code, content_type, final_url = await fetch_target(
        url, transport=transport
    )
    bare_type = content_type.split(";")[0].strip().lower()
    is_html = bare_type in HTML_CONTENT_TYPES or (
        not bare_type and _looks_like_html(body)
    )
    if is_html:
        encoding = _detect_encoding(content_type, body)
        html = body.decode(encoding, errors="replace")
        rewritten = rewrite_html(html, final_url)
        return ProxiedPage(
            content=rewritten.encode("utf-8"),
            status_code=status_code,
            content_type="text/html; charset=utf-8",
            final_url=final_url,
            is_html=True,
        )
    return ProxiedPage(
        content=body,
        status_code=status_code,
        content_type=content_type or "application/octet-stream",
        final_url=final_url,
        is_html=False,
    )
