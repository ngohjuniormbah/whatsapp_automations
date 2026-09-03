"""APScheduler worker that delivers due scheduled messages.

A single interval job polls `scheduled_message` for rows whose `send_at`
has passed and that haven't been sent, then sends them and marks them
sent.

⚠️ WhatsApp policy: a business-initiated message sent MORE THAN 24 HOURS
after the customer's last message must use a **pre-approved WhatsApp
template** (Meta rule, enforced by Twilio). The plain `send_whatsapp`
call below only works inside the 24h session window. The template path is
stubbed and clearly marked — wire an approved template + Twilio Content
SID before relying on reminders that fall outside the window.
"""

from __future__ import annotations

import logging

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from sqlmodel import select

from app import models
from app.db import async_session_maker
from app.models import utcnow
from app.twilio_client import send_whatsapp

logger = logging.getLogger(__name__)

scheduler = AsyncIOScheduler()
POLL_SECONDS = 60


def render_template(template_name: str, payload: dict) -> str:
    """Render a scheduled message body from its template + payload.

    In production these map to APPROVED WhatsApp templates (see the module
    warning). For now we render local text so the flow is testable.
    """
    if template_name == "appointment_reminder":
        return (
            f"Rappel 🔔 Vous avez un rendez-vous pour « {payload.get('service', '')} » "
            f"le {payload.get('start_at', '')}. À bientôt !"
        )
    return payload.get("body", "Vous avez un nouveau message.")


async def dispatch_due_messages() -> int:
    """Send all due, unsent scheduled messages. Returns how many were sent."""
    sent = 0
    async with async_session_maker() as session:
        due = (
            await session.execute(
                select(models.ScheduledMessage)
                .where(
                    models.ScheduledMessage.sent == False,  # noqa: E712
                    models.ScheduledMessage.send_at <= utcnow(),
                )
                .limit(50)
            )
        ).scalars().all()

        for sm in due:
            merchant = await session.get(models.Merchant, sm.merchant_id)
            if merchant is None:
                sm.sent = True  # orphaned; don't retry forever
                continue
            body = render_template(sm.template_name, sm.payload)
            # NOTE: outside the 24h window this MUST be an approved template.
            await send_whatsapp(
                to=sm.customer_number, from_=merchant.whatsapp_number, body=body
            )
            sm.sent = True
            sent += 1

        await session.commit()
    if sent:
        logger.info("Dispatched %d scheduled message(s).", sent)
    return sent


def start_scheduler() -> None:
    if not scheduler.running:
        scheduler.add_job(
            dispatch_due_messages,
            "interval",
            seconds=POLL_SECONDS,
            id="dispatch_due",
            replace_existing=True,
            coalesce=True,
            max_instances=1,
        )
        scheduler.start()
        logger.info("Scheduler started (poll every %ds).", POLL_SECONDS)


def shutdown_scheduler() -> None:
    if scheduler.running:
        scheduler.shutdown(wait=False)
