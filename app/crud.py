"""Small async DB helpers shared across routers/phases.

Kept deliberately thin — one query per function, no business logic — so
the webhook and (later) the agent read the same way against the DB.
"""

from __future__ import annotations

import uuid

from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from app import models


async def get_merchant_by_whatsapp(
    session: AsyncSession, to_number: str
) -> models.Merchant | None:
    """Resolve the tenant from the Twilio `To` number (one `To` = one merchant)."""
    return await session.scalar(
        select(models.Merchant).where(models.Merchant.whatsapp_number == to_number)
    )


async def get_or_create_conversation(
    session: AsyncSession, merchant_id: uuid.UUID, customer_number: str
) -> models.Conversation:
    """Fetch the (merchant, customer) conversation, creating it on first contact."""
    conv = await session.scalar(
        select(models.Conversation).where(
            models.Conversation.merchant_id == merchant_id,
            models.Conversation.customer_number == customer_number,
        )
    )
    if conv is None:
        conv = models.Conversation(
            merchant_id=merchant_id, customer_number=customer_number
        )
        session.add(conv)
        await session.flush()  # assign conv.id
    return conv


async def add_message(
    session: AsyncSession,
    conversation_id: uuid.UUID,
    role: str,
    body: str,
) -> models.Message:
    """Append a message to a conversation. Caller commits."""
    msg = models.Message(conversation_id=conversation_id, role=role, body=body)
    session.add(msg)
    return msg
