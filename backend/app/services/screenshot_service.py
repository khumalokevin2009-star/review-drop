"""Screenshot service — Playwright captures for pin fallbacks and thumbnails
(CLAUDE.md Sections 5, 7, 9).

Design notes:

* Scale-to-zero safe: Chromium launches per job and is ALWAYS closed in
  ``finally`` — no long-lived browser to leak between requests.
* Concurrency-capped: a module semaphore limits simultaneous Chromium
  instances (each costs hundreds of MB; the Render target has ~2GB).
* SSRF-guarded: targets are validated with the proxy's resolver before the
  browser (which has full network access) navigates anywhere.
* Failure-isolated: the ``capture_and_store`` / background-task layer never
  raises — parent flows (project create, guest comment) must never break
  because a screenshot failed (Section 9: degrade, don't error).
"""

from __future__ import annotations

import asyncio
import logging
import uuid

from app.core.database import AsyncSessionLocal
from app.services.proxy_service import BlockedURLError, ProxyError, validate_target_url
from app.services.storage_service import StorageError, get_storage

logger = logging.getLogger(__name__)

VIEWPORT = {"width": 1440, "height": 900}
NAV_TIMEOUT_MS = 15_000  # hard cap on initial navigation
JOB_TIMEOUT_S = 45.0  # hard cap on the whole capture job
JPEG_QUALITY = 80

# Each Chromium instance costs ~300-500MB; cap simultaneous launches so a
# burst of captures can't OOM the 2GB Render instance. Excess jobs queue.
_MAX_CONCURRENT_CAPTURES = 2
_capture_semaphore = asyncio.Semaphore(_MAX_CONCURRENT_CAPTURES)

# Same plain-Chrome UA the proxy uses — staging hosts block "weird" agents.
_USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36"
)

# Best-effort cookie-consent dismissal: common accept-button selectors across
# the big consent platforms (OneTrust, Cookiebot, Quantcast, CookieYes, ...).
_CONSENT_SELECTORS = (
    "#onetrust-accept-btn-handler",
    "#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll",
    "button#L2AGLb",  # google.com consent
    ".qc-cmp2-summary-buttons button[mode=primary]",
    ".cky-btn-accept",
    "#cookie_action_close_header",
    "button[aria-label*='accept cookies' i]",
    "button[id*='accept-cookies' i]",
)


class ScreenshotError(Exception):
    """Capture failed; callers treat screenshots as best-effort."""


async def capture(url: str) -> bytes:
    """Capture a 1440x900 JPEG of ``url``. Raises ScreenshotError on failure.

    Survives: networkidle never settling (persistent connections), consent
    overlays, lazy-loaded images, slow webfonts. The initial navigation must
    reach DOMContentLoaded within NAV_TIMEOUT_MS or the job fails.
    """
    try:
        await validate_target_url(url)
    except (BlockedURLError, ProxyError) as exc:
        raise ScreenshotError(f"URL refused: {exc}") from exc

    try:
        from playwright.async_api import (
            Error as PlaywrightError,
            TimeoutError as PlaywrightTimeout,
            async_playwright,
        )
    except ImportError as exc:  # pragma: no cover — env without playwright
        raise ScreenshotError("Playwright is not installed") from exc

    async with _capture_semaphore:
        try:
            async with asyncio.timeout(JOB_TIMEOUT_S):
                async with async_playwright() as p:
                    browser = await p.chromium.launch(
                        headless=True,
                        args=[
                            # /dev/shm is tiny in containers; use /tmp instead.
                            "--disable-dev-shm-usage",
                            # python:slim runs as root without userns — the
                            # Chromium sandbox can't start. Acceptable for v1;
                            # noted as a known limitation.
                            "--no-sandbox",
                            "--disable-gpu",
                        ],
                    )
                    try:
                        context = await browser.new_context(
                            viewport=VIEWPORT,
                            user_agent=_USER_AGENT,
                            device_scale_factor=1,
                        )
                        page = await context.new_page()

                        # Hard requirement: the document must load.
                        await page.goto(
                            url,
                            wait_until="domcontentloaded",
                            timeout=NAV_TIMEOUT_MS,
                        )
                        # Soft goal: quiet network. Sites with analytics
                        # beacons/websockets never go idle — don't fail on it.
                        try:
                            await page.wait_for_load_state(
                                "networkidle", timeout=NAV_TIMEOUT_MS
                            )
                        except PlaywrightTimeout:
                            pass

                        await _dismiss_consent_overlays(page)
                        await _settle_lazy_content(page)

                        return await page.screenshot(
                            type="jpeg",
                            quality=JPEG_QUALITY,
                            full_page=False,
                        )
                    finally:
                        # A wedged Chromium must not hang us in cleanup —
                        # bound the close; the playwright context exit kills
                        # the driver (and with it the browser) regardless.
                        try:
                            await asyncio.wait_for(browser.close(), timeout=5)
                        except Exception:  # noqa: BLE001
                            logger.warning("Browser close timed out; driver exit will reap it")
        except ScreenshotError:
            raise
        except TimeoutError as exc:  # asyncio.timeout — whole job overran
            raise ScreenshotError(f"Capture timed out for {url}") from exc
        except (PlaywrightError, PlaywrightTimeout) as exc:
            raise ScreenshotError(f"Capture failed for {url}: {exc}") from exc


async def _dismiss_consent_overlays(page) -> None:  # noqa: ANN001 — Page type needs playwright at import
    """Best-effort: click the first visible consent-accept button, if any."""
    for selector in _CONSENT_SELECTORS:
        try:
            target = page.locator(selector).first
            if await target.is_visible(timeout=250):
                await target.click(timeout=500)
                await page.wait_for_timeout(300)  # let the overlay animate out
                return
        except Exception:  # noqa: BLE001 — any failure here is fine
            continue


async def _settle_lazy_content(page) -> None:  # noqa: ANN001
    """Nudge lazy-loaded content: scroll down in steps, return to top, and
    give webfonts a bounded chance to finish."""
    try:
        await page.evaluate(
            """
            async () => {
              const step = window.innerHeight;
              const limit = Math.min(document.body?.scrollHeight || 0, step * 4);
              for (let y = 0; y <= limit; y += step) {
                window.scrollTo(0, y);
                await new Promise(r => setTimeout(r, 150));
              }
              window.scrollTo(0, 0);
            }
            """
        )
        await page.wait_for_timeout(400)  # settle after scrolling back up
        # Webfonts: bounded wait so an unreachable font CDN can't stall us.
        await asyncio.wait_for(
            page.evaluate("document.fonts ? document.fonts.ready : true"),
            timeout=3.0,
        )
    except Exception:  # noqa: BLE001 — cosmetic best-effort only
        pass


# --- storage + background-task layer (never raises) ---------------------------


async def capture_and_store(url: str, key_prefix: str) -> str | None:
    """Capture ``url`` and upload it; returns the public URL, or None on any
    failure. This is the only function background tasks should call."""
    try:
        image = await capture(url)
        key = f"{key_prefix}/{uuid.uuid4().hex}.jpg"
        return await get_storage().upload(key, image, "image/jpeg")
    except (ScreenshotError, StorageError) as exc:
        logger.warning("Screenshot skipped for %s: %s", url, exc)
        return None
    except Exception:  # noqa: BLE001 — never let a capture break a parent flow
        logger.exception("Unexpected screenshot failure for %s", url)
        return None


async def capture_project_thumbnail(project_id: uuid.UUID, url: str) -> None:
    """Background task: capture a project's URL and store thumbnail_url."""
    public_url = await capture_and_store(url, f"thumbnails/{project_id}")
    if public_url is None:
        return
    try:
        from app.models.project import Project

        async with AsyncSessionLocal() as db:
            project = await db.get(Project, project_id)
            if project is not None and project.deleted_at is None:
                project.thumbnail_url = public_url
                await db.commit()
    except Exception:  # noqa: BLE001
        logger.exception("Failed to save thumbnail for project %s", project_id)


async def capture_comment_screenshot(comment_id: uuid.UUID, url: str) -> None:
    """Background task: capture a comment's page and store screenshot_url
    (the pin system's last-resort fallback, Section 9)."""
    public_url = await capture_and_store(url, f"comments/{comment_id}")
    if public_url is None:
        return
    try:
        from app.models.comment import Comment

        async with AsyncSessionLocal() as db:
            comment = await db.get(Comment, comment_id)
            if comment is not None and comment.deleted_at is None:
                comment.screenshot_url = public_url
                await db.commit()
    except Exception:  # noqa: BLE001
        logger.exception("Failed to save screenshot for comment %s", comment_id)
