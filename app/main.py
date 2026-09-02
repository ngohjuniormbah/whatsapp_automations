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
from app.scheduler import shutdown_scheduler, start_scheduler
from app.seed import seed_if_empty


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Create tables, seed a demo merchant if empty, start the scheduler.
    await init_db()
    await seed_if_empty()
    start_scheduler()
    yield
    shutdown_scheduler()
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
