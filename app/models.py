"""SQLModel data model for the multi-tenant WhatsApp agent.

Design notes
------------
- **Tenancy key is `merchant.whatsapp_number`** (the Twilio `To`). Every
  inbound message resolves to exactly one merchant through it, so it is
  unique + indexed. Every child row carries `merchant_id`.
- **Enums are stored as plain strings**, with the allowed values defined
  as `str` Enums used in code. This deliberately avoids native Postgres
  ENUM types, whose `ALTER TYPE ... ADD VALUE` migrations are a known
  operational headache; a `VARCHAR` + app-level validation is cheaper to
  evolve. Tradeoff: the DB won't reject a bad value on its own — the app
  is the guard.
- **UUID primary keys** so ids are non-guessable and safe to expose in
  logs/webhooks, and so merchants can be seeded/merged without sequence
  collisions.
"""

from __future__ import annotations

import uuid
from datetime import datetime, time, timezone
from enum import Enum

from sqlalchemy import Column, UniqueConstraint
from sqlalchemy import JSON as SA_JSON
from sqlmodel import Field, SQLModel


def utcnow() -> datetime:
    """Naive UTC 'now'.

    The app uses naive UTC everywhere so datetime comparisons never mix
    aware/naive (a common footgun). Full timezone handling — including the
    merchant's local WAT wall-clock for availability — is deferred; for a
    single-country (Cameroon, UTC+1, no DST) MVP this is acceptable and
    should be revisited before multi-region use.
    """
    return datetime.now(timezone.utc).replace(tzinfo=None)


# --------------------------------------------------------------------------
# Enumerations (stored as strings; see module docstring)
# --------------------------------------------------------------------------
class ConversationState(str, Enum):
    browsing = "browsing"
    ordering = "ordering"
    booking = "booking"
    paused_for_human = "paused_for_human"


class MessageRole(str, Enum):
    customer = "customer"
    agent = "agent"
    system = "system"


class OrderStatus(str, Enum):
    pending = "pending"
    confirmed = "confirmed"


class AppointmentStatus(str, Enum):
    requested = "requested"
    confirmed = "confirmed"
    cancelled = "cancelled"


# --------------------------------------------------------------------------
# Tenancy root
# --------------------------------------------------------------------------
class Merchant(SQLModel, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    name: str
    # The Twilio `To` number for this tenant, e.g. "whatsapp:+14155238886".
    whatsapp_number: str = Field(index=True, unique=True)
    default_language: str = "fr"
    # Free-text business context appended to the agent's system prompt.
    system_prompt_extra: str | None = None
    # Master kill switch: when False the agent never auto-replies.
    bot_enabled: bool = True
    created_at: datetime = Field(default_factory=utcnow)


# --------------------------------------------------------------------------
# Merchant-owned catalogue / services / availability
# --------------------------------------------------------------------------
class CatalogItem(SQLModel, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    merchant_id: uuid.UUID = Field(foreign_key="merchant.id", index=True)
    name: str
    price_fcfa: int
    description: str | None = None
    in_stock: bool = True


class Service(SQLModel, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    merchant_id: uuid.UUID = Field(foreign_key="merchant.id", index=True)
    name: str
    price_fcfa: int
    duration_min: int


class AvailabilityRule(SQLModel, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    merchant_id: uuid.UUID = Field(foreign_key="merchant.id", index=True)
    # 0 = Monday ... 6 = Sunday (Python's date.weekday()).
    weekday: int
    start_time: time
    end_time: time
    slot_minutes: int


# --------------------------------------------------------------------------
# Conversations + messages
# --------------------------------------------------------------------------
class Conversation(SQLModel, table=True):
    __table_args__ = (
        UniqueConstraint("merchant_id", "customer_number", name="uq_conv_tenant_customer"),
    )

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    merchant_id: uuid.UUID = Field(foreign_key="merchant.id", index=True)
    customer_number: str = Field(index=True)
    state: str = Field(default=ConversationState.browsing.value)
    # Compressed memory so we never resend the full transcript to the LLM.
    running_summary: str = Field(default="")
    updated_at: datetime = Field(default_factory=utcnow)


class Message(SQLModel, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    conversation_id: uuid.UUID = Field(foreign_key="conversation.id", index=True)
    role: str = Field(default=MessageRole.customer.value)
    body: str
    created_at: datetime = Field(default_factory=utcnow)


# --------------------------------------------------------------------------
# Outcomes the agent drives toward
# --------------------------------------------------------------------------
class Order(SQLModel, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    merchant_id: uuid.UUID = Field(foreign_key="merchant.id", index=True)
    customer_number: str = Field(index=True)
    # [{"name": ..., "quantity": ..., "price_fcfa": ...}, ...]
    items: list[dict] = Field(default_factory=list, sa_column=Column(SA_JSON))
    delivery_area: str | None = None
    total_fcfa: int = 0
    status: str = Field(default=OrderStatus.pending.value)
    created_at: datetime = Field(default_factory=utcnow)


class Appointment(SQLModel, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    merchant_id: uuid.UUID = Field(foreign_key="merchant.id", index=True)
    customer_number: str = Field(index=True)
    service_id: uuid.UUID = Field(foreign_key="service.id", index=True)
    start_at: datetime
    status: str = Field(default=AppointmentStatus.requested.value)
    created_at: datetime = Field(default_factory=utcnow)


class ScheduledMessage(SQLModel, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    merchant_id: uuid.UUID = Field(foreign_key="merchant.id", index=True)
    customer_number: str = Field(index=True)
    send_at: datetime = Field(index=True)
    template_name: str
    payload: dict = Field(default_factory=dict, sa_column=Column(SA_JSON))
    sent: bool = Field(default=False, index=True)
    created_at: datetime = Field(default_factory=utcnow)
