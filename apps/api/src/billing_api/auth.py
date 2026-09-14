"""Identidade do caller (via IAP) + gates de autorização da aba ADM.

O Cloud Run roda com iap_enabled=true e SÓ o agente do IAP tem roles/run.invoker
(terraform/modules/app_service/main.tf) -- nenhuma request chega aqui sem ter
passado pelo IAP primeiro. Mesmo assim, verificamos a assinatura do JWT
(X-Goog-IAP-JWT-Assertion) em vez de confiar de olhos fechados no header
X-Goog-Authenticated-User-Email: é barato e tira qualquer dúvida se a
config de IAM um dia mudar.

Duas dependencies SEPARADAS, nunca uma junção de checks:
- require_admin: humano do grupo ADM (ou o e-mail bootstrap).
- require_scheduler: só a SA do Cloud Scheduler (não é humano, não passa
  pelo Directory API, não deve conseguir chamar os endpoints de admin, e
  vice-versa -- um admin humano não deve conseguir chamar o endpoint interno
  do scheduler)."""

from __future__ import annotations

import logging

from fastapi import Depends, Header, HTTPException

from . import workspace_directory
from .config import get_settings

log = logging.getLogger("billing_api.auth")


def get_caller_email(x_goog_iap_jwt_assertion: str | None = Header(default=None)) -> str | None:
    """E-mail verificado do caller, ou None se não der pra verificar (sem
    header, sem audience configurada, JWT inválido/expirado). Nunca levanta
    exceção -- quem decide o que fazer com "não sei quem é" são require_*."""
    s = get_settings()
    if s.dev_force_admin:
        # escape-hatch só de dev local (.env) -- nunca setado por Terraform.
        return s.admin_bootstrap_emails[0] if s.admin_bootstrap_emails else None

    if not x_goog_iap_jwt_assertion or not s.iap_audience:
        return None

    try:
        from google.auth.transport import requests as google_requests
        from google.oauth2 import id_token

        payload = id_token.verify_token(
            x_goog_iap_jwt_assertion,
            google_requests.Request(),
            audience=s.iap_audience,
            certs_url="https://www.gstatic.com/iap/verify/public_key",
        )
        email = payload.get("email")
        return email.lower() if email else None
    except Exception:
        log.warning("JWT do IAP inválido/não verificável", exc_info=True)
        return None


def is_admin_email(email: str | None) -> bool:
    if not email:
        return False
    s = get_settings()
    e = email.lower()
    if e in {x.lower() for x in s.admin_bootstrap_emails}:
        return True
    return e in workspace_directory.get_group_members(s.admin_group_email)


def require_admin(email: str | None = Depends(get_caller_email)) -> str:
    if not is_admin_email(email):
        raise HTTPException(403, {"code": "forbidden", "message": "Acesso restrito ao grupo ADM."})
    return email


def require_scheduler(email: str | None = Depends(get_caller_email)) -> str:
    s = get_settings()
    if not email or not s.scheduler_sa_email or email.lower() != s.scheduler_sa_email.lower():
        raise HTTPException(403, {"code": "forbidden", "message": "Endpoint interno."})
    return email
