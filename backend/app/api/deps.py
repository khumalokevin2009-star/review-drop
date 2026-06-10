"""FastAPI dependencies.

Only the database session dependency is provided for this task. Auth
dependencies (``get_current_user``) are added by the Auth agent.
"""

from __future__ import annotations

from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import AsyncSessionLocal


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """Yield an async DB session, ensuring it is closed after the request."""
    async with AsyncSessionLocal() as session:
        yield session
