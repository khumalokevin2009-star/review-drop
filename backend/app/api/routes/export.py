"""Comment export routes (CLAUDE.md Sections 8, 9).

    GET /reviews/{review_id}/export?format=csv|pdf

JWT-authenticated and owner-scoped through the parent project — exactly the
pattern used by the review/comment routes (a cross-user request 404s and never
reveals the resource exists). Export is a PAID feature (Section 9: Pro + Studio
only): the Pro gate is checked AFTER ownership and reads ``user.plan``, which
the billing webhook keeps as the Stripe-driven projection of the subscription
(``billing_service.plan_for_status`` — trialing/active ⇒ 'pro', past_due or a
lapsed cancellation ⇒ 'free'). The frontend is never trusted for plan status.

Scope is the REVIEW (comments are keyed by ``review_id`` and the canvas comment
list is per-review). Only top-level comments are exported — the numbered pins
the designer sees in the sidebar; replies live inside a thread and carry no pin
number. The file is returned as a download (Content-Disposition: attachment).
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import get_current_user, get_db
from app.core.config import settings
from app.models.comment import Comment
from app.models.project import Project
from app.models.review import Review
from app.models.user import User
from app.schemas.export import ExportFormat
from app.services import export_service

router = APIRouter(tags=["export"])

# Section 9: export is included on Pro and Studio, excluded on Free. `user.plan`
# is already the Stripe-driven access projection, so this is the consistent gate.
EXPORT_PLANS = frozenset({"pro", "studio"})

_MEDIA_TYPES = {
    ExportFormat.csv: "text/csv; charset=utf-8",
    ExportFormat.pdf: "application/pdf",
}


async def _get_owned_review(
    db: AsyncSession, user: User, review_id: uuid.UUID
) -> tuple[Review, Project]:
    """Owner-scoped (review, project) lookup. 404 — not 403 — when the review
    doesn't exist or isn't the caller's, matching the other designer routes."""
    row = (
        await db.execute(
            select(Review, Project)
            .join(Project, Review.project_id == Project.id)
            .where(
                Review.id == review_id,
                Project.user_id == user.id,
                Project.deleted_at.is_(None),
            )
        )
    ).first()
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Review not found"
        )
    return row[0], row[1]


def _to_record(comment: Comment) -> export_service.CommentRecord:
    """Flatten an ORM comment (with eager-loaded authors) into the export shape,
    resolving the author's display name and type (designer vs client)."""
    if comment.author_user_id is not None:
        author_type = "designer"
        author_name = (
            comment.author_user.full_name if comment.author_user else None
        ) or "Designer"
    else:
        author_type = "client"
        author_name = (
            comment.author_guest.display_name if comment.author_guest else None
        ) or "Guest"
    return export_service.CommentRecord(
        page_url=comment.page_url,
        status=comment.status,
        author_name=author_name,
        author_type=author_type,
        body=comment.body,
        region_width=comment.region_width,
        region_height=comment.region_height,
        created_at=comment.created_at,
    )


@router.get("/reviews/{review_id}/export")
async def export_review_comments(
    review_id: uuid.UUID,
    fmt: ExportFormat = Query(default=ExportFormat.csv, alias="format"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Response:
    review, project = await _get_owned_review(db, current_user, review_id)
    # Pro gate AFTER ownership so a cross-user export always 404s (never leaking
    # the gate). Enforced server-side; the frontend is never trusted (Section 12).
    if current_user.plan not in EXPORT_PLANS:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Export is a Pro feature"
        )

    result = await db.execute(
        select(Comment)
        .options(
            selectinload(Comment.author_user),
            selectinload(Comment.author_guest),
        )
        .where(
            Comment.review_id == review.id,
            Comment.deleted_at.is_(None),
            Comment.parent_id.is_(None),  # top-level pins only (matches the sidebar)
        )
        # id is a deterministic tiebreak so same-timestamp pins number the same
        # here and on the canvas (comments list uses the same secondary key).
        .order_by(Comment.created_at.asc(), Comment.id.asc())
    )
    records = [_to_record(c) for c in result.scalars().all()]
    groups = export_service.group_and_number(records)
    filename = export_service.export_filename(project.name, review.name, fmt.value)

    if fmt is ExportFormat.csv:
        body = export_service.comments_to_csv(groups).encode("utf-8")
    else:
        review_url = f"{settings.FRONTEND_URL.rstrip('/')}/r/{review.slug}"
        body = export_service.comments_to_pdf(
            groups,
            project_name=project.name,
            review_name=review.name,
            review_url=review_url,
            exported_at=datetime.now(timezone.utc),
        )

    return Response(
        content=body,
        media_type=_MEDIA_TYPES[fmt],
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            # So a cross-origin fetch (dev: :5173 → :8000) can read the filename.
            "Access-Control-Expose-Headers": "Content-Disposition",
        },
    )
