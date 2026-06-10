"""FastAPI application entrypoint.

This task wires up the app instance, CORS, and a health check only. API
routers are added by their respective agents in later phases (CLAUDE.md
Section 16 Build Order).
"""

from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from app.api.deps import limiter
from app.api.routes import auth, proxy
from app.core.config import settings

app = FastAPI(title=settings.APP_NAME)

# Rate limiting (CLAUDE.md Section 13) — limiter defined in deps, wired here.
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# CORS — restricted to the frontend origin only (CLAUDE.md Section 13).
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.FRONTEND_URL],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# API routers (all under /api/v1 per Section 8).
app.include_router(auth.router, prefix="/api/v1")
app.include_router(proxy.router, prefix="/api/v1")


@app.get("/health", tags=["health"])
async def health() -> dict[str, str]:
    return {"status": "ok", "app": settings.APP_NAME, "env": settings.APP_ENV}
