"""New-comment email notifications with debounce batching (CLAUDE.md Section 11).

Trigger: a GUEST (client) comment on a review notifies the project OWNER (the
designer). Designer-authored comments never notify. Runs as a FastAPI
BackgroundTask, so the comment is already committed and the API has already
responded before this executes — sending can never block or break comment
creation, and any failure here is swallowed.

Batching approach (leading-edge debounce / coalesce):
    Each review row carries ``last_notified_at`` and ``pending_comment_count``.
    On every guest comment we (under a row lock, so a burst can't double-send):
      1. increment pending_comment_count;
      2. if no email has gone out for this review within
         EMAIL_BATCH_WINDOW_MINUTES, SEND now — the email summarises every
         comment accumulated since the last send ("{N} new comments") — then
         stamp last_notified_at = now and reset pending to 0;
      3. otherwise COALESCE: keep the pending count and send nothing; the next
         comment that crosses the window boundary carries the summary.

    This is a deliberately lightweight v1 — no job queue, no scheduler. Known
    trade-off: the *trailing* comments of a burst aren't emailed until the next
    comment after the cooldown (a daily digest, out of scope here, would mop
    those up). The row lock is released before the network send, so a slow Resend
    call never holds a DB lock.
"""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timedelta, timezone

from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.models.comment import Comment
from app.models.guest import GuestSession
from app.models.project import Project
from app.models.review import Review
from app.models.user import User
from app.services import email_service
from app.services.email_templates import render_new_comment_email

logger = logging.getLogger(__name__)

_PREVIEW_LEN = 140


def _preview(body: str) -> str:
    """Single-line, length-capped preview of a comment body for the email."""
    collapsed = " ".join((body or "").split())
    if len(collapsed) <= _PREVIEW_LEN:
        return collapsed
    return collapsed[: _PREVIEW_LEN - 1].rstrip() + "…"


def _subject(project_name: str, count: int) -> str:
    if count > 1:
        return f"{count} new comments on {project_name}"
    return f"New feedback on {project_name}"


async def notify_new_guest_comment(comment_id: uuid.UUID) -> None:
    """Background task: a guest left ``comment_id`` — email the project owner,
    debounced per review. Best-effort; never raises."""
    try:
        async with AsyncSessionLocal() as db:
            comment = await db.get(Comment, comment_id)
            if comment is None or comment.deleted_at is not None:
                return
            # Defence in depth: the route only enqueues guest comments, but never
            # notify for a designer-authored one.
            if comment.author_guest_id is None:
                return

            # Lock the review row so concurrent comments serialise here and can't
            # both claim the same send window.
            review = await db.get(Review, comment.review_id, with_for_update=True)
            if review is None:
                return
            project = await db.get(Project, review.project_id)
            if project is None or project.deleted_at is not None:
                return
            owner = await db.get(User, project.user_id)
            if owner is None or not owner.email:
                return
            guest = await db.get(GuestSession, comment.author_guest_id)
            commenter_name = (guest.display_name if guest else None) or "A client"

            now = datetime.now(timezone.utc)
            window = timedelta(minutes=settings.EMAIL_BATCH_WINDOW_MINUTES)
            review.pending_comment_count = (review.pending_comment_count or 0) + 1

            last = review.last_notified_at
            if last is not None and (now - last) < window:
                # Coalesce into the current window — keep counting, send nothing.
                await db.commit()
                logger.info(
                    "Comment %s coalesced into review %s window (pending=%s)",
                    comment_id,
                    review.id,
                    review.pending_comment_count,
                )
                return

            # Claim the send: snapshot the count, stamp + reset, release the lock.
            count = review.pending_comment_count
            review.last_notified_at = now
            review.pending_comment_count = 0
            await db.commit()

            url = f"{settings.FRONTEND_URL.rstrip('/')}/reviews/{review.id}/canvas"
            html, text = render_new_comment_email(
                project_name=project.name,
                review_name=review.name,
                commenter_name=commenter_name,
                preview=_preview(comment.body),
                count=count,
                url=url,
            )
            result = await email_service.send_email(
                to=owner.email,
                subject=_subject(project.name, count),
                html=html,
                text=text,
            )
            logger.info(
                "New-comment email to %s for review %s: ok=%s (%s, count=%s)",
                owner.email,
                review.id,
                result.ok,
                result.detail,
                count,
            )
    except Exception:  # noqa: BLE001 — a notification must never break anything
        logger.exception("notify_new_guest_comment failed for %s", comment_id)
