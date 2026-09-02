"""FastAPI entrypoint.

Phase 1: schema bootstrap + dev seed on startup, plus a /health route
that also reports database connectivity. Webhook, agent, tools, and the
scheduler arrive in later phases.
"""

from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from sqlalchemy import text

from app.config import settings
from app.db import engine, init_db
from app.routers import whatsapp
from app.seed import seed_if_empty


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Create tables, then seed a demo merchant if the DB is empty.
    await init_db()
    await seed_if_empty()
    yield
    await engine.dispose()


app = FastAPI(title="WhatsApp AI Agent", version="0.1.0", lifespan=lifespan)
app.include_router(whatsapp.router)


@app.get("/health")
async def health() -> dict:
    """Liveness + DB connectivity check."""
    db_ok = True
    try:
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
    except Exception:
        db_ok = False
    return {"status": "ok", "env": settings.app_env, "db": db_ok}
