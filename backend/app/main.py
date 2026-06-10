"""FastAPI application entrypoint.

This task wires up the app instance, CORS, and a health check only. API
routers are added by their respective agents in later phases (CLAUDE.md
Section 16 Build Order).
"""

from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings

app = FastAPI(title=settings.APP_NAME)

# CORS — restricted to the frontend origin only (CLAUDE.md Section 13).
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.FRONTEND_URL],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health", tags=["health"])
async def health() -> dict[str, str]:
    return {"status": "ok", "app": settings.APP_NAME, "env": settings.APP_ENV}
