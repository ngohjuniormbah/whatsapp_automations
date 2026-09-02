"""System-prompt assembly.

The agent's instructions are built PER MESSAGE from small pieces so token
cost stays flat regardless of conversation length:

    base role
  + this merchant's system_prompt_extra
  + a compact catalog/service summary
  + the conversation's running_summary (long-term memory)
  + a short rolling window of recent turns (short-term memory)

We deliberately do NOT resend the full transcript.
"""

from __future__ import annotations

from app import models

# Base role. Conservative by design: the model is told to escalate rather
# than improvise on money/complaints. Kept provider-neutral and short.
BASE_ROLE = """\
You are the assistant for a small business in Cameroon, chatting with a \
customer on WhatsApp. You ARE the shop's voice — warm, brief, and helpful.

Language: reply in the SAME language the customer uses — French, English, \
or Cameroonian Pidgin. Match their register; keep messages short, like real \
WhatsApp chat.

Your goal is to CLOSE: answer questions from the catalog/services, handle \
simple objections, and drive to ONE outcome — capture a product ORDER or \
BOOK an appointment. Use your tools to read the catalog, check availability, \
record an order, or book. Quote prices ONLY from the catalog/services, always \
in FCFA. Never invent products, prices, stock, or availability.

Be conservative. If the customer asks for a discount or price negotiation, \
makes a complaint, or you are not confident you can help correctly, call \
escalate_to_human and stop — do not guess. A human will take over.

When you have enough detail, use capture_order or book_appointment rather \
than only describing what you would do."""


def summarize_catalog(items: list[models.CatalogItem]) -> str:
    if not items:
        return "(no products listed)"
    lines = []
    for it in items:
        stock = "" if it.in_stock else " [OUT OF STOCK]"
        desc = f" — {it.description}" if it.description else ""
        lines.append(f"- {it.name}: {it.price_fcfa} FCFA{desc}{stock}")
    return "\n".join(lines)


def summarize_services(services: list[models.Service]) -> str:
    if not services:
        return "(no services listed)"
    return "\n".join(
        f"- {s.name}: {s.price_fcfa} FCFA ({s.duration_min} min)" for s in services
    )


def format_recent(messages: list[models.Message]) -> str:
    if not messages:
        return "(no earlier messages)"
    who = {"customer": "Customer", "agent": "You", "system": "System"}
    return "\n".join(f"{who.get(m.role, m.role)}: {m.body}" for m in messages)


def build_instructions(
    *,
    merchant: models.Merchant,
    catalog_text: str,
    services_text: str,
    running_summary: str,
    recent_text: str,
) -> str:
    parts = [BASE_ROLE, f"Business: {merchant.name}."]
    if merchant.system_prompt_extra:
        parts.append(f"About this business:\n{merchant.system_prompt_extra}")
    parts.append(f"Catalog (products):\n{catalog_text}")
    parts.append(f"Services (bookable):\n{services_text}")
    if running_summary.strip():
        parts.append(f"Conversation summary so far:\n{running_summary.strip()}")
    parts.append(f"Recent messages:\n{recent_text}")
    return "\n\n".join(parts)
