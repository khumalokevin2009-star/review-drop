"""Shared test fixtures for DB-backed API tests.

These are integration tests against a real Postgres (CLAUDE.md Section 14: tests
use a separate Postgres DB). If no test database is reachable, the whole module
is skipped rather than failed, so the suite still runs in DB-less environments.

Point at a DB with TEST_DATABASE_URL; defaults to a local ``reviewdrop_test``.
"""

from __future__ import annotations

import os
import uuid

import pytest
import pytest_asyncio
from fastapi import HTTPException
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from app.api.deps import get_current_user, get_db
from app.core.database import Base
from app.main import app
from app.models.project import Project
from app.models.user import User

TEST_DATABASE_URL = os.getenv(
    "TEST_DATABASE_URL",
    "postgresql+asyncpg://reviewdrop:reviewdrop@localhost:5432/reviewdrop_test",
)


class AuthState:
    """Mutable holder so a test can switch the 'logged-in' user per request."""

    def __init__(self) -> None:
        self.user: User | None = None


@pytest_asyncio.fixture
async def engine():
    # NullPool: a fresh connection per use, so connections never bind to a
    # previous test's event loop (a classic asyncpg + pytest-asyncio pitfall).
    eng = create_async_engine(TEST_DATABASE_URL, poolclass=NullPool)
    try:
        async with eng.begin() as conn:
            await conn.run_sync(Base.metadata.drop_all)
            await conn.run_sync(Base.metadata.create_all)
    except Exception as exc:  # noqa: BLE001 - any connect/DDL failure => skip
        await eng.dispose()
        pytest.skip(f"Postgres test DB unavailable: {exc}")
    yield eng
    async with eng.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await eng.dispose()


@pytest.fixture
def session_factory(engine) -> async_sessionmaker:
    return async_sessionmaker(engine, expire_on_commit=False)


@pytest.fixture
def auth() -> AuthState:
    return AuthState()


@pytest_asyncio.fixture
async def client(engine, session_factory, auth):
    async def _override_get_db():
        async with session_factory() as session:
            yield session

    def _override_get_current_user() -> User:
        if auth.user is None:
            raise HTTPException(status_code=401, detail="no test user set")
        return auth.user

    app.dependency_overrides[get_db] = _override_get_db
    app.dependency_overrides[get_current_user] = _override_get_current_user
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c
    app.dependency_overrides.clear()


# --- seed helpers -----------------------------------------------------------


async def make_user(
    session_factory, plan: str = "free", password: str | None = None
) -> User:
    """Seed a user. Pass ``password`` when the test exercises real password
    verification (bcrypt is slow, so the default stays a placeholder hash)."""
    from app.core import security

    async with session_factory() as s:
        user = User(
            email=f"{uuid.uuid4().hex[:12]}@test.co",
            hashed_password=security.hash_password(password) if password else "x",
            full_name="Tester",
            plan=plan,
        )
        s.add(user)
        await s.commit()
        await s.refresh(user)
        return user


async def make_project(
    session_factory, user: User, name: str = "P", status: str = "active"
) -> Project:
    async with session_factory() as s:
        project = Project(
            user_id=user.id,
            name=name,
            url="https://staging.example.com",
            status=status,
        )
        s.add(project)
        await s.commit()
        await s.refresh(project)
        return project
