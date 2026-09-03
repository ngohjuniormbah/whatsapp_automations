"""Idempotent dev seed: one fake merchant with a small catalog + services.

Runs on startup so the app is testable immediately. No-ops once any
merchant exists, so restarts don't duplicate data.
"""

from __future__ import annotations

from datetime import time

from sqlalchemy import func
from sqlmodel import select

from app import models
from app.db import async_session_maker

# The Twilio WhatsApp Sandbox shares one number across all testers. In the
# sandbox every merchant would therefore share this `To`; in production
# each merchant has its own number. We seed with the sandbox number so
# Phase 2 can route real test messages to this merchant.
SANDBOX_WHATSAPP_FROM = "whatsapp:+14155238886"


async def seed_if_empty() -> None:
    async with async_session_maker() as session:
        count = await session.scalar(select(func.count()).select_from(models.Merchant))
        if count:
            return

        merchant = models.Merchant(
            name="Chez Amélie",
            whatsapp_number=SANDBOX_WHATSAPP_FROM,
            default_language="fr",
            system_prompt_extra=(
                "Boutique de mode féminine et petit salon à Yaoundé. "
                "Livraison en ville. Paiement MTN MoMo / Orange Money."
            ),
        )
        session.add(merchant)
        await session.flush()  # populate merchant.id

        session.add_all(
            [
                models.CatalogItem(
                    merchant_id=merchant.id,
                    name="Robe rouge",
                    price_fcfa=18000,
                    description="Coton, tailles S–L",
                ),
                models.CatalogItem(
                    merchant_id=merchant.id,
                    name="Sac à main",
                    price_fcfa=12000,
                    description="Cuir synthétique",
                ),
                models.CatalogItem(
                    merchant_id=merchant.id,
                    name="Escarpins",
                    price_fcfa=22000,
                    description="Talon 7 cm",
                    in_stock=False,
                ),
                models.Service(
                    merchant_id=merchant.id,
                    name="Coupe + brushing",
                    price_fcfa=5000,
                    duration_min=45,
                ),
                models.Service(
                    merchant_id=merchant.id,
                    name="Manucure",
                    price_fcfa=3000,
                    duration_min=30,
                ),
            ]
        )

        # Monday–Saturday, 09:00–18:00, 30-minute slots.
        for weekday in range(0, 6):
            session.add(
                models.AvailabilityRule(
                    merchant_id=merchant.id,
                    weekday=weekday,
                    start_time=time(9, 0),
                    end_time=time(18, 0),
                    slot_minutes=30,
                )
            )

        await session.commit()
