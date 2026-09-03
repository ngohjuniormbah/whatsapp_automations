"""Outbound WhatsApp via the Twilio REST API.

We reply out-of-band (REST) rather than inline TwiML because the agent
can take a few seconds to think, and the webhook must return fast so
Twilio doesn't time out. The Twilio SDK is sync, so we run it in a
worker thread to stay non-blocking.

When credentials are missing (local dev without Twilio) we log what we
*would* send instead of failing — so the whole pipeline is testable
without an account.
"""

from __future__ import annotations

import logging

import anyio

from app.config import settings

logger = logging.getLogger(__name__)


async def send_whatsapp(*, to: str, from_: str, body: str) -> None:
    if not (settings.twilio_account_sid and settings.twilio_auth_token):
        logger.warning("[twilio disabled] would send %s -> %s: %s", from_, to, body)
        return

    def _send() -> None:
        from twilio.rest import Client  # imported lazily so tests don't need it

        client = Client(settings.twilio_account_sid, settings.twilio_auth_token)
        client.messages.create(from_=from_, to=to, body=body)

    try:
        await anyio.to_thread.run_sync(_send)
    except Exception:  # noqa: BLE001 — never let a send failure crash the worker
        logger.exception("Twilio send failed (%s -> %s)", from_, to)
