"""Cliente Firestore (banco NOMEADO, nao o "(default)") + CRUD do cadastro de
budget/e-mail da aba ADM. Primeiro dado GRAVAVEL deste repo -- tudo o resto
(rpt_*/mart) e populado read-only pelo Dataform.

Duas filosofias de erro, deliberadamente diferentes:
- leitura publica (get_budget_or_none, chamada por /budget e /scorecard pra
  QUALQUER usuario, nao só admin) e FAIL-OPEN: Firestore fora do ar nunca
  derruba o dashboard, só faz o caller cair no fallback (Settings.monthly_
  budget_brl) -- mesmo espirito do fail-closed de workspace_directory.py,
  na direcao oposta (aqui "falhar seguro" = continuar mostrando o dashboard).
- CRUD do ADM (list/upsert/delete/config) e FAIL-LOUD: quem esta editando
  configuracao precisa de erro honesto, nao sucesso silencioso que na
  verdade nao gravou nada. adm_routes.py converte a excecao em 503
  firestore_unavailable, mesmo padrao do 503 data_not_ready que bq.py usa
  pra erro de BigQuery.
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime
from typing import Any

from .config import get_settings

log = logging.getLogger("billing_api.firestore")

_client = None

ACCOUNT_SCOPE = "_account"
_BUDGETS = "budgets"
_ADM_CONFIG = "adm_config"
_WEEKLY_REPORT_DOC = "weekly_report"


def _get_client():
    global _client
    if _client is None:
        from google.cloud import firestore

        s = get_settings()
        _client = firestore.Client(project=s.gcp_project, database=s.firestore_database)
    return _client


def _now() -> str:
    return datetime.now(UTC).isoformat()


# ---------------------------------------------------------------- budgets

def get_budget_or_none(scope: str) -> dict[str, Any] | None:
    """Fail-open: qualquer erro (Firestore fora do ar, doc inexistente, banco
    ainda não provisionado) devolve None -- o caller cai no fallback de
    Settings.monthly_budget_brl. Nunca propaga exceção."""
    try:
        snap = _get_client().collection(_BUDGETS).document(scope).get()
        return snap.to_dict() if snap.exists else None
    except Exception:
        log.warning("Firestore indisponível lendo budgets/%s — caindo no fallback", scope, exc_info=True)
        return None


def list_budgets() -> list[dict[str, Any]]:
    """Fail-loud (ver docstring do módulo) -- usado só pela aba ADM."""
    docs = _get_client().collection(_BUDGETS).stream()
    out = []
    for d in docs:
        row = d.to_dict()
        row["scope"] = d.id
        out.append(row)
    out.sort(key=lambda r: (r["scope"] != ACCOUNT_SCOPE, r.get("project_name") or r["scope"]))
    return out


def upsert_budget(
    scope: str, budget_brl: float, emails: list[str], actor_email: str,
    report_enabled: bool | None = None, project_name: str | None = None,
) -> dict[str, Any]:
    doc = {
        "budget_brl": budget_brl,
        "emails": emails,
        "updated_at": _now(),
        "updated_by": actor_email,
    }
    # só inclui se explicitamente passado -- merge=True SOBRESCREVE campo
    # listado, então incluir sempre (com default False) resetaria o toggle
    # do relatório semanal a cada edição de budget_brl/emails.
    if report_enabled is not None:
        doc["report_enabled"] = report_enabled
    if project_name is not None:
        doc["project_name"] = project_name
    _get_client().collection(_BUDGETS).document(scope).set(doc, merge=True)
    doc["scope"] = scope
    return doc


def set_report_enabled(scope: str, enabled: bool, actor_email: str) -> dict[str, Any]:
    """Toggle rapido de 1 budget, sem precisar reenviar budget_brl/emails
    (usado pela tabela do relatorio semanal -- editar o orcamento inteiro é
    uma acao separada, via upsert_budget)."""
    ref = _get_client().collection(_BUDGETS).document(scope)
    ref.set({"report_enabled": enabled, "updated_at": _now(), "updated_by": actor_email}, merge=True)
    snap = ref.get()
    doc = snap.to_dict() or {}
    doc["scope"] = scope
    return doc


def delete_budget(scope: str) -> None:
    if scope == ACCOUNT_SCOPE:
        raise ValueError("o orçamento da conta inteira não pode ser excluído")
    _get_client().collection(_BUDGETS).document(scope).delete()


# ---------------------------------------------------------------- relatorio semanal

def get_weekly_report_config() -> dict[str, Any]:
    """Fail-loud. Bookkeeping GLOBAL do disparo automatico (last_run_*) --
    o toggle em si é por budget (report_enabled, ver upsert_budget/
    set_report_enabled). Doc pode não existir ainda (1a vez)."""
    snap = _get_client().collection(_ADM_CONFIG).document(_WEEKLY_REPORT_DOC).get()
    if not snap.exists:
        return {"last_run_at": None, "last_run_status": None}
    return snap.to_dict()


def record_report_run(status: str) -> None:
    """Chamado pelo próprio job (scheduled ou manual) -- não deve derrubar o
    envio se falhar, só loga."""
    try:
        doc = _get_client().collection(_ADM_CONFIG).document(_WEEKLY_REPORT_DOC)
        doc.set({"last_run_at": _now(), "last_run_status": status}, merge=True)
    except Exception:
        log.warning("Falha ao gravar last_run_at/status do relatório semanal", exc_info=True)
