"""Billing Pydantic schemas (CLAUDE.md Section 12).

Checkout and Customer Portal are Stripe-hosted, so the only thing our API hands
the frontend is a URL to redirect to. We never touch card data (keeps us out of
PCI scope).
"""

from __future__ import annotations

from pydantic import BaseModel


class CheckoutSessionRead(BaseModel):
    """The Stripe Checkout URL the frontend redirects to."""

    url: str


class PortalSessionRead(BaseModel):
    """The Stripe Customer Portal URL the frontend redirects to."""

    url: str
