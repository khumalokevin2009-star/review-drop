"""Review routes — authenticated CRUD + the public, slug-based guest entry
points (CLAUDE.md Sections 7, 8, 9).

Authenticated routes are owner-scoped through the parent project. Public
routes (``/r/{slug}``) require no auth and enforce the share-link rules:
404 unknown, 410 expired, 403 inactive. The free-plan per-project review limit
is enforced on create.
"""

import secrets
import string
import uuid
from datetime import datetime, timezone
from urllib.parse import urljoin, urlparse

from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    Query,
    Request,
    Response,
    status,
)
from slowapi.util import get_remote_address
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_db, limiter
from app.api.routes.proxy import _PROXY_RESPONSE_HEADERS, _hostnames_match
from app.models.comment import Comment
from app.models.guest import GuestSession
from app.models.project import Project
from app.models.review import Review
from app.models.user import User
from app.schemas.project import ProjectRead
from app.schemas.review import (
    GuestCanvasData,
    GuestSessionCreate,
    GuestSessionTokenRead,
    ReviewCreate,
    ReviewRead,
    ReviewUpdate,
)
from app.services import proxy_service

router = APIRouter(tags=["reviews"])

FREE_REVIEWS_PER_PROJECT = 1  # CLAUDE.md Section 9 (plan limits)
REVIEW_PAGE_RATE_LIMIT = "60/minute"  # per IP (CLAUDE.md Section 13)
_SLUG_ALPHABET = string.ascii_letters + string.digits  # nanoid-style, URL-safe
_SLUG_LENGTH = 8


# --- helpers ----------------------------------------------------------------


async def _get_owned_project(
    db: AsyncSession, user: User, project_id: uuid.UUID
) -> Project:
    project = await db.scalar(
        select(Project).where(
            Project.id == project_id,
            Project.user_id == user.id,
            Project.deleted_at.is_(None),
        )
    )
    if project is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Project not found"
        )
    return project


async def _get_owned_review(
    db: AsyncSession, user: User, review_id: uuid.UUID
) -> Review:
    review = await db.scalar(
        select(Review)
        .join(Project, Review.project_id == Project.id)
        .where(
            Review.id == review_id,
            Project.user_id == user.id,
            Project.deleted_at.is_(None),
        )
    )
    if review is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Review not found"
        )
    return review


async def _generate_unique_slug(db: AsyncSession) -> str:
    for _ in range(7):
        slug = "".join(secrets.choice(_SLUG_ALPHABET) for _ in range(_SLUG_LENGTH))
        exists = await db.scalar(
            select(func.count()).select_from(Review).where(Review.slug == slug)
        )
        if not exists:
            return slug
    raise HTTPException(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        detail="Could not generate a unique review slug",
    )


async def _resolve_public_review(db: AsyncSession, slug: str) -> tuple[Review, Project]:
    """Resolve a share slug to (review, project), applying the public access
    rules: 404 unknown / project gone, 410 expired, 403 inactive."""
    review = await db.scalar(select(Review).where(Review.slug == slug))
    if review is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Review not found"
        )
    project = await db.scalar(
        select(Project).where(
            Project.id == review.project_id, Project.deleted_at.is_(None)
        )
    )
    if project is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Review not found"
        )
    if review.expires_at is not None and review.expires_at <= datetime.now(
        timezone.utc
    ):
        raise HTTPException(
            status_code=status.HTTP_410_GONE, detail="This review link has expired"
        )
    if not review.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This review link is no longer active",
        )
    return review, project


# --- authenticated routes ---------------------------------------------------


@router.post(
    "/projects/{project_id}/reviews",
    response_model=ReviewRead,
    status_code=status.HTTP_201_CREATED,
)
async def create_review(
    project_id: uuid.UUID,
    data: ReviewCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Review:
    project = await _get_owned_project(db, current_user, project_id)
    if current_user.plan == "free":
        count = await db.scalar(
            select(func.count())
            .select_from(Review)
            .where(Review.project_id == project.id)
        )
        if (count or 0) >= FREE_REVIEWS_PER_PROJECT:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=(
                    "Free plan is limited to 1 review per project. "
                    "Upgrade to create more."
                ),
            )
    review = Review(
        project_id=project.id,
        name=data.name,
        slug=await _generate_unique_slug(db),
        expires_at=data.expires_at,
    )
    db.add(review)
    await db.commit()
    await db.refresh(review)
    return review


@router.get("/projects/{project_id}/reviews", response_model=list[ReviewRead])
async def list_reviews(
    project_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[Review]:
    project = await _get_owned_project(db, current_user, project_id)
    result = await db.execute(
        select(Review)
        .where(Review.project_id == project.id)
        .order_by(Review.created_at.desc())
    )
    return list(result.scalars().all())


@router.patch("/reviews/{review_id}", response_model=ReviewRead)
async def update_review(
    review_id: uuid.UUID,
    data: ReviewUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Review:
    review = await _get_owned_review(db, current_user, review_id)
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(review, key, value)
    await db.commit()
    await db.refresh(review)
    return review


@router.delete("/reviews/{review_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_review(
    review_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Response:
    review = await _get_owned_review(db, current_user, review_id)
    # reviews have no deleted_at column (Section 7) -> hard delete, clearing
    # dependent rows first since there's no DB-level ON DELETE CASCADE.
    await db.execute(delete(Comment).where(Comment.review_id == review.id))
    await db.execute(delete(GuestSession).where(GuestSession.review_id == review.id))
    await db.execute(delete(Review).where(Review.id == review.id))
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# --- public routes (no auth; slug-based) ------------------------------------


@router.get("/r/{slug}", response_model=GuestCanvasData)
async def get_public_review(
    slug: str, db: AsyncSession = Depends(get_db)
) -> GuestCanvasData:
    review, project = await _resolve_public_review(db, slug)
    return GuestCanvasData(
        review=ReviewRead.model_validate(review),
        project=ProjectRead.model_validate(project),
    )


@router.post(
    "/r/{slug}/session",
    response_model=GuestSessionTokenRead,
    status_code=status.HTTP_201_CREATED,
)
async def create_guest_session(
    slug: str,
    data: GuestSessionCreate,
    db: AsyncSession = Depends(get_db),
) -> GuestSessionTokenRead:
    review, _project = await _resolve_public_review(db, slug)
    token = secrets.token_hex(16)  # 32-char hex (Section 9)
    guest = GuestSession(
        review_id=review.id,
        display_name=data.display_name,
        email=data.email,
        session_token=token,
    )
    db.add(guest)
    await db.commit()
    return GuestSessionTokenRead(session_token=token)


@router.get("/r/{slug}/page")
@limiter.limit(REVIEW_PAGE_RATE_LIMIT, key_func=get_remote_address)
async def get_public_review_page(
    request: Request,
    slug: str,
    path: str = Query(default="", description="Same-host path under the project URL"),
    db: AsyncSession = Depends(get_db),
) -> Response:
    """Render the review's target site for the guest canvas.

    Guests never pass arbitrary URLs: the slug fixes the project, and ``path``
    may only navigate within the SAME host as the project URL. Proxied through
    the hardened, SSRF-protected pipeline; served with the sandbox CSP and the
    injected pin-agent.
    """
    _review, project = await _resolve_public_review(db, slug)

    target = urljoin(project.url, path) if path else project.url
    if not _hostnames_match(urlparse(target).hostname, urlparse(project.url).hostname):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Path must stay on the project's site",
        )

    try:
        page = await proxy_service.fetch_and_rewrite(
            target, restrict_to_host=urlparse(project.url).hostname
        )
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


@router.get("/reviews/{review_id}", response_model=GuestCanvasData)
async def get_review_detail(
    review_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> GuestCanvasData:
    """Owner-scoped review + project, so the designer canvas can resolve the
    target site (and slug) from just the review id."""
    review = await _get_owned_review(db, current_user, review_id)
    project = await db.scalar(select(Project).where(Project.id == review.project_id))
    return GuestCanvasData(
        review=ReviewRead.model_validate(review),
        project=ProjectRead.model_validate(project),
    )
