"""Unit tests for the OIDC trust boundary in app/services/google_oauth.py
(CLAUDE.md Section 13). These exercise the REAL id_token validation — the part
the route tests mock away — with a locally generated RSA keypair, so a forged /
relayed / cross-client / expired / unsigned token is provably rejected. No
network: ``_get_jwks`` is stubbed to return the local JWKS, and ``_exchange_code``
is stubbed for the fetch_identity tests.
"""

from __future__ import annotations

import time

import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from jose import jwk, jwt

from app.core.config import settings
from app.services import google_oauth
from app.services.google_oauth import GoogleOAuthError

CLIENT_ID = "test-client-id.apps.googleusercontent.com"
NONCE = "expected-nonce-value"
KID = "test-kid-1"


# --- key + token helpers ----------------------------------------------------


def _keypair() -> tuple[str, str]:
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    priv = key.private_bytes(
        serialization.Encoding.PEM,
        serialization.PrivateFormat.PKCS8,
        serialization.NoEncryption(),
    ).decode()
    pub = (
        key.public_key()
        .public_bytes(
            serialization.Encoding.PEM,
            serialization.PublicFormat.SubjectPublicKeyInfo,
        )
        .decode()
    )
    return priv, pub


def _jwks(pub_pem: str) -> dict:
    d = jwk.construct(pub_pem, "RS256").to_dict()
    d.update({"kid": KID, "use": "sig", "alg": "RS256"})
    return {
        "keys": [{k: (v.decode() if isinstance(v, bytes) else v) for k, v in d.items()}]
    }


def _claims(**overrides) -> dict:
    now = int(time.time())
    claims = {
        "iss": "https://accounts.google.com",
        "aud": CLIENT_ID,
        "sub": "google-sub-123",
        "email": "designer@example.com",
        "email_verified": True,
        "name": "A Designer",
        "nonce": NONCE,
        "iat": now,
        "exp": now + 600,
    }
    claims.update(overrides)
    return claims


def _sign(priv_pem: str, claims: dict, *, alg: str = "RS256", kid: str = KID) -> str:
    return jwt.encode(claims, priv_pem, algorithm=alg, headers={"kid": kid})


@pytest.fixture
def keys():
    priv, pub = _keypair()
    return priv, pub


@pytest.fixture(autouse=True)
def _configure(monkeypatch, keys):
    """Point the verifier at our client id and our local JWKS (no network)."""
    _priv, pub = keys
    monkeypatch.setattr(settings, "GOOGLE_CLIENT_ID", CLIENT_ID)
    monkeypatch.setattr(settings, "GOOGLE_CLIENT_SECRET", "test-secret")
    jwks = _jwks(pub)

    async def fake_jwks():
        return jwks

    monkeypatch.setattr(google_oauth, "_get_jwks", fake_jwks)


# --- _verify_id_token: the happy path ---------------------------------------


async def test_valid_token_verifies(keys):
    priv, _ = keys
    claims = await google_oauth._verify_id_token(_sign(priv, _claims()), NONCE)
    assert claims["sub"] == "google-sub-123"
    assert claims["email"] == "designer@example.com"


# --- rejection cases (each is a distinct forgery/relay vector) ---------------


async def test_wrong_audience_rejected(keys):
    priv, _ = keys
    token = _sign(priv, _claims(aud="some-other-client.apps.googleusercontent.com"))
    with pytest.raises(GoogleOAuthError):
        await google_oauth._verify_id_token(token, NONCE)


async def test_missing_audience_rejected(keys):
    """require_aud=True — a token with NO aud must not slip through."""
    priv, _ = keys
    claims = _claims()
    del claims["aud"]
    with pytest.raises(GoogleOAuthError):
        await google_oauth._verify_id_token(_sign(priv, claims), NONCE)


async def test_wrong_issuer_rejected(keys):
    priv, _ = keys
    token = _sign(priv, _claims(iss="https://evil.example.com"))
    with pytest.raises(GoogleOAuthError):
        await google_oauth._verify_id_token(token, NONCE)


async def test_expired_token_rejected(keys):
    priv, _ = keys
    now = int(time.time())
    token = _sign(priv, _claims(iat=now - 1200, exp=now - 600))
    with pytest.raises(GoogleOAuthError):
        await google_oauth._verify_id_token(token, NONCE)


async def test_missing_exp_rejected(keys):
    priv, _ = keys
    claims = _claims()
    del claims["exp"]
    with pytest.raises(GoogleOAuthError):
        await google_oauth._verify_id_token(_sign(priv, claims), NONCE)


async def test_nonce_mismatch_rejected(keys):
    priv, _ = keys
    token = _sign(priv, _claims(nonce="attacker-nonce"))
    with pytest.raises(GoogleOAuthError):
        await google_oauth._verify_id_token(token, NONCE)


async def test_missing_sub_rejected(keys):
    priv, _ = keys
    claims = _claims()
    del claims["sub"]
    with pytest.raises(GoogleOAuthError):
        await google_oauth._verify_id_token(_sign(priv, claims), NONCE)


async def test_bad_signature_rejected(keys):
    """Token signed by a DIFFERENT key (not in our JWKS) must be rejected."""
    other_priv, _ = _keypair()
    token = _sign(other_priv, _claims())
    with pytest.raises(GoogleOAuthError):
        await google_oauth._verify_id_token(token, NONCE)


async def test_hs256_algorithm_confusion_rejected(keys):
    """An HS256 token (alg-confusion attempt) must be rejected — only RS256."""
    token = jwt.encode(_claims(), "the-public-key-as-hmac-secret", algorithm="HS256")
    with pytest.raises(GoogleOAuthError):
        await google_oauth._verify_id_token(token, NONCE)


# --- strict email_verified parsing ------------------------------------------


def test_email_verified_is_strict():
    assert google_oauth._email_verified(True) is True
    assert google_oauth._email_verified("true") is True
    assert google_oauth._email_verified("TRUE") is True
    # Everything else is unverified — crucially the string "false" is NOT truthy.
    for falsy in (False, "false", "False", None, "", 0, 1, "1", "yes"):
        assert google_oauth._email_verified(falsy) is False, falsy


# --- fetch_identity end-to-end (real verify, stubbed exchange) --------------


async def test_fetch_identity_returns_verified_identity(keys, monkeypatch):
    priv, _ = keys
    token = _sign(priv, _claims())

    async def fake_exchange(code: str):
        return {"id_token": token}

    monkeypatch.setattr(google_oauth, "_exchange_code", fake_exchange)
    identity = await google_oauth.fetch_identity("any-code", NONCE)
    assert identity.sub == "google-sub-123"
    assert identity.email == "designer@example.com"
    assert identity.email_verified is True
    assert identity.full_name == "A Designer"


async def test_fetch_identity_rejects_empty_email(keys, monkeypatch):
    """A verified token with no email must be refused (no blank-email account)."""
    priv, _ = keys
    token = _sign(priv, _claims(email="", email_verified=True))

    async def fake_exchange(code: str):
        return {"id_token": token}

    monkeypatch.setattr(google_oauth, "_exchange_code", fake_exchange)
    with pytest.raises(GoogleOAuthError):
        await google_oauth.fetch_identity("any-code", NONCE)


async def test_fetch_identity_preserves_unverified_flag(keys, monkeypatch):
    """fetch_identity returns email_verified=False (the route rejects it) — it
    must not itself treat an unverified email as verified."""
    priv, _ = keys
    token = _sign(priv, _claims(email_verified=False))

    async def fake_exchange(code: str):
        return {"id_token": token}

    monkeypatch.setattr(google_oauth, "_exchange_code", fake_exchange)
    identity = await google_oauth.fetch_identity("any-code", NONCE)
    assert identity.email_verified is False
