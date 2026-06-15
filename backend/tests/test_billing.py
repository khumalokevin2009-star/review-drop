"""Stripe billing tests (CLAUDE.md Section 12) — fully mocked, no real network.

Covers: the 503 guard when unconfigured; Checkout/Portal session creation
(Stripe SDK mocked); webhook signature rejection; webhook → plan sync for
created/updated/deleted/payment_failed; trial/cancel/past_due plan projection;
idempotent re-delivery; and the end-to-end tie that a Stripe-driven plan change
re-applies the free project limit.

Webhook tests sign payloads with the real Stripe scheme and run the real
``stripe.Webhook.construct_event`` verification — only the *network* SDK calls
(customer/checkout/portal creation) are mocked.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import time
import uuid
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock

import pytest

from app.core.config import settings
from app.models.user import User
from app.services import billing_service
from tests.conftest import make_user

pytestmark = pytest.mark.asyncio

CHECKOUT = "/api/v1/billing/checkout"
PORTAL = "/api/v1/billing/portal"
WEBHOOK = "/api/v1/billing/webhook"
SECRET = "whsec_test_secret"


# --- helpers ----------------------------------------------------------------


def _sign(payload: bytes, secret: str = SECRET, *, ts: int | None = None) -> str:
    """Build a Stripe-Signature header exactly as Stripe does."""
    ts = ts or int(time.time())
    signed = f"{ts}.".encode() + payload
    digest = hmac.new(secret.encode(), signed, hashlib.sha256).hexdigest()
    return f"t={ts},v1={digest}"


def _event(event_type: str, obj: dict, *, eid: str = "evt_test") -> bytes:
    return json.dumps(
        {"id": eid, "type": event_type, "data": {"object": obj}}
    ).encode()


def _sub(
    customer: str,
    status: str,
    *,
    period_end: int | None = None,
    sub_id: str = "sub_test",
) -> dict:
    return {
        "id": sub_id,
        "customer": customer,
        "status": status,
        "current_period_end": period_end,
    }


async def _reload(session_factory, user_id: uuid.UUID) -> User:
    async with session_factory() as s:
        user = await s.get(User, user_id)
        assert user is not None
        return user


async def _user_with_customer(
    session_factory, customer_id: str, *, plan: str = "free"
) -> User:
    user = await make_user(session_factory, plan=plan)
    async with session_factory() as s:
        row = await s.get(User, user.id)
        row.stripe_customer_id = customer_id
        await s.commit()
    return user


async def _post_webhook(client, payload: bytes, *, secret: str = SECRET, sig=None):
    return await client.post(
        WEBHOOK,
        content=payload,
        headers={
            "stripe-signature": sig if sig is not None else _sign(payload, secret),
            "content-type": "application/json",
        },
    )


# --- plan projection (pure function, no DB) ---------------------------------


async def test_plan_for_status_mapping():
    future = datetime.now(timezone.utc) + timedelta(days=5)
    past = datetime.now(timezone.utc) - timedelta(days=5)
    pf = billing_service.plan_for_status
    assert pf("active", None) == "pro"
    assert pf("trialing", None) == "pro"  # trial grants Pro
    assert pf("past_due", future) == "free"  # past_due loses Pro
    assert pf("canceled", future) == "pro"  # keep Pro until period end
    assert pf("canceled", past) == "free"  # then drop to free
    assert pf("canceled", None) == "free"
    assert pf(None, None) == "free"


# --- 503 guard --------------------------------------------------------------


async def test_checkout_503_when_unconfigured(client, auth, session_factory, monkeypatch):
    monkeypatch.setattr(settings, "STRIPE_SECRET_KEY", None)
    auth.user = await make_user(session_factory)
    r = await client.post(CHECKOUT)
    assert r.status_code == 503, r.text


async def test_checkout_requires_auth(client, auth, monkeypatch):
    monkeypatch.setattr(settings, "STRIPE_SECRET_KEY", "sk_test_x")
    auth.user = None
    assert (await client.post(CHECKOUT)).status_code == 401


# --- Checkout & Portal (SDK mocked) -----------------------------------------


async def test_checkout_creates_customer_and_returns_url(
    client, auth, session_factory, monkeypatch
):
    monkeypatch.setattr(settings, "STRIPE_SECRET_KEY", "sk_test_x")
    user = await make_user(session_factory)
    auth.user = user

    create_customer = AsyncMock(return_value="cus_new")
    create_checkout = AsyncMock(return_value="https://checkout.stripe.test/abc")
    monkeypatch.setattr(billing_service, "create_customer", create_customer)
    monkeypatch.setattr(billing_service, "create_checkout_session", create_checkout)

    r = await client.post(CHECKOUT)
    assert r.status_code == 200, r.text
    assert r.json()["url"] == "https://checkout.stripe.test/abc"

    create_customer.assert_awaited_once()
    kwargs = create_checkout.await_args.kwargs
    assert kwargs["customer_id"] == "cus_new"
    assert "session_id={CHECKOUT_SESSION_ID}" in kwargs["success_url"]
    assert kwargs["cancel_url"].endswith("/billing/cancel")

    # The new customer id is persisted on the user.
    assert (await _reload(session_factory, user.id)).stripe_customer_id == "cus_new"


async def test_checkout_reuses_existing_customer(
    client, auth, session_factory, monkeypatch
):
    monkeypatch.setattr(settings, "STRIPE_SECRET_KEY", "sk_test_x")
    user = await _user_with_customer(session_factory, "cus_existing")
    auth.user = user

    create_customer = AsyncMock(return_value="cus_should_not_be_used")
    create_checkout = AsyncMock(return_value="https://checkout.stripe.test/xyz")
    monkeypatch.setattr(billing_service, "create_customer", create_customer)
    monkeypatch.setattr(billing_service, "create_checkout_session", create_checkout)

    r = await client.post(CHECKOUT)
    assert r.status_code == 200, r.text
    create_customer.assert_not_awaited()
    assert create_checkout.await_args.kwargs["customer_id"] == "cus_existing"


async def test_portal_returns_url(client, auth, session_factory, monkeypatch):
    monkeypatch.setattr(settings, "STRIPE_SECRET_KEY", "sk_test_x")
    user = await _user_with_customer(session_factory, "cus_P", plan="pro")
    auth.user = user

    create_portal = AsyncMock(return_value="https://portal.stripe.test/p")
    monkeypatch.setattr(billing_service, "create_portal_session", create_portal)

    r = await client.post(PORTAL)
    assert r.status_code == 200, r.text
    assert r.json()["url"] == "https://portal.stripe.test/p"
    assert create_portal.await_args.kwargs["customer_id"] == "cus_P"


async def test_portal_400_without_customer(client, auth, session_factory, monkeypatch):
    monkeypatch.setattr(settings, "STRIPE_SECRET_KEY", "sk_test_x")
    auth.user = await make_user(session_factory)  # no stripe_customer_id
    assert (await client.post(PORTAL)).status_code == 400


# --- Webhook: signature -----------------------------------------------------


async def test_webhook_rejects_bad_signature(client, session_factory, monkeypatch):
    monkeypatch.setattr(settings, "STRIPE_WEBHOOK_SECRET", SECRET)
    user = await _user_with_customer(session_factory, "cus_bad")
    payload = _event(
        "customer.subscription.created",
        _sub("cus_bad", "trialing", period_end=int(time.time()) + 99999),
    )
    r = await _post_webhook(client, payload, sig="t=1,v1=deadbeef")
    assert r.status_code == 400
    # Plan must be untouched by a forged event.
    assert (await _reload(session_factory, user.id)).plan == "free"


async def test_webhook_503_when_secret_unset(client, session_factory, monkeypatch):
    monkeypatch.setattr(settings, "STRIPE_WEBHOOK_SECRET", None)
    payload = _event("customer.subscription.created", _sub("cus_x", "trialing"))
    r = await client.post(
        WEBHOOK, content=payload, headers={"stripe-signature": "t=1,v1=x"}
    )
    assert r.status_code == 503


async def test_webhook_rejects_missing_signature_header(
    client, session_factory, monkeypatch
):
    monkeypatch.setattr(settings, "STRIPE_WEBHOOK_SECRET", SECRET)
    user = await _user_with_customer(session_factory, "cus_nosig")
    payload = _event("customer.subscription.created", _sub("cus_nosig", "trialing"))
    # No stripe-signature header at all → 400, plan untouched.
    r = await client.post(
        WEBHOOK, content=payload, headers={"content-type": "application/json"}
    )
    assert r.status_code == 400
    assert (await _reload(session_factory, user.id)).plan == "free"


async def test_webhook_malformed_event_is_noop_200(
    client, session_factory, monkeypatch
):
    # A correctly-signed but structurally-empty event must not 500 (which would
    # make Stripe retry forever) — it's acked and ignored.
    monkeypatch.setattr(settings, "STRIPE_WEBHOOK_SECRET", SECRET)
    payload = json.dumps({"id": "evt_empty"}).encode()  # no type / no data
    assert (await _post_webhook(client, payload)).status_code == 200


# --- Webhook: subscription lifecycle ----------------------------------------


async def test_webhook_subscription_created_grants_pro(
    client, session_factory, monkeypatch
):
    monkeypatch.setattr(settings, "STRIPE_WEBHOOK_SECRET", SECRET)
    user = await _user_with_customer(session_factory, "cus_A")
    period = int(time.time()) + 30 * 86400
    payload = _event(
        "customer.subscription.created",
        _sub("cus_A", "trialing", period_end=period, sub_id="sub_A"),
    )
    assert (await _post_webhook(client, payload)).status_code == 200

    row = await _reload(session_factory, user.id)
    assert row.plan == "pro"
    assert row.subscription_status == "trialing"
    assert row.stripe_subscription_id == "sub_A"
    assert row.current_period_end is not None


async def test_webhook_subscription_updated_past_due_reverts_free(
    client, session_factory, monkeypatch
):
    monkeypatch.setattr(settings, "STRIPE_WEBHOOK_SECRET", SECRET)
    user = await _user_with_customer(session_factory, "cus_B", plan="pro")
    payload = _event(
        "customer.subscription.updated",
        _sub("cus_B", "past_due", period_end=int(time.time()) + 86400),
    )
    assert (await _post_webhook(client, payload)).status_code == 200

    row = await _reload(session_factory, user.id)
    assert row.plan == "free"
    assert row.subscription_status == "past_due"


async def test_webhook_cancel_keeps_pro_until_period_end(
    client, session_factory, monkeypatch
):
    monkeypatch.setattr(settings, "STRIPE_WEBHOOK_SECRET", SECRET)
    user = await _user_with_customer(session_factory, "cus_C", plan="pro")
    # Cancelled but the paid period hasn't lapsed yet → keep Pro.
    payload = _event(
        "customer.subscription.updated",
        _sub("cus_C", "canceled", period_end=int(time.time()) + 5 * 86400),
    )
    assert (await _post_webhook(client, payload)).status_code == 200
    assert (await _reload(session_factory, user.id)).plan == "pro"


async def test_webhook_subscription_deleted_reverts_free(
    client, session_factory, monkeypatch
):
    monkeypatch.setattr(settings, "STRIPE_WEBHOOK_SECRET", SECRET)
    user = await _user_with_customer(session_factory, "cus_D", plan="pro")
    payload = _event(
        "customer.subscription.deleted",
        _sub("cus_D", "canceled", period_end=int(time.time()) - 86400),
    )
    assert (await _post_webhook(client, payload)).status_code == 200

    row = await _reload(session_factory, user.id)
    assert row.plan == "free"
    assert row.subscription_status == "canceled"


async def test_webhook_invoice_payment_failed_marks_past_due(
    client, session_factory, monkeypatch
):
    monkeypatch.setattr(settings, "STRIPE_WEBHOOK_SECRET", SECRET)
    user = await _user_with_customer(session_factory, "cus_E", plan="pro")
    payload = _event(
        "invoice.payment_failed",
        {"id": "in_1", "customer": "cus_E", "subscription": "sub_E"},
    )
    assert (await _post_webhook(client, payload)).status_code == 200

    row = await _reload(session_factory, user.id)
    assert row.plan == "free"
    assert row.subscription_status == "past_due"


async def test_webhook_checkout_completed_links_and_grants_pro(
    client, session_factory, monkeypatch
):
    # checkout.session.completed links the customer/subscription and optimistically
    # grants Pro (the authoritative status lands on subscription.created after).
    monkeypatch.setattr(settings, "STRIPE_WEBHOOK_SECRET", SECRET)
    user = await make_user(session_factory)  # no customer id yet
    session_obj = {
        "id": "cs_test",
        "customer": "cus_CO",
        "subscription": "sub_CO",
        "client_reference_id": str(user.id),
    }
    payload = _event("checkout.session.completed", session_obj)
    assert (await _post_webhook(client, payload)).status_code == 200

    row = await _reload(session_factory, user.id)
    assert row.stripe_customer_id == "cus_CO"  # linked via client_reference_id
    assert row.stripe_subscription_id == "sub_CO"
    assert row.plan == "pro"
    assert row.subscription_status == "trialing"


async def test_webhook_idempotent_on_duplicate_delivery(
    client, session_factory, monkeypatch
):
    monkeypatch.setattr(settings, "STRIPE_WEBHOOK_SECRET", SECRET)
    user = await _user_with_customer(session_factory, "cus_F")
    period = int(time.time()) + 30 * 86400
    payload = _event(
        "customer.subscription.created",
        _sub("cus_F", "active", period_end=period, sub_id="sub_F"),
        eid="evt_dupe",
    )
    # Deliver the same event twice — state must be identical, both 200.
    assert (await _post_webhook(client, payload)).status_code == 200
    assert (await _post_webhook(client, payload)).status_code == 200

    row = await _reload(session_factory, user.id)
    assert row.plan == "pro"
    assert row.subscription_status == "active"
    assert row.stripe_subscription_id == "sub_F"


# --- Enforcement is driven by the Stripe plan -------------------------------


async def test_trialing_user_can_exceed_free_project_limit(
    client, auth, session_factory
):
    # plan='pro' is the projection of a 'trialing' subscription.
    auth.user = await make_user(session_factory, plan="pro")
    for i in range(3):  # free limit is 2 — pro is unlimited
        r = await client.post(
            "/api/v1/projects",
            json={"name": f"P{i}", "url": "https://staging.example.com"},
        )
        assert r.status_code == 201, r.text


async def test_webhook_downgrade_reapplies_free_limits(
    client, auth, session_factory, monkeypatch
):
    monkeypatch.setattr(settings, "STRIPE_WEBHOOK_SECRET", SECRET)
    user = await _user_with_customer(session_factory, "cus_G", plan="pro")

    # As Pro, create 3 active projects (beyond the free limit of 2).
    auth.user = await _reload(session_factory, user.id)
    for i in range(3):
        r = await client.post(
            "/api/v1/projects",
            json={"name": f"G{i}", "url": "https://staging.example.com"},
        )
        assert r.status_code == 201, r.text

    # A payment failure downgrades the plan to free via the webhook.
    payload = _event(
        "customer.subscription.updated",
        _sub("cus_G", "past_due", period_end=int(time.time()) + 86400),
    )
    assert (await _post_webhook(client, payload)).status_code == 200

    # Re-read the now-free user; creating another active project is blocked.
    auth.user = await _reload(session_factory, user.id)
    assert auth.user.plan == "free"
    r = await client.post(
        "/api/v1/projects",
        json={"name": "G4", "url": "https://staging.example.com"},
    )
    assert r.status_code == 403, r.text
