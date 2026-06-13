"""Comment routes (CLAUDE.md Sections 7, 8, 9).

Designer surface (JWT-authenticated, owner-scoped through the project):
    GET    /projects/{id}/comments   (optional ?status= filter)
    GET    /reviews/{id}/comments
    PATCH  /comments/{id}            (status change)
    POST   /comments/{id}/reply
    DELETE /comments/{id}            (soft delete)

Guest surface (X-Guest-Token header, validated against guest_sessions for the
review's slug):
    POST   /r/{slug}/comments
    GET    /r/{slug}/comments        (sees every comment; is_mine flags own)

Authorship: designer comments/replies set author_user_id; guest comments set
author_guest_id. Replies set parent_id and inherit the parent's page_url. New
comments default to status 'open'; screenshot_url stays null (filled later by
the screenshot service).
"""

import logging
import uuid
from datetime import datetime, timezone
from urllib.parse import urlparse

from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    Header,
    HTTPException,
    Query,
    Response,
    status,
)
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import get_current_user, get_db
from app.models.comment import Comment
from app.models.guest import GuestSession
from app.models.project import Project
from app.models.review import Review
from app.models.user import User
from app.schemas.comment import (
    CommentCreate,
    CommentRead,
    CommentReply,
    CommentStatus,
    CommentStatusUpdate,
)
from app.services.email_notifications import notify_new_guest_comment
from app.services.screenshot_service import capture_comment_screenshot

logger = logging.getLogger(__name__)

router = APIRouter(tags=["comments"])


def _same_bare_host(a: str, b: str) -> bool:
    """Case- and www-insensitive host comparison of two URLs."""

    def bare(url: str) -> str:
        host = (urlparse(url).hostname or "").lower()
        return host[4:] if host.startswith("www.") else host

    return bare(a) != "" and bare(a) == bare(b)

# Eager-load both possible authors so serialization never lazy-loads (which
# would fail under async) and we can render the commenter's name.
_AUTHOR_LOAD = (
    selectinload(Comment.author_user),
    selectinload(Comment.author_guest),
)


# --- serialization ----------------------------------------------------------


def _to_read(comment: Comment, *, is_mine: bool | None = None) -> CommentRead:
    author_name: str | None = None
    author_type: str | None = None
    if comment.author_user_id is not None:
        author_type = "designer"
        author_name = comment.author_user.full_name if comment.author_user else None
    elif comment.author_guest_id is not None:
        author_type = "guest"
        author_name = (
            comment.author_guest.display_name if comment.author_guest else None
        )
    return CommentRead(
        id=comment.id,
        review_id=comment.review_id,
        parent_id=comment.parent_id,
        author_user_id=comment.author_user_id,
        author_guest_id=comment.author_guest_id,
        author_name=author_name,
        author_type=author_type,
        is_mine=is_mine,
        body=comment.body,
        status=comment.status,
        page_url=comment.page_url,
        pin_x_percent=comment.pin_x_percent,
        pin_y_percent=comment.pin_y_percent,
        element_selector=comment.element_selector,
        viewport_width=comment.viewport_width,
        viewport_height=comment.viewport_height,
        pin_x_absolute=comment.pin_x_absolute,
        pin_y_absolute=comment.pin_y_absolute,
        screenshot_url=comment.screenshot_url,
        region_width=comment.region_width,
        region_height=comment.region_height,
        region_width_percent=comment.region_width_percent,
        region_height_percent=comment.region_height_percent,
        browser_name=comment.browser_name,
        browser_version=comment.browser_version,
        os_name=comment.os_name,
        screen_width=comment.screen_width,
        screen_height=comment.screen_height,
        created_at=comment.created_at,
        updated_at=comment.updated_at,
    )


async def _load_for_read(db: AsyncSession, comment_id: uuid.UUID) -> Comment:
    return await db.scalar(
        select(Comment).options(*_AUTHOR_LOAD).where(Comment.id == comment_id)
    )


# --- ownership / lookup helpers ---------------------------------------------


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


async def _get_owned_comment(
    db: AsyncSession, user: User, comment_id: uuid.UUID
) -> Comment:
    comment = await db.scalar(
        select(Comment)
        .join(Review, Comment.review_id == Review.id)
        .join(Project, Review.project_id == Project.id)
        .where(
            Comment.id == comment_id,
            Comment.deleted_at.is_(None),
            Project.user_id == user.id,
            Project.deleted_at.is_(None),
        )
    )
    if comment is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Comment not found"
        )
    return comment


async def _resolve_active_review(db: AsyncSession, slug: str) -> Review:
    """Slug -> active review, applying the public rules (404/410/403). Kept
    local to avoid importing private helpers from the reviews module."""
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
    return review


async def _authenticate_guest(
    db: AsyncSession, slug: str, token: str | None
) -> tuple[Review, GuestSession]:
    review = await _resolve_active_review(db, slug)
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Guest token required (X-Guest-Token)",
        )
    guest = await db.scalar(
        select(GuestSession).where(GuestSession.session_token == token)
    )
    if guest is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid guest token"
        )
    if guest.review_id != review.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Guest token is not valid for this review",
        )
    return review, guest


# --- designer routes --------------------------------------------------------


@router.get("/projects/{project_id}/comments", response_model=list[CommentRead])
async def list_project_comments(
    project_id: uuid.UUID,
    status_filter: CommentStatus | None = Query(default=None, alias="status"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[CommentRead]:
    project = await _get_owned_project(db, current_user, project_id)
    stmt = (
        select(Comment)
        .options(*_AUTHOR_LOAD)
        .join(Review, Comment.review_id == Review.id)
        .where(Review.project_id == project.id, Comment.deleted_at.is_(None))
    )
    if status_filter is not None:
        stmt = stmt.where(Comment.status == status_filter.value)
    stmt = stmt.order_by(Comment.created_at.asc())
    result = await db.execute(stmt)
    return [_to_read(c) for c in result.scalars().all()]


@router.get("/reviews/{review_id}/comments", response_model=list[CommentRead])
async def list_review_comments(
    review_id: uuid.UUID,
    status_filter: CommentStatus | None = Query(default=None, alias="status"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[CommentRead]:
    review = await _get_owned_review(db, current_user, review_id)
    stmt = (
        select(Comment)
        .options(*_AUTHOR_LOAD)
        .where(Comment.review_id == review.id, Comment.deleted_at.is_(None))
    )
    if status_filter is not None:
        stmt = stmt.where(Comment.status == status_filter.value)
    stmt = stmt.order_by(Comment.created_at.asc())
    result = await db.execute(stmt)
    return [_to_read(c) for c in result.scalars().all()]


@router.post(
    "/reviews/{review_id}/comments",
    response_model=CommentRead,
    status_code=status.HTTP_201_CREATED,
)
async def create_designer_comment(
    review_id: uuid.UUID,
    data: CommentCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> CommentRead:
    """Designer-authored top-level pinned comment. Owner-scoped through the
    project; mirrors the guest CommentCreate payload (incl. region fields) but
    sets author_user_id instead of author_guest_id. Status defaults to open;
    screenshot_url stays null (filled later by the screenshot service)."""
    review = await _get_owned_review(db, current_user, review_id)
    comment = Comment(
        review_id=review.id,
        author_user_id=current_user.id,
        body=data.body,
        page_url=data.page_url,
        status="open",
        pin_x_percent=data.pin_x_percent,
        pin_y_percent=data.pin_y_percent,
        element_selector=data.element_selector,
        viewport_width=data.viewport_width,
        viewport_height=data.viewport_height,
        pin_x_absolute=data.pin_x_absolute,
        pin_y_absolute=data.pin_y_absolute,
        region_width=data.region_width,
        region_height=data.region_height,
        region_width_percent=data.region_width_percent,
        region_height_percent=data.region_height_percent,
        browser_name=data.browser_name,
        browser_version=data.browser_version,
        os_name=data.os_name,
        screen_width=data.screen_width,
        screen_height=data.screen_height,
    )
    db.add(comment)
    await db.commit()
    await db.refresh(comment)
    return _to_read(await _load_for_read(db, comment.id))


@router.patch("/comments/{comment_id}", response_model=CommentRead)
async def update_comment_status(
    comment_id: uuid.UUID,
    data: CommentStatusUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> CommentRead:
    comment = await _get_owned_comment(db, current_user, comment_id)
    comment.status = data.status.value
    await db.commit()
    return _to_read(await _load_for_read(db, comment.id))


@router.post(
    "/comments/{comment_id}/reply",
    response_model=CommentRead,
    status_code=status.HTTP_201_CREATED,
)
async def reply_to_comment(
    comment_id: uuid.UUID,
    data: CommentReply,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> CommentRead:
    parent = await _get_owned_comment(db, current_user, comment_id)
    reply = Comment(
        review_id=parent.review_id,
        parent_id=parent.id,
        author_user_id=current_user.id,
        body=data.body,
        page_url=parent.page_url,  # replies inherit the parent's page
        status="open",
    )
    db.add(reply)
    await db.commit()
    await db.refresh(reply)
    return _to_read(await _load_for_read(db, reply.id))


@router.delete("/comments/{comment_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_comment(
    comment_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Response:
    comment = await _get_owned_comment(db, current_user, comment_id)
    comment.deleted_at = datetime.now(timezone.utc)  # soft delete
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# --- guest routes (X-Guest-Token) -------------------------------------------


@router.post(
    "/r/{slug}/comments",
    response_model=CommentRead,
    status_code=status.HTTP_201_CREATED,
)
async def create_guest_comment(
    slug: str,
    data: CommentCreate,
    background_tasks: BackgroundTasks,
    x_guest_token: str | None = Header(default=None, alias="X-Guest-Token"),
    db: AsyncSession = Depends(get_db),
) -> CommentRead:
    review, guest = await _authenticate_guest(db, slug, x_guest_token)
    comment = Comment(
        review_id=review.id,
        author_guest_id=guest.id,
        body=data.body,
        page_url=data.page_url,
        status="open",
        pin_x_percent=data.pin_x_percent,
        pin_y_percent=data.pin_y_percent,
        element_selector=data.element_selector,
        viewport_width=data.viewport_width,
        viewport_height=data.viewport_height,
        pin_x_absolute=data.pin_x_absolute,
        pin_y_absolute=data.pin_y_absolute,
        region_width=data.region_width,
        region_height=data.region_height,
        region_width_percent=data.region_width_percent,
        region_height_percent=data.region_height_percent,
        browser_name=data.browser_name,
        browser_version=data.browser_version,
        os_name=data.os_name,
        screen_width=data.screen_width,
        screen_height=data.screen_height,
    )
    db.add(comment)
    await db.commit()
    await db.refresh(comment)
    # Pin-fallback screenshot (Section 9): best-effort, never blocks the reply.
    # Only capture when the guest-supplied page_url is actually on the
    # project's site — otherwise a guest could use a review link as a
    # screenshot service for arbitrary URLs.
    project_url = await db.scalar(
        select(Project.url).where(Project.id == review.project_id)
    )
    if project_url is not None and _same_bare_host(comment.page_url, project_url):
        background_tasks.add_task(
            capture_comment_screenshot, comment.id, comment.page_url
        )
    # Notify the project owner that a client left feedback (debounced/batched).
    # Best-effort and post-response: never blocks or breaks comment creation.
    background_tasks.add_task(notify_new_guest_comment, comment.id)
    return _to_read(await _load_for_read(db, comment.id), is_mine=True)


@router.get("/r/{slug}/comments", response_model=list[CommentRead])
async def list_guest_comments(
    slug: str,
    x_guest_token: str | None = Header(default=None, alias="X-Guest-Token"),
    db: AsyncSession = Depends(get_db),
) -> list[CommentRead]:
    """List a review's comments for the guest canvas. Per CLAUDE.md Section 9
    the unguessable slug is itself the access credential, so reading the pins
    does NOT require a token — a first-time visitor sees every comment (with
    is_mine=False) before naming themselves. A valid token additionally flags
    the guest's own comments. A present-but-invalid or cross-review token is
    still rejected (401/403) rather than silently downgraded."""
    review = await _resolve_active_review(db, slug)
    guest: GuestSession | None = None
    if x_guest_token:
        guest = await db.scalar(
            select(GuestSession).where(GuestSession.session_token == x_guest_token)
        )
        if guest is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid guest token"
            )
        if guest.review_id != review.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Guest token is not valid for this review",
            )
    result = await db.execute(
        select(Comment)
        .options(*_AUTHOR_LOAD)
        .where(Comment.review_id == review.id, Comment.deleted_at.is_(None))
        .order_by(Comment.created_at.asc())
    )
    return [
        _to_read(c, is_mine=(guest is not None and c.author_guest_id == guest.id))
        for c in result.scalars().all()
    ]
