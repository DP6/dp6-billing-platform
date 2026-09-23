"""Sessao de login (Google OAuth) por cima do IAP -- mesmo mecanismo do
polaris-atlas (authlib + JWT em cookie httpOnly), adaptado pra servico unico
(front+back no mesmo Cloud Run, ADR-008): sem hop client-side no callback
(Google chama /api/auth/callback direto no backend) e cookie SameSite=Lax
em vez de None (nao ha cross-origin a resolver aqui).

IMPORTANTE: a identidade daqui NAO substitui nem se mistura com
auth.get_caller_email (IAP) -- essa continua sendo a UNICA fonte usada por
require_admin/project_access.py/adm_routes.me. Esta sessao e so um gate
adicional de "completou o login do app" pro RequireAuth do front decidir o
que mostrar; nenhum endpoint de negocio depende dela.
"""

from __future__ import annotations

import secrets as token_secrets
from datetime import UTC, datetime, timedelta

from authlib.integrations.base_client.errors import OAuthError
from fastapi import Cookie, HTTPException
from jose import JWTError, jwt
from pydantic import BaseModel
from requests import RequestException

from . import google_oauth
from . import secrets as app_secrets
from .config import get_settings

STATE_COOKIE_NAME = "oauth_state"
SESSION_COOKIE_NAME = "session"
SESSION_COOKIE_MAX_AGE_SECONDS = 12 * 60 * 60
STATE_COOKIE_MAX_AGE_SECONDS = 10 * 60  # janela curta -- so entre /login e /callback
_JWT_ALGORITHM = "HS256"

# mesma origem (servico unico) -- sem necessidade de SameSite=None como no
# polaris-atlas (2 Cloud Run distintos). Secure=True funciona em prod (Cloud
# Run e sempre HTTPS) e em dev local via "localhost" literal (Chrome trata
# como contexto seguro mesmo sem TLS; 127.0.0.1/IP de LAN nao contam).
COOKIE_KWARGS = {"httponly": True, "secure": True, "samesite": "lax", "path": "/"}


class SessionUser(BaseModel):
    email: str
    name: str
    picture: str | None = None


def generate_state() -> str:
    return token_secrets.token_urlsafe(32)


def build_redirect_uri() -> str:
    base = get_settings().oauth_redirect_base_url or "http://localhost:8080"
    return f"{base}/api/auth/callback"


def build_authorize_url(state: str) -> str:
    # select_account forca o Google a sempre mostrar o seletor de contas,
    # mesmo com uma sessao do Google ja ativa no browser -- sem isso, depois
    # de um logout do app (que nao afeta a sessao do Google em si), clicar
    # em "Entrar com Google" de novo autentica silenciosamente com a mesma
    # conta, sem dar a chance de escolher outra.
    return google_oauth.build_authorize_url(build_redirect_uri(), state, prompt="select_account")


def _is_email_allowed(email: str, allowlist: dict) -> bool:
    domain = email.rsplit("@", 1)[-1].lower()
    allowed_domains = {d.lower() for d in allowlist.get("allowed_domains", [])}
    allowed_emails = {e.lower() for e in allowlist.get("allowed_emails", [])}
    return domain in allowed_domains or email.lower() in allowed_emails


def handle_callback(code: str, state: str, state_cookie: str | None) -> SessionUser:
    if not state_cookie or state != state_cookie:
        raise HTTPException(400, {"code": "oauth_state_mismatch", "message": "Login expirado, tente de novo."})

    try:
        userinfo = google_oauth.fetch_userinfo(code, build_redirect_uri())
    except (OAuthError, RequestException) as exc:
        raise HTTPException(502, {"code": "oauth_exchange_failed", "message": str(exc)}) from exc

    email = userinfo.get("email")
    if not email:
        raise HTTPException(502, {"code": "oauth_exchange_failed", "message": "resposta do Google sem email"})

    if not _is_email_allowed(email, app_secrets.get_oauth_allowlist()):
        raise HTTPException(
            403, {"code": "email_not_allowed", "message": f"{email} não tem acesso a este painel."}
        )

    return SessionUser(email=email, name=userinfo.get("name") or email, picture=userinfo.get("picture"))


def issue_session_token(user: SessionUser) -> str:
    payload = {
        "sub": user.email,
        "name": user.name,
        "picture": user.picture,
        "exp": datetime.now(UTC) + timedelta(seconds=SESSION_COOKIE_MAX_AGE_SECONDS),
    }
    return jwt.encode(payload, app_secrets.get_jwt_secret(), algorithm=_JWT_ALGORITHM)


def decode_session_token(token: str | None) -> SessionUser:
    if token is None:
        raise HTTPException(401, {"code": "invalid_session", "message": "Sessão inválida ou expirada."})
    try:
        payload = jwt.decode(token, app_secrets.get_jwt_secret(), algorithms=[_JWT_ALGORITHM])
    except JWTError as exc:
        raise HTTPException(401, {"code": "invalid_session", "message": "Sessão inválida ou expirada."}) from exc
    return SessionUser(email=payload["sub"], name=payload["name"], picture=payload.get("picture"))


def get_current_session_user(session: str | None = Cookie(default=None)) -> SessionUser:
    return decode_session_token(session)
