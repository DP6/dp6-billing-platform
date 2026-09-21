"""Quais project_ids o caller pode ver -- ACL por projeto (Firestore
project_access) + bypass dos principals de sempre-tudo (grupo ADM, grupo
FinOps, e-mails bootstrap).

Terceiro gate de autorização, ORTOGONAL a require_admin/require_scheduler
(auth.py) -- por isso vive em módulo próprio em vez de entrar em auth.py, cujo
docstring já deixa explícito que aqueles dois nunca se combinam.

None = irrestrito (bypass -- vê todos os projetos, comportamento de hoje).
frozenset[str] (mesmo vazio) = só esses project_ids.

Fail-closed em toda camada: erro nunca amplia o que o caller vê --
list_project_access_or_empty (firestore.py) já devolve [] em erro, e
workspace_directory.is_group_member já devolve False em erro."""

from __future__ import annotations

import threading
import time

from fastapi import Depends

from . import firestore as fsdb
from . import workspace_directory
from .auth import get_caller_email
from .bq import mock_active
from .config import get_settings

_CACHE_TTL_SECONDS = 60
# bem mais curto que o cache de grupo (300s, workspace_directory) -- edição
# no ADM (aba de acesso por projeto) deve propagar rápido. O cache de
# is_group_member por baixo já absorve a maior parte do custo de rede; isso
# aqui só evita recomputar a união pra cada uma das ~10 chamadas de API que
# uma carga de tela dispara. Cloud Run com >1 instância continua tendo lag
# até o TTL por instância -- aceito, não resolvido (nenhuma invalidação
# cross-instância).
_cache: dict[str, tuple[float, frozenset[str] | None]] = {}
_cache_lock = threading.Lock()


def is_bypass_principal(email: str | None) -> bool:
    """True para quem vê todos os projetos sem precisar estar registrado em
    nenhum: e-mails bootstrap, grupo ADM (admin_group_email) e grupo FinOps
    (finops_group_email). Não confundir com is_admin_email (auth.py) --
    aquele decide a aba ADM; este decide visibilidade de dado, e o grupo
    FinOps entra aqui mas NUNCA em is_admin_email."""
    if not email:
        return False
    s = get_settings()
    e = email.lower()
    if e in {x.lower() for x in s.admin_bootstrap_emails}:
        return True
    return workspace_directory.is_group_member(s.admin_group_email, e) or workspace_directory.is_group_member(
        s.finops_group_email, e
    )


def _compute_authorized_project_ids(email: str) -> frozenset[str] | None:
    if is_bypass_principal(email):
        return None

    rows = fsdb.list_project_access_or_empty()
    direct: set[str] = set()
    groups_to_projects: dict[str, list[str]] = {}
    for r in rows:
        pid = r["project_id"]
        if email in {x.lower() for x in r.get("emails", [])}:
            direct.add(pid)
        for g in r.get("groups", []):
            groups_to_projects.setdefault(g.lower(), []).append(pid)

    # dedup por GRUPO DISTINTO antes de checar membership -- evita 1 chamada
    # de Directory API por PROJETO (N+1); custa no máximo 1 chamada por
    # grupo distinto referenciado na coleção inteira (cada uma já cacheada
    # 5min por workspace_directory).
    via_group: set[str] = set()
    for group_email, project_ids in groups_to_projects.items():
        if workspace_directory.is_group_member(group_email, email):
            via_group.update(project_ids)

    return frozenset(direct | via_group)


def get_authorized_project_ids(email: str | None = Depends(get_caller_email)) -> frozenset[str] | None:
    """Dependency FastAPI -- ver docstring do módulo. mock_active() sempre
    irrestrito (dado de demonstração, não dado real)."""
    if mock_active():
        return None
    if not email:
        return frozenset()
    email = email.lower()

    now = time.monotonic()
    with _cache_lock:
        cached = _cache.get(email)
    if cached is not None and now - cached[0] < _CACHE_TTL_SECONDS:
        return cached[1]

    result = _compute_authorized_project_ids(email)
    with _cache_lock:
        _cache[email] = (now, result)
    return result
