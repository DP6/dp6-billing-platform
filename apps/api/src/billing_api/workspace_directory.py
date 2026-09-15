"""Cliente do Admin SDK Directory API — confirma pertencimento (direto ou
aninhado) a grupos do Google Workspace via domain-wide delegation, sem
chave de service account. A SA de runtime assina o JWT de delegação usando
sua própria identidade (google.auth.iam.Signer, que chama a IAM
Credentials API — signBlob — em vez de precisar de uma chave privada
local), depois impersona settings.workspace_impersonate_email pra
consultar o grupo.

Porta quase verbatim de polaris-atlas/apps/backend/src/atlas/core/
workspace_directory.py (mesmo projeto GCP, mesmo mecanismo já em produção
lá) -- só troca o `settings` importado por get_settings() (como bq.py/
routes.py já fazem neste repo).

Usa o endpoint groups.hasMember (não groups.members.list): resolve
pertencimento DERIVADO/aninhado, igual o IAM/IAP do GCP já faz pra liberar
o Cloud Run. Achado em 2026-09-15: gcp-dp6-gti@dp6.com.br só tem UM membro
DIRETO, o subgrupo gti@dp6.com.br -- um members.list simples (versão
anterior deste módulo) nunca batia com o e-mail de uma pessoa real dentro
desse subgrupo, então ninguém além do bootstrap conseguia a aba ADM.

Pré-requisitos, nenhum gerenciado por este módulo:
- Admin SDK API habilitada no projeto (já está, dp6-ci-polaris).
- roles/iam.serviceAccountTokenCreator da SA de runtime sobre si mesma
  (self-binding) — permite assinar o JWT de delegação (terraform/modules/
  app_service, var.enable_self_impersonation).
- Domain-wide delegation autorizada no Admin Console do Workspace pro
  Client ID da SA de runtime, com os escopos abaixo (só leitura) — isso
  só um Super Admin do Workspace faz (ver terraform/bootstrap/outputs.tf,
  workspace_delegation_request).

Fail-closed por design: qualquer falha (delegação não configurada,
Workspace indisponível, escopo faltando, settings.workspace_impersonate_
email não setado) retorna False e loga o erro, nunca propaga exceção —
is_group_member nunca deve derrubar um endpoint só porque o Workspace está
fora do ar ou a integração ainda não foi ligada; o pior caso é ninguém além
do e-mail bootstrap (admin_bootstrap_emails) ter acesso à aba ADM, nunca
conceder acesso a mais gente do que devia.
"""

from __future__ import annotations

import logging
import threading
import time

import google.auth
from google.auth.iam import Signer
from google.auth.transport.requests import AuthorizedSession, Request
from google.oauth2 import service_account

from .config import get_settings

logger = logging.getLogger(__name__)

_TOKEN_URI = "https://oauth2.googleapis.com/token"
_HAS_MEMBER_URL_TEMPLATE = (
    "https://admin.googleapis.com/admin/directory/v1/groups/{group_email}/hasMember/{member_email}"
)
_DIRECTORY_SCOPES = [
    "https://www.googleapis.com/auth/admin.directory.group.readonly",
    "https://www.googleapis.com/auth/admin.directory.group.member.readonly",
]

_CACHE_TTL_SECONDS = 300
# dict em memória por processo, protegido por lock, TTL curto -- não é custo
# de query, é latência + cota de uma API externa que roda no caminho de
# require_admin, chamada em todo endpoint /adm/*. Chave é o par (grupo,
# membro) -- a checagem agora é por pessoa (hasMember), não mais um dump
# do grupo inteiro.
_membership_cache: dict[tuple[str, str], tuple[float, bool]] = {}
_membership_cache_lock = threading.Lock()


def _cache_get(group_email: str, member_email: str) -> bool | None:
    now = time.monotonic()
    with _membership_cache_lock:
        cached = _membership_cache.get((group_email, member_email))
    if cached is not None and now - cached[0] < _CACHE_TTL_SECONDS:
        return cached[1]
    return None


def _cache_set(group_email: str, member_email: str, is_member: bool) -> None:
    with _membership_cache_lock:
        _membership_cache[(group_email, member_email)] = (time.monotonic(), is_member)


def _build_delegated_credentials() -> service_account.Credentials | None:
    """Credenciais impersonando settings.workspace_impersonate_email,
    assinadas via IAM (sem chave local). None se a integração não
    estiver configurada."""
    s = get_settings()
    if not s.workspace_impersonate_email or not s.runtime_sa_email:
        return None

    adc_credentials, _ = google.auth.default(scopes=["https://www.googleapis.com/auth/iam"])
    request = Request()
    signer = Signer(request, adc_credentials, s.runtime_sa_email)

    return service_account.Credentials(
        signer=signer,
        service_account_email=s.runtime_sa_email,
        token_uri=_TOKEN_URI,
        scopes=_DIRECTORY_SCOPES,
        subject=s.workspace_impersonate_email,
    )


def is_group_member(group_email: str, member_email: str) -> bool:
    """True se member_email pertence a group_email, direto ou aninhado
    (groups.hasMember resolve a cadeia toda, igual o IAM/IAP do GCP) --
    com cache de 5min por par (grupo, membro). False se a integração não
    estiver configurada ou qualquer chamada falhar -- nunca propaga
    exceção (ver docstring do módulo)."""
    member_email = member_email.strip().lower()
    cached = _cache_get(group_email, member_email)
    if cached is not None:
        return cached

    try:
        credentials = _build_delegated_credentials()
        if credentials is None:
            return False

        session = AuthorizedSession(credentials)
        response = session.get(
            _HAS_MEMBER_URL_TEMPLATE.format(group_email=group_email, member_email=member_email),
            timeout=10,
        )
        if response.status_code == 404:
            # hasMember devolve 404 em vez de isMember=false quando o
            # member_email nao existe no dominio -- fora isso, nao-membro
            # de verdade vem 200 com isMember=false.
            is_member = False
        else:
            response.raise_for_status()
            is_member = bool(response.json().get("isMember"))
    except Exception:
        logger.exception(
            "Falha ao checar pertencimento de %s no grupo %s no Workspace Directory API",
            member_email, group_email,
        )
        return False

    _cache_set(group_email, member_email, is_member)
    return is_member
