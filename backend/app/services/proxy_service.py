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
import json
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


# --- Pin agent injection ----------------------------------------------------

# Injected verbatim before </body> of every proxied page. The document runs at
# an OPAQUE origin (CSP `sandbox allow-scripts`, no allow-same-origin), so this
# script can render the page and talk to window.parent via postMessage, but
# cannot reach our backend, cookies, or storage. It strictly accepts messages
# only from window.parent. The parent validates event.source === the iframe.
# `__RD_PAGE_URL_JSON__` is replaced at injection time with the real page URL.
_AGENT_SCRIPT_TEMPLATE = r"""
(function () {
  "use strict";
  var PAGE_URL = __RD_PAGE_URL_JSON__;
  var parentWin = window.parent;
  if (!parentWin || parentWin === window) return;

  var mode = "browse";
  var pins = [];
  var container = null;
  var focusedId = null;
  var STATUS_COLORS = { open: "#EF4444", in_progress: "#F59E0B", resolved: "#22C55E" };
  var BRAND = "#6366F1";
  var Z = "2147483646";
  var DRAG_MIN = 6; // px of page-space travel before a press becomes a region

  function post(msg) { try { parentWin.postMessage(msg, "*"); } catch (e) {} }
  function host(u) { try { return new URL(u).host; } catch (e) { return ""; } }
  function bareHost(h) { h = (h || "").toLowerCase(); return h.indexOf("www.") === 0 ? h.slice(4) : h; }
  function sameHost(a, b) { return bareHost(a) === bareHost(b); }
  function esc(s) {
    if (window.CSS && CSS.escape) return CSS.escape(s);
    return String(s).replace(/[^a-zA-Z0-9_-]/g, "\\$&").replace(/^([0-9])/, "\\3$1 ");
  }

  function selectorFor(el) {
    if (!el || el.nodeType !== 1) return null;
    if (el.id) return "#" + esc(el.id);
    var parts = [], node = el, depth = 0, rooted = false;
    while (node && node.nodeType === 1 && node !== document.body) {
      if (node.id) { parts.unshift("#" + esc(node.id)); rooted = true; break; }
      if (depth >= 8) break; // too deep: an unanchored chain could match elsewhere
      var idx = 1, sib = node;
      while ((sib = sib.previousElementSibling)) {
        if (sib.tagName === node.tagName) idx++;
      }
      parts.unshift(node.localName + ":nth-of-type(" + idx + ")");
      node = node.parentElement; depth++;
    }
    if (node === document.body) rooted = true;
    // Truncated (not rooted at an id or body) -> drop the selector and let the
    // pin fall back to absolute coordinates rather than risk a wrong element.
    if (!rooted) return null;
    return parts.join(" > ") || el.localName;
  }

  function pct(client, start, size) {
    if (!size) return null;
    var v = ((client - start) / size) * 100;
    return Math.max(0, Math.min(100, Math.round(v * 100) / 100));
  }
  function round2(v) { return Math.round(v * 100) / 100; }

  // --- comment-mode page styling (crosshair + selection suppression) --------

  var modeStyle = null;
  function ensureModeStyle() {
    if (modeStyle && modeStyle.parentNode) return;
    modeStyle = document.createElement("style");
    modeStyle.setAttribute("data-rd-style", "");
    modeStyle.textContent =
      "html[data-rd-mode=comment], html[data-rd-mode=comment] * {" +
      " cursor: crosshair !important;" +
      " user-select: none !important; -webkit-user-select: none !important;" +
      " -ms-user-select: none !important; }" +
      " html[data-rd-mode=comment] [data-rd-pin] { cursor: pointer !important; }";
    (document.head || document.documentElement).appendChild(modeStyle);
  }
  function applyMode() {
    ensureModeStyle();
    if (mode === "comment") {
      document.documentElement.setAttribute("data-rd-mode", "comment");
    } else {
      document.documentElement.removeAttribute("data-rd-mode");
      cancelDrag();
    }
  }

  // --- region drag selection (the Cmd+Shift+4 interaction) ------------------

  // Start point is PAGE-anchored (stays glued to content if the user scrolls
  // mid-drag to extend the selection); the live corner is the latest CLIENT
  // position, converted at render/commit time.
  var drag = null; // { startPageX/Y, curClientX/Y, region, point }
  var ovl = null;  // { root, shades[4], box, badge }

  function pointDataAt(target, clientX, clientY) {
    var rect = target && target.getBoundingClientRect ? target.getBoundingClientRect() : null;
    return {
      selector: selectorFor(target),
      percentX: rect ? pct(clientX, rect.left, rect.width) : null,
      percentY: rect ? pct(clientY, rect.top, rect.height) : null,
      // Clamp: rubber-band overscroll can make scroll offsets momentarily
      // negative, and the backend rejects negative absolute coordinates.
      absX: Math.max(0, Math.round(clientX + window.scrollX)),
      absY: Math.max(0, Math.round(clientY + window.scrollY)),
      clientX: Math.round(clientX),
      clientY: Math.round(clientY)
    };
  }

  function ensureDragOverlay() {
    if (ovl && ovl.root.parentNode) return ovl;
    var root = document.createElement("div");
    root.setAttribute("data-rd-overlay", "");
    root.style.cssText = "position:fixed;left:0;top:0;right:0;bottom:0;margin:0;padding:0;border:0;pointer-events:none;z-index:2147483647;";
    var shades = [];
    for (var i = 0; i < 4; i++) {
      var s = document.createElement("div");
      s.style.cssText = "position:absolute;pointer-events:none;background:rgba(0,0,0,0.25);";
      root.appendChild(s); shades.push(s);
    }
    var box = document.createElement("div");
    box.style.cssText = "position:absolute;pointer-events:none;border:1.5px solid " + BRAND + ";box-sizing:border-box;";
    root.appendChild(box);
    var badge = document.createElement("div");
    badge.style.cssText = "position:absolute;pointer-events:none;background:#18181B;color:#fff;font:500 11px/1 -apple-system,BlinkMacSystemFont,system-ui,sans-serif;padding:4px 6px;border-radius:4px;white-space:nowrap;";
    root.appendChild(badge);
    (document.body || document.documentElement).appendChild(root);
    ovl = { root: root, shades: shades, box: box, badge: badge };
    return ovl;
  }
  function removeDragOverlay() {
    if (ovl && ovl.root.parentNode) ovl.root.parentNode.removeChild(ovl.root);
    ovl = null;
  }
  function setRect(el, x, y, w, h) {
    el.style.left = x + "px"; el.style.top = y + "px";
    el.style.width = Math.max(0, w) + "px"; el.style.height = Math.max(0, h) + "px";
  }
  function renderDragOverlay() {
    if (!drag || !drag.region) return;
    var o = ensureDragOverlay();
    // position:fixed is hijacked by transformed ancestors; measure the
    // container's real offset and compensate.
    var or = o.root.getBoundingClientRect();
    var x1 = drag.startPageX - window.scrollX - or.left;
    var y1 = drag.startPageY - window.scrollY - or.top;
    var x2 = drag.curClientX - or.left;
    var y2 = drag.curClientY - or.top;
    var L = Math.min(x1, x2), T = Math.min(y1, y2);
    var W = Math.abs(x2 - x1), H = Math.abs(y2 - y1);
    var vw = window.innerWidth, vh = window.innerHeight;
    setRect(o.shades[0], 0, 0, vw, Math.max(0, T));            // above
    setRect(o.shades[1], 0, T + H, vw, Math.max(0, vh - T - H)); // below
    setRect(o.shades[2], 0, T, Math.max(0, L), H);             // left
    setRect(o.shades[3], L + W, T, Math.max(0, vw - L - W), H); // right
    setRect(o.box, L, T, W, H);
    o.badge.textContent = Math.round(W) + " × " + Math.round(H);
    var bx = x2 + 12, by = y2 + 12;
    var bw = o.badge.offsetWidth, bh = o.badge.offsetHeight;
    if (bx + bw > vw - 4) bx = x2 - bw - 12;
    if (by + bh > vh - 4) by = y2 - bh - 12;
    // Flipping can land off-screen near the left/top edges — clamp last.
    bx = Math.max(4, Math.min(bx, vw - bw - 4));
    by = Math.max(4, Math.min(by, vh - bh - 4));
    o.badge.style.left = bx + "px"; o.badge.style.top = by + "px";
  }
  function cancelDrag() {
    drag = null;
    removeDragOverlay();
  }
  function maybeUpgradeToRegion() {
    if (!drag || drag.region) return;
    var dx = (drag.curClientX + window.scrollX) - drag.startPageX;
    var dy = (drag.curClientY + window.scrollY) - drag.startPageY;
    if (Math.sqrt(dx * dx + dy * dy) >= DRAG_MIN) drag.region = true;
  }

  // elementFromPoint would hit our own pins; hide them for the query.
  function elementFromPointSafe(x, y) {
    var el = null, prev = null;
    if (container) { prev = container.style.display; container.style.display = "none"; }
    try { el = document.elementFromPoint(x, y); } catch (err) {}
    if (container) container.style.display = prev || "";
    return el;
  }

  function emitPoint(p) {
    post({
      type: "rd:click",
      selector: p.selector,
      percentX: p.percentX,
      percentY: p.percentY,
      absX: p.absX,
      absY: p.absY,
      clientX: p.clientX,
      clientY: p.clientY,
      regionWidth: null,
      regionHeight: null,
      regionWidthPercent: null,
      regionHeightPercent: null,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      pageUrl: PAGE_URL
    });
  }
  function emitRegion(d, upClientX, upClientY) {
    var upPageX = upClientX + window.scrollX, upPageY = upClientY + window.scrollY;
    var left = Math.min(d.startPageX, upPageX), top = Math.min(d.startPageY, upPageY);
    var w = Math.abs(upPageX - d.startPageX), h = Math.abs(upPageY - d.startPageY);
    // Anchor (top-left) element: only resolvable while it's inside the viewport;
    // otherwise fall back to absolute coordinates alone.
    var ax = left - window.scrollX, ay = top - window.scrollY;
    var el = null;
    if (ax >= 0 && ay >= 0 && ax < window.innerWidth && ay < window.innerHeight) {
      el = elementFromPointSafe(ax, ay);
    }
    var rect = el && el.getBoundingClientRect ? el.getBoundingClientRect() : null;
    post({
      type: "rd:click",
      selector: el ? selectorFor(el) : null,
      percentX: rect ? pct(ax, rect.left, rect.width) : null,
      percentY: rect ? pct(ay, rect.top, rect.height) : null,
      absX: Math.max(0, Math.round(left)),
      absY: Math.max(0, Math.round(top)),
      clientX: Math.round(upClientX),
      clientY: Math.round(upClientY),
      regionWidth: Math.round(w),
      regionHeight: Math.round(h),
      regionWidthPercent: rect && rect.width ? round2((w / rect.width) * 100) : null,
      regionHeightPercent: rect && rect.height ? round2((h / rect.height) * 100) : null,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      pageUrl: PAGE_URL
    });
  }
  function finishDrag(upClientX, upClientY) {
    var d = drag;
    drag = null;
    removeDragOverlay();
    if (!d) return;
    if (d.region) emitRegion(d, upClientX, upClientY);
    else emitPoint(d.point);
  }

  function onMouseDown(e) {
    if (mode !== "comment" || e.button !== 0) return;
    var t = e.target;
    if (t && t.closest && t.closest("[data-rd-pin]")) return; // pins stay clickable
    e.preventDefault(); e.stopPropagation();
    drag = {
      startPageX: e.clientX + window.scrollX,
      startPageY: e.clientY + window.scrollY,
      curClientX: e.clientX,
      curClientY: e.clientY,
      region: false,
      point: pointDataAt(t, e.clientX, e.clientY)
    };
  }
  function onMouseMove(e) {
    if (!drag) return;
    // Released outside the iframe: the mouseup never reached us; commit at the
    // last point we knew about as soon as the cursor returns button-less.
    if ((e.buttons & 1) === 0) { finishDrag(drag.curClientX, drag.curClientY); return; }
    drag.curClientX = e.clientX;
    drag.curClientY = e.clientY;
    maybeUpgradeToRegion();
    if (drag.region) { e.preventDefault(); renderDragOverlay(); }
  }
  function onMouseUp(e) {
    if (!drag) return;
    e.preventDefault(); e.stopPropagation();
    drag.curClientX = e.clientX;
    drag.curClientY = e.clientY;
    maybeUpgradeToRegion();
    finishDrag(e.clientX, e.clientY);
  }
  function onKeyDown(e) {
    if (drag && e.key === "Escape") {
      e.preventDefault(); e.stopPropagation();
      cancelDrag();
    }
  }
  function onScroll() {
    if (!drag) return;
    maybeUpgradeToRegion();
    renderDragOverlay();
  }
  function onBlur() { cancelDrag(); }
  function onDragStart(e) { if (mode === "comment") e.preventDefault(); }

  // --- clicks (pins, navigation, comment-mode freeze) ------------------------

  function onClick(e) {
    var t = e.target;
    var pin = t && t.closest ? t.closest("[data-rd-pin]") : null;
    if (pin) {
      e.preventDefault(); e.stopPropagation();
      post({ type: "rd:pin-click", id: pin.getAttribute("data-rd-pin") });
      return;
    }
    if (mode === "comment") {
      // Swallow the click so the page stays frozen; the mousedown/mouseup
      // drag controller above owns comment emission (point or region).
      e.preventDefault(); e.stopPropagation();
      return;
    }
    var a = t && t.closest ? t.closest("a[href]") : null;
    if (a && a.getAttribute("href")) {
      var u;
      try { u = new URL(a.href, location.href); } catch (err) { return; }
      if (u.protocol !== "http:" && u.protocol !== "https:") return;
      e.preventDefault(); e.stopPropagation();
      if (sameHost(u.host, host(PAGE_URL))) {
        post({ type: "rd:navigate", path: u.pathname + u.search + u.hash });
      }
      // cross-host links stay disabled (kept on the project's site)
    }
  }

  // --- pin + region rendering -------------------------------------------------

  function ensureContainer() {
    if (container && container.parentNode) return container;
    container = document.createElement("div");
    container.setAttribute("data-rd-pins", "");
    container.style.cssText = "position:absolute;top:0;left:0;width:0;height:0;margin:0;padding:0;border:0;pointer-events:none;z-index:" + Z + ";";
    document.body.appendChild(container);
    return container;
  }
  function resolvePos(p) {
    if (p.selector) {
      var el = null;
      try { el = document.querySelector(p.selector); } catch (e) {}
      if (el) {
        var r = el.getBoundingClientRect();
        var fx = (p.percentX == null ? 50 : p.percentX) / 100;
        var fy = (p.percentY == null ? 50 : p.percentY) / 100;
        return { x: r.left + window.scrollX + r.width * fx, y: r.top + window.scrollY + r.height * fy, el: el };
      }
    }
    if (typeof p.absX === "number" && typeof p.absY === "number") {
      return { x: p.absX, y: p.absY, el: null };
    }
    return null;
  }
  // Region size on replay mirrors the hybrid pin philosophy: prefer dimensions
  // relative to the anchor element's CURRENT size, fall back to absolute px.
  function regionSize(p, pos) {
    var w = null, h = null;
    if (pos.el) {
      var r = pos.el.getBoundingClientRect();
      if (typeof p.regionWidthPercent === "number") w = (r.width * p.regionWidthPercent) / 100;
      if (typeof p.regionHeightPercent === "number") h = (r.height * p.regionHeightPercent) / 100;
    }
    if (w == null && typeof p.regionWidth === "number") w = p.regionWidth;
    if (h == null && typeof p.regionHeight === "number") h = p.regionHeight;
    return w != null && h != null ? { w: w, h: h } : null;
  }
  function renderPins() {
    var c = ensureContainer();
    while (c.firstChild) c.removeChild(c.firstChild);
    // The container is position:absolute; if <body>/<html> establishes a
    // containing block (position/transform), its origin isn't the document
    // origin — measure it and convert page coords into container-local coords.
    var crect = c.getBoundingClientRect();
    var originX = crect.left + window.scrollX;
    var originY = crect.top + window.scrollY;
    var unplaced = [];
    for (var i = 0; i < pins.length; i++) {
      var p = pins[i], pos = resolvePos(p);
      if (!pos) { unplaced.push(p.id); continue; }
      // Focused region pins draw their rectangle (unfocused: pin only).
      if (p.id === focusedId) {
        var size = regionSize(p, pos);
        if (size) {
          var rgn = document.createElement("div");
          rgn.setAttribute("data-rd-region", p.id);
          rgn.style.cssText = "position:absolute;left:" + (pos.x - originX) + "px;top:" + (pos.y - originY) + "px;width:" + size.w + "px;height:" + size.h + "px;border:1.5px solid " + BRAND + ";background:rgba(99,102,241,0.08);border-radius:2px;pointer-events:none;box-sizing:border-box;";
          c.appendChild(rgn);
        }
      }
      var d = document.createElement("div");
      d.setAttribute("data-rd-pin", p.id);
      var color = STATUS_COLORS[p.status] || STATUS_COLORS.open;
      d.style.cssText = "position:absolute;left:" + (pos.x - originX) + "px;top:" + (pos.y - originY) + "px;transform:translate(-50%,-50%);width:24px;height:24px;border-radius:9999px;background:" + color + ";color:#fff;font:600 12px/22px -apple-system,BlinkMacSystemFont,system-ui,sans-serif;text-align:center;box-shadow:0 1px 4px rgba(0,0,0,.35);border:2px solid #fff;pointer-events:auto;cursor:pointer;user-select:none;box-sizing:border-box;";
      d.textContent = String(p.number);
      c.appendChild(d);
    }
    if (unplaced.length) post({ type: "rd:unplaced", ids: unplaced });
  }

  function onMessage(e) {
    if (e.source !== parentWin) return;
    var d = e.data;
    if (!d || typeof d.type !== "string") return;
    if (d.type === "rd:set-mode") {
      mode = d.mode === "comment" ? "comment" : "browse";
      applyMode();
    } else if (d.type === "rd:render-pins") {
      pins = Array.isArray(d.pins) ? d.pins : [];
      renderPins();
    } else if (d.type === "rd:focus-pin") {
      var newId = d.id == null ? null : String(d.id);
      if (newId === focusedId) return;
      focusedId = newId;
      renderPins(); // draw/clear the focused region rectangle
      if (newId && container) {
        var sel = '[data-rd-pin="' + newId.replace(/"/g, '\\"') + '"]';
        var el = container.querySelector(sel);
        if (el && el.scrollIntoView) el.scrollIntoView({ block: "center", behavior: "smooth" });
      }
    }
  }

  var rt = null;
  function onResize() {
    if (rt) clearTimeout(rt);
    rt = setTimeout(renderPins, 150);
    renderDragOverlay(); // keep an in-flight selection accurate immediately
  }
  function docHeight() {
    var b = document.body, h = document.documentElement;
    return Math.max(b ? b.scrollHeight : 0, h ? h.scrollHeight : 0);
  }
  function init() {
    // Listen on window (capture) so we sit above any document-level capture
    // handler the target site installed.
    window.addEventListener("click", onClick, true);
    window.addEventListener("mousedown", onMouseDown, true);
    window.addEventListener("mousemove", onMouseMove, true);
    window.addEventListener("mouseup", onMouseUp, true);
    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("dragstart", onDragStart, true);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("blur", onBlur);
    window.addEventListener("message", onMessage);
    window.addEventListener("resize", onResize);
    post({ type: "rd:ready", pageUrl: PAGE_URL, docHeight: docHeight() });
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
"""


def _build_agent_script(page_url: str) -> str:
    # Embed the URL as a JS string literal. json.dumps handles quotes/backslashes
    # but NOT </script> breakout or the U+2028/U+2029 line separators that are
    # legal in JSON but terminate a JS string — escape those so a hostile
    # final_url (e.g. via a crafted redirect) can't inject script.
    safe = (
        json.dumps(page_url)
        .replace("<", "\\u003c")
        .replace(" ", "\\u2028")
        .replace(" ", "\\u2029")
    )
    return _AGENT_SCRIPT_TEMPLATE.replace("__RD_PAGE_URL_JSON__", safe)


def _inject_agent(html: str, page_url: str) -> str:
    """Insert the pin-agent <script> immediately before </body> (verbatim, so
    the JS is never HTML-escaped). Falls back to appending at the end."""
    script = "<script>" + _build_agent_script(page_url) + "</script>"
    idx = html.lower().rfind("</body>")
    if idx != -1:
        return html[:idx] + script + html[idx:]
    return html + script


def rewrite_html(html: str, base_url: str, *, inject_agent: bool = False) -> str:
    """Rewrite every relative URL in an HTML document to absolute.

    Covers src/href/action/formaction/data-src/poster/xlink:href, <object data>,
    srcset/data-srcset/imagesrcset, inline style attributes, <style> blocks
    (url() and @import), and meta-refresh redirects. Honours and removes any
    <base href> tag. Script bodies are never touched. When ``inject_agent`` is
    set, the pin-agent script is appended before </body>.
    """
    page_url = base_url  # the document's real URL, before any <base href> override
    soup = BeautifulSoup(html, HTML_PARSER)

    base_tag = soup.find("base", href=True)
    if base_tag is not None:
        base_url = urljoin(base_url, base_tag["href"])
        base_tag.decompose()

    # Strip the target's own meta CSP / frame-busting so they can't block the
    # injected agent or re-assert framing limits (response headers are already
    # rebuilt fresh by the route).
    for meta in soup.find_all("meta"):
        if (meta.get("http-equiv") or "").lower() in (
            "content-security-policy",
            "x-frame-options",
        ):
            meta.decompose()

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

    result = str(soup)
    if inject_agent:
        result = _inject_agent(result, page_url)
    return result


# --- Fetching ----------------------------------------------------------------


def _host_matches(a: str | None, b: str | None) -> bool:
    """Case-insensitive, www-insensitive host comparison."""
    if not a or not b:
        return False

    def bare(h: str) -> str:
        h = h.lower()
        return h[4:] if h.startswith("www.") else h

    return bare(a) == bare(b)


async def fetch_target(
    url: str,
    *,
    transport: httpx.AsyncBaseTransport | None = None,
    restrict_to_host: str | None = None,
) -> tuple[bytes, int, str, str]:
    """Fetch ``url`` and return ``(body, status_code, content_type, final_url)``.

    When ``restrict_to_host`` is set, EVERY hop (incl. redirect targets) must
    stay on that host — closing the open-proxy-via-redirect hole for the public
    guest endpoint.

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
                    if restrict_to_host is not None and not _host_matches(
                        parsed.hostname, restrict_to_host
                    ):
                        raise BlockedURLError("Redirected off the allowed host")
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
    url: str,
    *,
    transport: httpx.AsyncBaseTransport | None = None,
    restrict_to_host: str | None = None,
) -> ProxiedPage:
    """Fetch a page and prepare it for iframe embedding.

    HTML responses are decoded (BOM, then header charset, then meta charset,
    then UTF-8), rewritten, and re-encoded as UTF-8. Anything else passes
    through untouched. Upstream status codes are preserved. ``restrict_to_host``
    pins every redirect hop to a single host.
    """
    body, status_code, content_type, final_url = await fetch_target(
        url, transport=transport, restrict_to_host=restrict_to_host
    )
    bare_type = content_type.split(";")[0].strip().lower()
    is_html = bare_type in HTML_CONTENT_TYPES or (
        not bare_type and _looks_like_html(body)
    )
    if is_html:
        encoding = _detect_encoding(content_type, body)
        html = body.decode(encoding, errors="replace")
        rewritten = rewrite_html(html, final_url, inject_agent=True)
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
