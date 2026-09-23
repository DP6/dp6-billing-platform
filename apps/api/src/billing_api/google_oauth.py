"""Unica camada que fala com as APIs do Google (OAuth authorize/token/
userinfo) -- oauth_session.py orquestra o fluxo e nunca monta essas
URLs/chamadas diretamente (mesmo padrao do polaris-atlas,
domains/auth/repository.py).
"""

from __future__ import annotations

from authlib.integrations.requests_client import OAuth2Session

from . import secrets

_AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth"
_TOKEN_URL = "https://oauth2.googleapis.com/token"
_USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo"
_SCOPES = "openid email profile"


def _oauth_session(redirect_uri: str) -> OAuth2Session:
    return OAuth2Session(
        secrets.get_oauth_client_id(),
        secrets.get_oauth_client_secret(),
        scope=_SCOPES,
        redirect_uri=redirect_uri,
    )


def build_authorize_url(redirect_uri: str, state: str, prompt: str | None = None) -> str:
    """prompt e repassado como parametro extra pro authorize endpoint do
    Google sem essa funcao saber o que ele significa -- quem decide qual
    prompt usar (ou nenhum) e oauth_session.py."""
    extra = {"prompt": prompt} if prompt else {}
    url, _ = _oauth_session(redirect_uri).create_authorization_url(_AUTHORIZE_URL, state=state, **extra)
    return url


def fetch_userinfo(code: str, redirect_uri: str) -> dict:
    """Troca o authorization code pelo token do Google e busca o userinfo
    (email/name/picture) no endpoint OpenID Connect. Propaga excecoes de
    rede/HTTP pra quem chama tratar (oauth_session.py converte em erro
    amigavel pro fluxo de /callback)."""
    session = _oauth_session(redirect_uri)
    session.fetch_token(_TOKEN_URL, code=code, grant_type="authorization_code")
    response = session.get(_USERINFO_URL)
    response.raise_for_status()
    return response.json()
