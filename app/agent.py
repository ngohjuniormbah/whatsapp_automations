"""The single agent and its tool set (Pydantic AI + OpenRouter).

One agent, many tools — not a sales bot plus a booking bot. The agent
chooses which tool to call. Tools are typed and documented; their
docstrings are what the model sees, so they read like instructions.

The LLM is reached through OpenRouter (OpenAI-compatible). The model id
is an env var (`OPENROUTER_MODEL`), so swapping the brain is one line of
config. Tests inject a fake model instead, so no API key is needed to
exercise the tools and state machine.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, timedelta

from pydantic_ai import Agent, RunContext
from pydantic_ai.models import Model
from pydantic_ai.models.openai import OpenAIChatModel
from pydantic_ai.providers.openai import OpenAIProvider
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from app import models, prompts
from app.config import settings
from app.models import (
    AppointmentStatus,
    ConversationState,
    OrderStatus,
    utcnow,
)
from app.schemas import OrderLine


@dataclass
class AgentDeps:
    """Everything a tool needs for the current turn (one merchant, one chat)."""

    session: AsyncSession
    merchant: models.Merchant
    conversation: models.Conversation
    customer_number: str
    # Precomputed prompt context (kept flat — see prompts.py).
    catalog_text: str
    services_text: str
    recent_text: str


agent = Agent(deps_type=AgentDeps, retries=2)


@agent.instructions
def _instructions(ctx: RunContext[AgentDeps]) -> str:
    d = ctx.deps
    return prompts.build_instructions(
        merchant=d.merchant,
        catalog_text=d.catalog_text,
        services_text=d.services_text,
        running_summary=d.conversation.running_summary,
        recent_text=d.recent_text,
    )


def get_model() -> Model:
    """The production model: OpenRouter via the OpenAI-compatible provider."""
    provider = OpenAIProvider(
        base_url=settings.openrouter_base_url,
        api_key=settings.openrouter_api_key,
    )
    return OpenAIChatModel(settings.openrouter_model, provider=provider)


# --------------------------------------------------------------------------
# Read tools
# --------------------------------------------------------------------------
@agent.tool
async def get_catalog(ctx: RunContext[AgentDeps]) -> list[dict]:
    """List this merchant's products (name, price in FCFA, description, stock)."""
    rows = (
        await ctx.deps.session.execute(
            select(models.CatalogItem).where(
                models.CatalogItem.merchant_id == ctx.deps.merchant.id
            )
        )
    ).scalars().all()
    return [
        {
            "name": r.name,
            "price_fcfa": r.price_fcfa,
            "description": r.description,
            "in_stock": r.in_stock,
        }
        for r in rows
    ]


@agent.tool
async def get_services(ctx: RunContext[AgentDeps]) -> list[dict]:
    """List this merchant's bookable services (name, price FCFA, duration minutes)."""
    rows = (
        await ctx.deps.session.execute(
            select(models.Service).where(
                models.Service.merchant_id == ctx.deps.merchant.id
            )
        )
    ).scalars().all()
    return [
        {"name": r.name, "price_fcfa": r.price_fcfa, "duration_min": r.duration_min}
        for r in rows
    ]


@agent.tool
async def check_availability(
    ctx: RunContext[AgentDeps], date_from: date, date_to: date
) -> list[str]:
    """Return free appointment slots between two dates (inclusive).

    Computed from the merchant's weekly availability rules minus slots
    already taken by non-cancelled appointments. Returns ISO datetime
    strings, capped so the reply stays short.
    """
    session, merchant = ctx.deps.session, ctx.deps.merchant
    if date_to < date_from:
        return []
    # Cap the window so a bad range can't generate thousands of slots.
    if (date_to - date_from).days > 14:
        date_to = date_from + timedelta(days=14)

    rules = (
        await session.execute(
            select(models.AvailabilityRule).where(
                models.AvailabilityRule.merchant_id == merchant.id
            )
        )
    ).scalars().all()

    taken = {
        a.start_at.replace(tzinfo=None)
        for a in (
            await session.execute(
                select(models.Appointment).where(
                    models.Appointment.merchant_id == merchant.id,
                    models.Appointment.status != AppointmentStatus.cancelled.value,
                )
            )
        ).scalars().all()
    }

    slots: list[str] = []
    day = date_from
    while day <= date_to and len(slots) < 20:
        for rule in [r for r in rules if r.weekday == day.weekday()]:
            t = datetime.combine(day, rule.start_time)
            end = datetime.combine(day, rule.end_time)
            step = timedelta(minutes=rule.slot_minutes)
            while t + step <= end and len(slots) < 20:
                if t not in taken and t >= datetime.now().replace(microsecond=0):
                    slots.append(t.isoformat(timespec="minutes"))
                t += step
        day += timedelta(days=1)
    return slots


# --------------------------------------------------------------------------
# Write tools (drive the outcomes)
# --------------------------------------------------------------------------
@agent.tool
async def capture_order(
    ctx: RunContext[AgentDeps],
    items: list[OrderLine],
    delivery_area: str | None = None,
) -> str:
    """Record a product order and return a short confirmation summary.

    Prices are taken from the catalog (the model's price is ignored when
    the item is found), so totals are always authoritative.
    """
    session, merchant = ctx.deps.session, ctx.deps.merchant
    catalog = {
        c.name.lower(): c
        for c in (
            await session.execute(
                select(models.CatalogItem).where(
                    models.CatalogItem.merchant_id == merchant.id
                )
            )
        ).scalars().all()
    }

    resolved: list[dict] = []
    total = 0
    for line in items:
        ci = catalog.get(line.name.lower())
        price = ci.price_fcfa if ci else (line.price_fcfa or 0)
        total += price * line.quantity
        resolved.append(
            {"name": ci.name if ci else line.name, "quantity": line.quantity, "price_fcfa": price}
        )

    order = models.Order(
        merchant_id=merchant.id,
        customer_number=ctx.deps.customer_number,
        items=resolved,
        delivery_area=delivery_area,
        total_fcfa=total,
        status=OrderStatus.pending.value,
    )
    session.add(order)
    ctx.deps.conversation.state = ConversationState.ordering.value

    lines = ", ".join(f"{r['quantity']}× {r['name']}" for r in resolved)
    area = f" — livraison: {delivery_area}" if delivery_area else ""
    return f"Order recorded: {lines}{area}. Total {total} FCFA. Status: pending."


@agent.tool
async def book_appointment(
    ctx: RunContext[AgentDeps], service_name: str, start_at: datetime
) -> str:
    """Validate a slot and book an appointment, scheduling a reminder.

    Rejects a time outside the merchant's availability or one already
    taken. The appointment is created with status 'requested' — the
    merchant confirms it.
    """
    session, merchant = ctx.deps.session, ctx.deps.merchant

    service = (
        await session.execute(
            select(models.Service).where(
                models.Service.merchant_id == merchant.id,
                models.Service.name.ilike(service_name),
            )
        )
    ).scalars().first()
    if service is None:
        return f"No service called “{service_name}”. Offer the customer the listed services."

    # Normalize to naive UTC (the app's convention) so all comparisons and
    # stored values are consistent.
    start_at = start_at.replace(tzinfo=None) if start_at.tzinfo else start_at
    start_naive = start_at
    end_naive = start_naive + timedelta(minutes=service.duration_min)

    rules = (
        await session.execute(
            select(models.AvailabilityRule).where(
                models.AvailabilityRule.merchant_id == merchant.id,
                models.AvailabilityRule.weekday == start_naive.weekday(),
            )
        )
    ).scalars().all()
    fits = any(
        r.start_time <= start_naive.time() and end_naive.time() <= r.end_time
        for r in rules
    )
    if not fits:
        return "That time is outside opening hours. Offer check_availability slots instead."

    clash = (
        await session.execute(
            select(models.Appointment).where(
                models.Appointment.merchant_id == merchant.id,
                models.Appointment.start_at == start_at,
                models.Appointment.status != AppointmentStatus.cancelled.value,
            )
        )
    ).scalars().first()
    if clash:
        return "That slot is already taken. Offer another slot from check_availability."

    appt = models.Appointment(
        merchant_id=merchant.id,
        customer_number=ctx.deps.customer_number,
        service_id=service.id,
        start_at=start_at,
        status=AppointmentStatus.requested.value,
    )
    session.add(appt)
    ctx.deps.conversation.state = ConversationState.booking.value

    # Schedule a reminder ~2h before (or, if sooner, right away).
    remind_at = start_at - timedelta(hours=2)
    if remind_at <= utcnow():
        remind_at = utcnow() + timedelta(minutes=1)
    session.add(
        models.ScheduledMessage(
            merchant_id=merchant.id,
            customer_number=ctx.deps.customer_number,
            send_at=remind_at,
            template_name="appointment_reminder",
            payload={
                "service": service.name,
                "start_at": start_at.isoformat(timespec="minutes"),
            },
        )
    )
    return (
        f"Appointment requested: {service.name} at "
        f"{start_naive.isoformat(timespec='minutes')} ({service.duration_min} min). "
        "Tell the customer it's pending the merchant's confirmation."
    )


@agent.tool
async def escalate_to_human(ctx: RunContext[AgentDeps], reason: str) -> str:
    """Pause the bot and hand this conversation to the human merchant.

    Call this for discounts/price negotiation, complaints, or whenever
    you are not confident. After this the agent stops auto-replying until
    the merchant re-enables it.
    """
    ctx.deps.conversation.state = ConversationState.paused_for_human.value
    return (
        "A team member will get back to you shortly. Thank you for your patience! "
        f"(reason: {reason})"
    )
