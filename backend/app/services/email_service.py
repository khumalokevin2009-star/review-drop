"""Transactional email transport — a thin async wrapper over Resend's HTTP API
(CLAUDE.md Sections 5, 11).

Design:
* No SDK — Resend's ``POST /emails`` is a single JSON request, so we use httpx
  directly (async, no extra dependency).
* ``send_email`` NEVER raises into a caller's request flow. Every failure
  (disabled, unconfigured, network error, 4xx/5xx) is caught, logged, and
  surfaced as an ``EmailResult`` so notification code can stay best-effort.
* It no-ops gracefully when ``EMAIL_ENABLED`` is false or ``RESEND_API_KEY`` is
  unset, so local dev and the test suite never send real mail.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)

RESEND_ENDPOINT = "https://api.resend.com/emails"
_TIMEOUT_S = 10.0


@dataclass(frozen=True)
class EmailResult:
    """Outcome of a send attempt. ``ok`` is True only when Resend accepted it."""

    ok: bool
    detail: str


async def send_email(
    *, to: str, subject: str, html: str, text: str | None = None
) -> EmailResult:
    """Send one transactional email via Resend. Returns an ``EmailResult`` and
    never raises (callers run it best-effort, often from a background task)."""
    if not settings.EMAIL_ENABLED:
        logger.info("Email disabled — skipping send to %s (%r)", to, subject)
        return EmailResult(ok=False, detail="email disabled")
    if not settings.RESEND_API_KEY:
        logger.info("No RESEND_API_KEY — skipping send to %s (%r)", to, subject)
        return EmailResult(ok=False, detail="email not configured")

    payload: dict[str, object] = {
        "from": settings.EMAIL_FROM,
        "to": [to],
        "subject": subject,
        "html": html,
    }
    if text:
        payload["text"] = text

    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT_S) as http:
            resp = await http.post(
                RESEND_ENDPOINT,
                headers={"Authorization": f"Bearer {settings.RESEND_API_KEY}"},
                json=payload,
            )
        if resp.status_code >= 400:
            logger.warning(
                "Resend rejected email to %s (%s): %s",
                to,
                resp.status_code,
                resp.text[:500],
            )
            return EmailResult(ok=False, detail=f"resend {resp.status_code}")
        logger.info("Email sent to %s (%r)", to, subject)
        return EmailResult(ok=True, detail="sent")
    except Exception as exc:  # noqa: BLE001 — never let email break a caller
        logger.exception("Email send to %s raised: %s", to, exc)
        return EmailResult(ok=False, detail="exception")
