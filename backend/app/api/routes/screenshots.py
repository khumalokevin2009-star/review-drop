"""Screenshot endpoint (CLAUDE.md Section 8).

POST /screenshots {url} -> {screenshot_url}

Auth-gated: the URL must belong to one of the caller's projects (same host,
www-insensitive), so the endpoint can't be used to screenshot arbitrary sites.
Rate-limited per USER (10/min) since captures are expensive.
"""

import hashlib
from urllib.parse import urlparse

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field
from slowapi.util import get_remote_address
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_db, limiter
from app.models.project import Project
from app.models.user import User
from app.services.screenshot_service import capture_and_store

router = APIRouter(prefix="/screenshots", tags=["screenshots"])


def _user_rate_key(request: Request) -> str:
    """Rate-limit per user, not per IP: key on the (hashed) Authorization
    header. Falls back to the client IP if the header is missing — that
    request will fail auth anyway, but it still consumes a budget."""
    auth_header = request.headers.get("Authorization")
    if auth_header:
        return hashlib.sha256(auth_header.encode()).hexdigest()
    return get_remote_address(request)


class ScreenshotRequest(BaseModel):
    url: str = Field(min_length=1, max_length=2048)


class ScreenshotResponse(BaseModel):
    screenshot_url: str


def _bare_host(host: str | None) -> str:
    host = (host or "").lower()
    return host[4:] if host.startswith("www.") else host


@router.post("", response_model=ScreenshotResponse)
@limiter.limit("10/minute", key_func=_user_rate_key)
async def create_screenshot(
    request: Request,
    data: ScreenshotRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ScreenshotResponse:
    target_host = _bare_host(urlparse(data.url).hostname)
    if not target_host:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="url must be a valid http(s) URL",
        )

    # The URL must live on a host belonging to one of the caller's projects.
    result = await db.execute(
        select(Project.url).where(
            Project.user_id == current_user.id,
            Project.deleted_at.is_(None),
        )
    )
    owned_hosts = {_bare_host(urlparse(u).hostname) for u in result.scalars()}
    if target_host not in owned_hosts:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="URL does not belong to one of your projects",
        )

    screenshot_url = await capture_and_store(
        data.url, f"manual/{current_user.id}"
    )
    if screenshot_url is None:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Could not capture a screenshot of that page",
        )
    return ScreenshotResponse(screenshot_url=screenshot_url)
