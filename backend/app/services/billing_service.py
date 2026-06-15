"""Stripe billing integration (CLAUDE.md Section 12) — TEST MODE.

Architecture (deliberately PCI-light — we never see card data):
* Stripe Checkout (hosted) for the upgrade flow.
* Stripe Customer Portal (hosted) for managing/cancelling.
* Webhooks sync subscription state into ``users.plan`` / ``subscription_status``
  / ``current_period_end``.

This module is a thin wrapper over the official ``stripe`` SDK plus the webhook
event handlers. The SDK is synchronous, so every network call is pushed to a
worker thread via ``run_in_threadpool`` to stay async-safe and never block the
event loop. All config (keys, price id) is read from ``settings`` — never
hardcoded.
"""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone

import stripe
from fastapi.concurrency import run_in_threadpool
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.user import User

logger = logging.getLogger(__name__)

# Stripe statuses that grant full Pro access.
_PRO_STATUSES = frozenset({"active", "trialing"})


class BillingNotConfigured(RuntimeError):
    """Raised when a Stripe call is attempted without a secret key configured."""


def _configure() -> None:
    """Point the SDK at our secret key. Raises if billing isn't configured so
    callers (which already 503-guard) fail loudly rather than hit Stripe with a
    null key."""
    if not settings.STRIPE_SECRET_KEY:
        raise BillingNotConfigured("STRIPE_SECRET_KEY is not set")
    stripe.api_key = settings.STRIPE_SECRET_KEY


def _epoch_to_dt(epoch: int | None) -> datetime | None:
    if not epoch:
        return None
    return datetime.fromtimestamp(epoch, tz=timezone.utc)


def plan_for_status(
    status: str | None,
    current_period_end: datetime | None,
    now: datetime | None = None,
) -> str:
    """Project a Stripe subscription status onto our access-control plan.

    * active / trialing -> 'pro' (a trialing user has full Pro access).
    * canceled but still inside the paid period -> 'pro' (keep access until it
      lapses); past the period -> 'free'.
    * everything else (past_due, unpaid, incomplete, none) -> 'free'.
    """
    if status in _PRO_STATUSES:
        return "pro"
    now = now or datetime.now(timezone.utc)
    if (
        status == "canceled"
        and current_period_end is not None
        and current_period_end > now
    ):
        return "pro"
    return "free"


# --- Stripe SDK calls (async-safe via threadpool) ---------------------------


async def create_customer(user: User) -> str:
    """Create a Stripe customer for ``user`` and return its id. The caller
    persists the id on the user row."""
    _configure()
    customer = await run_in_threadpool(
        lambda: stripe.Customer.create(
            email=user.email,
            name=user.full_name or None,
            metadata={"app_user_id": str(user.id)},
        )
    )
    return customer.id


async def create_checkout_session(
    *,
    customer_id: str,
    user_id: uuid.UUID,
    success_url: str,
    cancel_url: str,
) -> str:
    """Create a subscription Checkout session for the Pro plan with a 30-day
    free trial (card collected upfront) and return its hosted URL."""
    _configure()
    if not settings.STRIPE_PRO_MONTHLY_PRICE_ID:
        raise BillingNotConfigured("STRIPE_PRO_MONTHLY_PRICE_ID is not set")

    session = await run_in_threadpool(
        lambda: stripe.checkout.Session.create(
            mode="subscription",
            customer=customer_id,
            client_reference_id=str(user_id),
            line_items=[
                {"price": settings.STRIPE_PRO_MONTHLY_PRICE_ID, "quantity": 1}
            ],
            subscription_data={
                "trial_period_days": settings.STRIPE_TRIAL_PERIOD_DAYS
            },
            success_url=success_url,
            cancel_url=cancel_url,
            allow_promotion_codes=True,
        )
    )
    return session.url


async def create_portal_session(*, customer_id: str, return_url: str) -> str:
    """Create a Customer Portal session and return its hosted URL."""
    _configure()
    session = await run_in_threadpool(
        lambda: stripe.billing_portal.Session.create(
            customer=customer_id,
            return_url=return_url,
        )
    )
    return session.url


def construct_event(payload: bytes, sig_header: str | None) -> stripe.Event:
    """Verify a webhook's signature and return the parsed event.

    Local crypto only (no network), so it's safe to call directly. Raises
    ``ValueError`` for an unparseable body and
    ``stripe.error.SignatureVerificationError`` for a bad/forged signature —
    the route turns both into a 400.
    """
    if not settings.STRIPE_WEBHOOK_SECRET:
        raise BillingNotConfigured("STRIPE_WEBHOOK_SECRET is not set")
    return stripe.Webhook.construct_event(
        payload, sig_header, settings.STRIPE_WEBHOOK_SECRET
    )


# --- Webhook handling -------------------------------------------------------
#
# Idempotency: every handler is a pure upsert of user state from the event
# payload, so a duplicate delivery of the same event produces identical state —
# safe by construction. We trigger no side effects (no emails/charges) here, so
# there's nothing that must run exactly once; an event-id ledger would add a
# table for no behavioural gain. The signature check already rejects forgeries.


async def _user_by_customer(db: AsyncSession, customer_id: str | None) -> User | None:
    if not customer_id:
        return None
    return await db.scalar(
        select(User).where(User.stripe_customer_id == customer_id)
    )


async def _sync_subscription(
    db: AsyncSession, sub: dict, *, deleted: bool = False
) -> None:
    """Apply a Stripe subscription object to the owning user's plan state."""
    user = await _user_by_customer(db, sub.get("customer"))
    if user is None:
        logger.warning("Webhook: no user for customer %s", sub.get("customer"))
        return

    period_end = _epoch_to_dt(sub.get("current_period_end"))
    user.stripe_subscription_id = sub.get("id")
    user.current_period_end = period_end

    if deleted:
        # The subscription is gone — access ends now, drop to free.
        user.subscription_status = "canceled"
        user.plan = "free"
    else:
        status = sub.get("status")
        user.subscription_status = status
        user.plan = plan_for_status(status, period_end)

    await db.commit()
    logger.info(
        "Webhook: user %s -> plan=%s status=%s",
        user.id,
        user.plan,
        user.subscription_status,
    )


async def _handle_checkout_completed(db: AsyncSession, session: dict) -> None:
    """Link the Stripe customer/subscription to our user the moment Checkout
    completes, and optimistically grant Pro (trialing) so the success page
    reflects the upgrade immediately. The authoritative status + period end
    arrive right after on ``customer.subscription.created/updated``."""
    user = await _user_by_customer(db, session.get("customer"))
    if user is None:
        ref = session.get("client_reference_id")
        if ref:
            try:
                user = await db.get(User, uuid.UUID(str(ref)))
            except (ValueError, TypeError):
                user = None
        if user is None:
            logger.warning("Webhook: checkout.completed with no resolvable user")
            return
        user.stripe_customer_id = session.get("customer")

    if session.get("subscription"):
        user.stripe_subscription_id = session.get("subscription")
    if user.subscription_status is None:
        user.subscription_status = "trialing"
    if user.plan == "free":
        user.plan = "pro"
    await db.commit()


async def _handle_payment_failed(db: AsyncSession, invoice: dict) -> None:
    """A renewal/trial-end charge failed — mark past_due and revert to free
    limits (the task treats past_due as no Pro access)."""
    user = await _user_by_customer(db, invoice.get("customer"))
    if user is None:
        return
    user.subscription_status = "past_due"
    user.plan = "free"
    await db.commit()
    logger.info("Webhook: user %s payment failed -> past_due/free", user.id)


async def handle_event(db: AsyncSession, event: dict) -> None:
    """Dispatch a verified Stripe event to the right handler. Unknown event
    types are ignored (Stripe sends many we don't subscribe to)."""
    # Defensive: a signature-verified event from Stripe is always well-formed,
    # but read structurally so a malformed body no-ops (200) instead of raising
    # a KeyError -> 500 that Stripe would retry forever.
    event_type = event.get("type")
    obj = (event.get("data") or {}).get("object")
    if not event_type or obj is None:
        logger.warning("Webhook: malformed event payload, ignoring")
        return

    if event_type == "checkout.session.completed":
        await _handle_checkout_completed(db, obj)
    elif event_type in {
        "customer.subscription.created",
        "customer.subscription.updated",
    }:
        await _sync_subscription(db, obj)
    elif event_type == "customer.subscription.deleted":
        await _sync_subscription(db, obj, deleted=True)
    elif event_type == "invoice.payment_failed":
        await _handle_payment_failed(db, obj)
    else:
        logger.debug("Webhook: ignoring event type %s", event_type)
