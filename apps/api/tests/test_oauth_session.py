"""oauth_session.py -- criterios de aceite do fluxo de login (mesmos do
polaris-atlas): state divergente/ausente rejeita, e-mail fora da allowlist
rejeita, roundtrip do JWT funciona, sessao invalida/expirada rejeita.

Nao testa integracao com auth.get_caller_email/require_admin de proposito:
essa sessao e desacoplada do ACL/admin baseado em IAP (ver docstring do
modulo) -- test_auth.py/test_project_access.py continuam cobrindo aquilo,
intocados."""

import os

os.environ.setdefault("BILLING_API_MOCK", "1")

from datetime import UTC, datetime, timedelta

import pytest
from fastapi import HTTPException
from jose import jwt

from billing_api import oauth_session as auth
from billing_api import secrets as app_secrets


@pytest.fixture(autouse=True)
def _jwt_secret(monkeypatch):
    monkeypatch.setattr(app_secrets, "get_jwt_secret", lambda: "test-secret")


def test_handle_callback_state_mismatch():
    with pytest.raises(HTTPException) as exc:
        auth.handle_callback("code", "state-do-google", "state-diferente-no-cookie")
    assert exc.value.status_code == 400
    assert exc.value.detail["code"] == "oauth_state_mismatch"


def test_handle_callback_state_cookie_ausente():
    with pytest.raises(HTTPException) as exc:
        auth.handle_callback("code", "qualquer-state", None)
    assert exc.value.status_code == 400


def test_handle_callback_email_fora_da_allowlist(monkeypatch):
    from billing_api import google_oauth

    monkeypatch.setattr(google_oauth, "fetch_userinfo", lambda code, uri: {"email": "gente@outra.com"})
    monkeypatch.setattr(
        app_secrets, "get_oauth_allowlist", lambda: {"allowed_domains": ["dp6.com.br"], "allowed_emails": []}
    )
    with pytest.raises(HTTPException) as exc:
        auth.handle_callback("code", "s", "s")
    assert exc.value.status_code == 403
    assert exc.value.detail["code"] == "email_not_allowed"


def test_handle_callback_email_domain_permitido(monkeypatch):
    from billing_api import google_oauth

    monkeypatch.setattr(
        google_oauth,
        "fetch_userinfo",
        lambda code, uri: {"email": "victoria.caroline@dp6.com.br", "name": "Victoria", "picture": None},
    )
    monkeypatch.setattr(
        app_secrets, "get_oauth_allowlist", lambda: {"allowed_domains": ["dp6.com.br"], "allowed_emails": []}
    )
    user = auth.handle_callback("code", "s", "s")
    assert user.email == "victoria.caroline@dp6.com.br"
    assert user.name == "Victoria"


def test_session_token_roundtrip():
    user = auth.SessionUser(email="a@dp6.com.br", name="A", picture="https://x/y.png")
    token = auth.issue_session_token(user)
    decoded = auth.decode_session_token(token)
    assert decoded.email == user.email
    assert decoded.name == user.name
    assert decoded.picture == user.picture


def test_decode_session_token_none():
    with pytest.raises(HTTPException) as exc:
        auth.decode_session_token(None)
    assert exc.value.status_code == 401
    assert exc.value.detail["code"] == "invalid_session"


def test_decode_session_token_expirado():
    payload = {
        "sub": "a@dp6.com.br",
        "name": "A",
        "picture": None,
        "exp": datetime.now(UTC) - timedelta(seconds=1),
    }
    token = jwt.encode(payload, "test-secret", algorithm="HS256")
    with pytest.raises(HTTPException) as exc:
        auth.decode_session_token(token)
    assert exc.value.status_code == 401


def test_decode_session_token_assinatura_invalida():
    payload = {
        "sub": "a@dp6.com.br",
        "name": "A",
        "picture": None,
        "exp": datetime.now(UTC) + timedelta(hours=1),
    }
    token = jwt.encode(payload, "outro-secret", algorithm="HS256")
    with pytest.raises(HTTPException) as exc:
        auth.decode_session_token(token)
    assert exc.value.status_code == 401


def test_build_redirect_uri_fallback_dev():
    assert auth.build_redirect_uri() == "http://localhost:8080/api/auth/callback"
