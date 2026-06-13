"""FastAPI application entrypoint.

This task wires up the app instance, CORS, and a health check only. API
routers are added by their respective agents in later phases (CLAUDE.md
Section 16 Build Order).
"""

from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from app.api.deps import limiter
from app.api.routes import auth, comments, projects, proxy, reviews, screenshots
from app.core.config import settings
from app.services.storage_service import LocalStorage, get_storage

app = FastAPI(title=settings.APP_NAME)

# Rate limiting (CLAUDE.md Section 13) — limiter defined in deps, wired here.
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# CORS — DEV: a localhost/127.0.0.1 regex so ANY Vite port works without
# reconfiguring (Vite auto-increments 5173→5174→… when a port is taken, and a
# fixed allow-list silently breaks those origins). allow_origin_regex echoes
# the matched origin, so allow_credentials still works.
# PRODUCTION: drop the regex and lock allow_origins to the production domain.
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"^http://(localhost|127\.0\.0\.1)(:\d+)?$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# API routers (all under /api/v1 per Section 8).
app.include_router(auth.router, prefix="/api/v1")
app.include_router(proxy.router, prefix="/api/v1")
app.include_router(projects.router, prefix="/api/v1")
app.include_router(reviews.router, prefix="/api/v1")
app.include_router(comments.router, prefix="/api/v1")
app.include_router(screenshots.router, prefix="/api/v1")

# Local-dev storage fallback: when R2 isn't configured, screenshots live in
# ./storage and are served here so the feature works without an R2 account.
_storage = get_storage()
if isinstance(_storage, LocalStorage):
    app.mount("/storage", StaticFiles(directory=_storage.root), name="storage")


@app.get("/health", tags=["health"])
async def health() -> dict[str, str]:
    return {"status": "ok", "app": settings.APP_NAME, "env": settings.APP_ENV}
