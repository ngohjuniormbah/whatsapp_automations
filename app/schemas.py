"""Typed shapes used by agent tools (Pydantic AI builds JSON schemas from these)."""

from __future__ import annotations

from pydantic import BaseModel, Field


class OrderLine(BaseModel):
    """One line in a customer's order."""

    name: str = Field(description="Product name, matching a catalog item")
    quantity: int = Field(default=1, ge=1)
    # The model may propose a price, but capture_order re-prices from the
    # catalog and ignores this if the item is found — never trust the LLM
    # on money.
    price_fcfa: int | None = Field(default=None, ge=0)
