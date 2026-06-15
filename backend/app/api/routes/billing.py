"""Billing routes (CLAUDE.md Section 12) — mounted at /api/v1/billing.

* POST /checkout  — JWT-auth'd. Creates a Stripe Checkout session for Pro
                    (30-day trial) and returns its URL for the frontend to
                    redirect to.
* POST /portal    — JWT-auth'd. Creates a Customer Portal session URL.
* POST /webhook   — NOT JWT-auth'd (Stripe calls it) but signature-verified
                    against STRIPE_WEBHOOK_SECRET on the raw body. Syncs
                    subscription state into the user's plan.

Checkout and the Portal are Stripe-hosted, so we never handle card data. When
STRIPE_SECRET_KEY isn't configured, the auth'd endpoints return a clean 503 so
local dev without keys doesn't crash.
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession
from stripe.error import SignatureVerificationError

from app.api.deps import get_current_user, get_db
from app.core.config import settings
from app.models.user import User
from app.schemas.billing import CheckoutSessionRead, PortalSessionRead
from app.services import billing_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/billing", tags=["billing"])


def require_stripe() -> None:
    """503 guard for the interactive endpoints when billing isn't configured."""
    if not settings.STRIPE_SECRET_KEY:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Billing is not configured",
        )


def _frontend(path: str) -> str:
    return f"{settings.FRONTEND_URL.rstrip('/')}{path}"


@router.post(
    "/checkout",
    response_model=CheckoutSessionRead,
    dependencies=[Depends(require_stripe)],
)
async def create_checkout(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> CheckoutSessionRead:
    """Start the Pro upgrade: reuse the user's Stripe customer (or create one),
    then open a subscription Checkout session with a 30-day free trial."""
    # Re-load within this session so writes (the new customer id) persist.
    user = await db.get(User, current_user.id)
    if user is None:  # pragma: no cover - current_user is always a live row
        raise HTTPException(status_code=404, detail="User not found")

    customer_id = user.stripe_customer_id
    if not customer_id:
        customer_id = await billing_service.create_customer(user)
        user.stripe_customer_id = customer_id
        await db.commit()

    url = await billing_service.create_checkout_session(
        customer_id=customer_id,
        user_id=user.id,
        success_url=_frontend("/billing/success?session_id={CHECKOUT_SESSION_ID}"),
        cancel_url=_frontend("/billing/cancel"),
    )
    return CheckoutSessionRead(url=url)


@router.post(
    "/portal",
    response_model=PortalSessionRead,
    dependencies=[Depends(require_stripe)],
)
async def create_portal(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> PortalSessionRead:
    """Open the Stripe Customer Portal so the user can manage/cancel billing."""
    user = await db.get(User, current_user.id)
    if user is None or not user.stripe_customer_id:
        # No customer yet -> they've never started a subscription.
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No billing account yet — start a subscription first.",
        )

    url = await billing_service.create_portal_session(
        customer_id=user.stripe_customer_id,
        return_url=_frontend("/settings"),
    )
    return PortalSessionRead(url=url)


@router.post("/webhook", include_in_schema=False)
async def stripe_webhook(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> dict[str, bool]:
    """Receive Stripe webhooks. Verifies the signature on the RAW body, then
    syncs subscription state. No JWT (Stripe is the caller); the signature is
    the auth. Returns 200 on success so Stripe stops retrying; 400 on a
    bad/forged signature so it knows the delivery failed."""
    if not settings.STRIPE_WEBHOOK_SECRET:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Billing webhook is not configured",
        )

    payload = await request.body()
    sig_header = request.headers.get("stripe-signature")
    try:
        event = billing_service.construct_event(payload, sig_header)
    except (ValueError, SignatureVerificationError) as exc:
        logger.warning("Rejected Stripe webhook: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid webhook signature",
        ) from exc

    try:
        await billing_service.handle_event(db, event)
    except Exception as exc:  # noqa: BLE001
        # Return 500 so Stripe retries — our handlers are idempotent upserts, so
        # a retry after a transient failure is safe (no double side effects).
        logger.exception("Error handling Stripe event %s", event.get("id"))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Webhook handler error",
        ) from exc

    return {"received": True}
