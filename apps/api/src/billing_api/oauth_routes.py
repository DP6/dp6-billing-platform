"""Rotas do login OAuth -- so orquestra request/response HTTP; a logica de
verdade mora em oauth_session.py (mesma separacao que o resto do repo usa,
ver adm_routes.py/routes.py).

Prefixo /api/auth -- nao colide com o /api/me ja existente (adm_routes.py,
baseado no IAP): este /api/auth/me e sobre a sessao de login do app, um
concern separado (ver docstring de oauth_session.py)."""

from __future__ import annotations

from urllib.parse import quote

from fastapi import APIRouter, Cookie, Depends, HTTPException, Response
from fastapi.responses import RedirectResponse

from . import oauth_session as auth
from .oauth_session import SessionUser, get_current_session_user

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.get("/login")
def login() -> RedirectResponse:
    state = auth.generate_state()
    response = RedirectResponse(auth.build_authorize_url(state))
    response.set_cookie(
        auth.STATE_COOKIE_NAME, state, max_age=auth.STATE_COOKIE_MAX_AGE_SECONDS, **auth.COOKIE_KWARGS
    )
    return response


@router.get("/callback")
def callback(
    code: str,
    state: str,
    oauth_state: str | None = Cookie(default=None, alias=auth.STATE_COOKIE_NAME),
) -> RedirectResponse:
    try:
        user = auth.handle_callback(code, state, oauth_state)
    except HTTPException as exc:
        detail = exc.detail if isinstance(exc.detail, dict) else {"message": str(exc.detail)}
        message = detail.get("message", "Não foi possível concluir o login.")
        response = RedirectResponse(f"/login?error={quote(message)}")
        response.delete_cookie(auth.STATE_COOKIE_NAME, **auth.COOKIE_KWARGS)
        return response

    token = auth.issue_session_token(user)
    response = RedirectResponse("/")
    response.delete_cookie(auth.STATE_COOKIE_NAME, **auth.COOKIE_KWARGS)
    response.set_cookie(
        auth.SESSION_COOKIE_NAME, token, max_age=auth.SESSION_COOKIE_MAX_AGE_SECONDS, **auth.COOKIE_KWARGS
    )
    return response


@router.get("/me", response_model=SessionUser)
def me(user: SessionUser = Depends(get_current_session_user)) -> SessionUser:
    return user


@router.post("/logout")
def logout() -> Response:
    response = Response(status_code=204)
    # delete_cookie precisa dos MESMOS atributos secure/httponly/samesite do
    # cookie original -- sem isso o browser nao reconhece como o mesmo
    # cookie e o Set-Cookie de delecao e ignorado, deixando a sessao viva.
    response.delete_cookie(auth.SESSION_COOKIE_NAME, **auth.COOKIE_KWARGS)
    return response
