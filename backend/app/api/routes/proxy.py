"""GET /proxy — serves a target staging site ready for iframe embedding.

Auth-gated (the URL must belong to one of the caller's projects), rate-limited
per user, and served with a CSP sandbox so proxied JS can't reach outside the
iframe. See CLAUDE.md Sections 8, 9, 13.

Note: no ``from __future__ import annotations`` here — slowapi's
``@limiter.limit`` wrapper would leave FastAPI resolving stringized
annotations against slowapi's module globals (same issue as auth.py).
"""

from urllib.parse import urlparse

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status
from slowapi.util import get_remote_address
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_db, limiter
from app.core.config import settings
from app.models.project import Project
from app.models.user import User
from app.services import proxy_service

router = APIRouter(tags=["proxy"])

PROXY_RATE_LIMIT = "60/minute"  # per user (CLAUDE.md Section 13)

# frame-ancestors must be an origin (scheme://host[:port]); FRONTEND_URL may
# carry a path, so reduce it to its origin.
_frontend = urlparse(settings.FRONTEND_URL)
_FRONTEND_ORIGIN = f"{_frontend.scheme}://{_frontend.netloc}"

# Fresh response headers — nothing is forwarded from the target, so its
# X-Frame-Options / CSP frame-ancestors / Set-Cookie never reach the client.
# `sandbox allow-scripts` (NO allow-same-origin) gives the proxied document an
# OPAQUE origin: the injected pin-agent + site JS run for rendering and can
# postMessage the parent, but cannot reach our backend origin, cookies, or
# storage. Trade-off: a target's own same-origin API/storage calls fail under
# an opaque origin — acceptable for v1 (the canvas is for visual review).
_PROXY_RESPONSE_HEADERS = {
    # sandbox -> opaque inner origin; frame-ancestors -> only OUR frontend may
    # embed the canvas (so a hostile parent can't drive/read the agent).
    "Content-Security-Policy": (
        f"sandbox allow-scripts; frame-ancestors {_FRONTEND_ORIGIN}"
    ),
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "Cache-Control": "no-store",
    "X-Robots-Tag": "noindex, nofollow",
}


def _proxy_rate_key(request: Request) -> str:
    """Rate-limit key: the authenticated user, set by ``_authed_request``."""
    return getattr(request.state, "rate_key", None) or get_remote_address(request)


async def _authed_request(
    request: Request, current_user: User = Depends(get_current_user)
) -> User:
    """Authenticate, then stash the user id where the limiter's key_func
    (which only receives the Request) can read it."""
    request.state.rate_key = f"user:{current_user.id}"
    return current_user


def _hostnames_match(a: "str | None", b: "str | None") -> bool:
    """Case-insensitive host comparison, treating www.example.com and
    example.com as the same site."""
    if not a or not b:
        return False

    def _strip_www(host: str) -> str:
        host = host.lower()
        return host[4:] if host.startswith("www.") else host

    return _strip_www(a) == _strip_www(b)


async def _user_owns_url(db: AsyncSession, user: User, target_url: str) -> bool:
    """True if the target URL's host matches any of the user's project URLs.

    Host-level matching: the client navigates to subpages of the staging
    site, so any path under a project's host is allowed.
    """
    target_host = urlparse(target_url).hostname
    if not target_host:
        return False
    result = await db.execute(
        select(Project.url).where(
            Project.user_id == user.id, Project.deleted_at.is_(None)
        )
    )
    return any(
        _hostnames_match(target_host, urlparse(project_url).hostname)
        for project_url in result.scalars().all()
    )


@router.get("/proxy")
@limiter.limit(PROXY_RATE_LIMIT, key_func=_proxy_rate_key)
async def proxy(
    request: Request,
    url: str = Query(
        ..., min_length=1, description="Encoded URL of the page to render"
    ),
    current_user: User = Depends(_authed_request),
    db: AsyncSession = Depends(get_db),
) -> Response:
    if not await _user_owns_url(db, current_user, url):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="URL does not belong to one of your projects",
        )

    try:
        page = await proxy_service.fetch_and_rewrite(url)
    except proxy_service.BlockedURLError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=exc.detail
        ) from exc
    except proxy_service.ProxyError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc

    return Response(
        content=page.content,
        status_code=page.status_code,
        media_type=page.content_type,
        headers=dict(_PROXY_RESPONSE_HEADERS),
    )
