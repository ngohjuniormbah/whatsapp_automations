"""Inbound-message processing: run the agent and reply.

Runs in a background task AFTER the webhook has returned 200 to Twilio,
in its own DB session (the request's session is already closed). Loads
per-merchant context, runs the agent with its tools, persists the reply
and any state changes, then sends the reply over WhatsApp.
"""

from __future__ import annotations

import logging
import uuid

from pydantic_ai.models import Model
from sqlmodel import select

from app import crud, models, prompts
from app.agent import AgentDeps, agent, get_model
from app.config import settings
from app.db import async_session_maker
from app.models import MessageRole, utcnow
from app.twilio_client import send_whatsapp

logger = logging.getLogger(__name__)

# How many recent turns to feed the model (the "rolling window").
RECENT_WINDOW = 10

FALLBACK_REPLY = (
    "Désolé, petit souci technique 🙏 Un membre de l'équipe vous répond bientôt."
)


async def _recent_messages(session, conversation_id: uuid.UUID) -> list[models.Message]:
    rows = (
        await session.execute(
            select(models.Message)
            .where(models.Message.conversation_id == conversation_id)
            .order_by(models.Message.created_at.desc())
            .limit(RECENT_WINDOW)
        )
    ).scalars().all()
    return list(reversed(rows))


async def _catalog_text(session, merchant_id: uuid.UUID) -> str:
    rows = (
        await session.execute(
            select(models.CatalogItem).where(models.CatalogItem.merchant_id == merchant_id)
        )
    ).scalars().all()
    return prompts.summarize_catalog(rows)


async def _services_text(session, merchant_id: uuid.UUID) -> str:
    rows = (
        await session.execute(
            select(models.Service).where(models.Service.merchant_id == merchant_id)
        )
    ).scalars().all()
    return prompts.summarize_services(rows)


async def process_and_reply(
    merchant_id: uuid.UUID,
    conversation_id: uuid.UUID,
    from_number: str,
    *,
    model: Model | None = None,
) -> str:
    """Generate the agent's reply for the latest inbound message and send it.

    `model` is injectable so tests can pass a fake model; production uses
    the configured OpenRouter model. Returns the reply text (also handy
    for tests).
    """
    reply = FALLBACK_REPLY
    sender = ""
    async with async_session_maker() as session:
        merchant = await session.get(models.Merchant, merchant_id)
        conversation = await session.get(models.Conversation, conversation_id)
        if merchant is None or conversation is None:
            logger.error("process_and_reply: missing merchant/conversation")
            return reply
        sender = merchant.whatsapp_number

        recent = await _recent_messages(session, conversation_id)
        # The latest customer message is the prompt; the rest is context.
        user_prompt = ""
        for m in reversed(recent):
            if m.role == MessageRole.customer.value:
                user_prompt = m.body
                break
        history = [m for m in recent if m.body != user_prompt]

        deps = AgentDeps(
            session=session,
            merchant=merchant,
            conversation=conversation,
            customer_number=from_number,
            catalog_text=await _catalog_text(session, merchant_id),
            services_text=await _services_text(session, merchant_id),
            recent_text=prompts.format_recent(history),
        )

        try:
            result = await agent.run(
                user_prompt or "(the customer sent an empty message)",
                deps=deps,
                model=model or get_model(),
            )
            reply = (result.output or "").strip() or FALLBACK_REPLY
        except Exception:  # noqa: BLE001 — a bad LLM call must not lose the message
            logger.exception("Agent run failed for conversation %s", conversation_id)
            reply = FALLBACK_REPLY

        await crud.add_message(session, conversation_id, MessageRole.agent.value, reply)
        conversation.updated_at = utcnow()
        await session.commit()

    await send_whatsapp(to=from_number, from_=sender, body=reply)
    return reply
