"""Async database engine, session factory, and schema bootstrap.

Phase 1 creates tables with `SQLModel.metadata.create_all`. That is
enough to run and test, but it is NOT a migration tool: it only creates
missing tables and never alters existing ones. Before we change a live
schema we should add Alembic (an extra dependency) — flagged for later,
not pulled in without your sign-off.
"""

from __future__ import annotations

from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlmodel import SQLModel

from app.config import settings

engine: AsyncEngine = create_async_engine(
    settings.database_url,
    echo=settings.db_echo,
    pool_pre_ping=True,
)

async_session_maker = async_sessionmaker(
    engine, class_=AsyncSession, expire_on_commit=False
)


async def init_db() -> None:
    """Create any missing tables. Imports models so metadata is populated."""
    from app import models  # noqa: F401  (registers tables on SQLModel.metadata)

    async with engine.begin() as conn:
        await conn.run_sync(SQLModel.metadata.create_all)


async def get_session() -> AsyncGenerator[AsyncSession, None]:
    """FastAPI dependency yielding a scoped async session."""
    async with async_session_maker() as session:
        yield session
