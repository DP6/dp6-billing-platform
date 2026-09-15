"""Sincroniza budget/e-mail da aba ADM a partir do GCP Billing Budgets (o
alerta nativo do console de faturamento) + Cloud Monitoring (resolve os
canais de notificação por e-mail dos budgets).

Diferente de workspace_directory.py/email_report.py, aqui NÃO tem
impersonation/Workspace por trás -- roles/billing.viewer e roles/monitoring.viewer
são concedidos direto na identidade da própria SA de runtime (billing account
é hierarquia separada do projeto GCP, fora do nosso Terraform -- pedido
externo, ver docs/adr ou o plano da feature). Usa a credencial ADC padrão da
SA, sem Signer.

Fail-loud (mesma filosofia do CRUD do ADM em firestore.py): sync_all() deixa
qualquer erro de 1 scope virar "failed" nesse scope, mas erro ao LISTAR os
budgets (ex. sem o grant ainda) propaga -- quem chama (adm_routes.py) converte
pra um 503/erro honesto, igual o resto do CRUD administrativo.
"""

from __future__ import annotations

import logging
from typing import Any

from . import firestore as fsdb
from . import models as m
from . import routes
from .bq import mock_active
from .config import get_settings

log = logging.getLogger("billing_api.gcp_budgets")

_BUDGETS_URL = "https://billingbudgets.googleapis.com/v1/billingAccounts/{account}/budgets"
_CHANNEL_URL = "https://monitoring.googleapis.com/v3/{name}"
_PROJECT_URL = "https://cloudresourcemanager.googleapis.com/v3/projects/{project_id}"

_SCOPES = [
    # a Billing Budgets API SO aceita cloud-platform ou cloud-billing --
    # cloud-billing.readonly (usado antes) da ACCESS_TOKEN_SCOPE_INSUFFICIENT
    # mesmo com roles/billing.viewer certo na IAM (achado em prod, corpo do
    # 403 da API confirmou -- ver PR do logging verboso). roles/billing.viewer
    # continua sendo o que REALMENTE restringe a leitura a só-leitura; o
    # escopo OAuth em si nao tem variante read-only pra essa API.
    "https://www.googleapis.com/auth/cloud-billing",
    "https://www.googleapis.com/auth/monitoring.read",
    # Cloud Resource Manager (displayName do projeto -- fallback de
    # _project_name quando o projeto nao tem custo em rpt_cost_daily ainda,
    # ver comentario la embaixo).
    "https://www.googleapis.com/auth/cloudplatformprojects.readonly",
]


def _session():
    import google.auth
    from google.auth.transport.requests import AuthorizedSession

    creds, _ = google.auth.default(scopes=_SCOPES)
    return AuthorizedSession(creds)


def _raise_for_status_verbose(resp) -> None:
    """resp.raise_for_status() sozinho só loga a linha de status ("403
    Forbidden"), sem o corpo -- e é exatamente o corpo que traz o motivo real
    (PERMISSION_DENIED vs API não habilitada vs etc.) que o Google sempre
    devolve em JSON. Loga o corpo antes de propagar."""
    if resp.status_code >= 400:
        log.error("GCP API %s -> %s: %s", resp.url, resp.status_code, resp.text[:2000])
    resp.raise_for_status()


def _money_to_float(money: dict | None) -> float | None:
    """Money {currencyCode, units, nanos} -> float. None se ausente (budget
    usa lastPeriodAmount em vez de specifiedAmount -- sem valor fixo pra
    importar, o chamador decide pular)."""
    if not money:
        return None
    units = float(money.get("units", 0) or 0)
    nanos = float(money.get("nanos", 0) or 0) / 1e9
    return units + nanos


def _project_name(project: str | None) -> str | None:
    """1ª tentativa: rpt_cost_daily (via /dimensions) -- funciona pra projeto
    que já tem custo faturado, sem chamada HTTP extra. Projeto com budget no
    GCP mas ainda sem custo (ou não coberto pelo billing export por outro
    motivo) não aparece lá -- 2ª tentativa: Cloud Resource Manager
    (displayName oficial do projeto, não depende de ter custo). Sem SA com
    acesso ao projeto (cross-project, fora do nosso, sem grant) o
    ResourceManager falha -- devolve None (NUNCA o project_id como nome:
    scopeLabel()/BudgetsPanel no front já caem pro `scope` sozinhos quando
    project_name é None, então devolver o id aqui só duplicava a mesma coisa
    disfarçada de "nome")."""
    if not project or mock_active():
        return None
    try:
        dims = routes.dimensions()
        found = next((p.project_name for p in dims.projects if p.project_id == project), None)
        if found:
            return found
    except Exception:
        log.warning("Falha lendo /dimensions pra resolver nome de %s", project, exc_info=True)

    try:
        session = _session()
        resp = session.get(_PROJECT_URL.format(project_id=project), timeout=10)
        _raise_for_status_verbose(resp)
        return resp.json().get("displayName") or None
    except Exception:
        log.warning(
            "Não foi possível resolver o nome de exibição do projeto %s (sem custo em rpt_cost_daily "
            "e sem acesso via Resource Manager) -- fica só com o id por enquanto", project,
        )
        return None


def _resolve_email_channels(session, channel_names: list[str]) -> list[str]:
    """Só canais type=="email" viram e-mail (SMS/Slack/PubSub são ignorados).
    Canal individual que falhar não derruba o resto -- loga e segue."""
    emails: list[str] = []
    for name in channel_names:
        try:
            resp = session.get(_CHANNEL_URL.format(name=name), timeout=10)
            _raise_for_status_verbose(resp)
            ch = resp.json()
            if ch.get("type") == "email":
                email = (ch.get("labels") or {}).get("email_address")
                if email:
                    emails.append(email.strip().lower())
        except Exception:
            log.warning("Falha lendo canal de notificação %s", name, exc_info=True)
    return emails


def _resolve_project_id(session, raw: str) -> str:
    """budgetFilter.projects vem no formato "projects/{project}" -- {project}
    às vezes é o NÚMERO do projeto, não o ID em string (inconsistência real
    da API, achada em prod: 1 budget deu o id "dp6-brasil", outro deu só o
    número "86068631905"). O resto do painel (dims.projects, FilterBar,
    rpt_cost_daily) só conhece o ID em string -- usar o número como scope
    aqui quebra a correlação com a Visão Geral (o orçamento fica "invisível"
    pro filtro de projeto, mesmo existindo no Firestore). Resolve pro ID
    canônico via Resource Manager quando `raw` é só dígitos; se a resolução
    falhar (sem acesso ainda), mantém o número mesmo -- não trava a
    sincronização, só fica com essa mesma limitação até o acesso existir."""
    if not raw.isdigit():
        return raw
    try:
        resp = session.get(_PROJECT_URL.format(project_id=raw), timeout=10)
        _raise_for_status_verbose(resp)
        return resp.json().get("projectId") or raw
    except Exception:
        log.warning("Não foi possível resolver o project_id canônico do número %s -- mantendo o número como escopo", raw)
        return raw


def list_gcp_budgets() -> list[dict[str, Any]]:
    """1 item por escopo (project_id, ou ACCOUNT_SCOPE pro budget sem filtro
    de projeto) descoberto nos budgets do GCP. Um budget pode listar vários
    projetos no filtro -- vira 1 item por projeto, mesmo budget_brl/emails
    (é o mesmo pool no GCP). Projeto coberto por mais de 1 budget é ambíguo:
    fica com o primeiro encontrado, loga aviso -- não trava a sincronização."""
    s = get_settings()
    session = _session()

    budgets: list[dict] = []
    page_token: str | None = None
    while True:
        params: dict[str, Any] = {"pageSize": 100}
        if page_token:
            params["pageToken"] = page_token
        resp = session.get(_BUDGETS_URL.format(account=s.billing_account_id), params=params, timeout=20)
        _raise_for_status_verbose(resp)
        data = resp.json()
        budgets.extend(data.get("budgets", []))
        page_token = data.get("nextPageToken")
        if not page_token:
            break

    out: list[dict[str, Any]] = []
    seen_scopes: set[str] = set()
    for b in budgets:
        name = b.get("name", "")
        amount = _money_to_float((b.get("amount") or {}).get("specifiedAmount"))
        if amount is None:
            log.warning("Budget %s sem specifiedAmount (usa lastPeriodAmount) -- pulando, sem valor fixo pra importar", name)
            continue

        channels = (b.get("notificationsRule") or {}).get("monitoringNotificationChannels") or []
        emails = _resolve_email_channels(session, channels)

        project_ids = [
            _resolve_project_id(session, p.split("/")[-1])
            for p in (b.get("budgetFilter") or {}).get("projects") or []
        ]
        scopes = project_ids if project_ids else [fsdb.ACCOUNT_SCOPE]

        for scope in scopes:
            if scope in seen_scopes:
                log.warning("Escopo %s já coberto por outro budget do GCP -- ignorando %s (ambíguo)", scope, name)
                continue
            seen_scopes.add(scope)
            out.append({"scope": scope, "budget_brl": amount, "emails": emails, "gcp_budget_name": name})
    return out


def sync_all(only_scope: str | None = None) -> m.SyncBudgetsResultDTO:
    """Lista os budgets do GCP e faz upsert em cada scope descoberto,
    respeitando os toggles budget_source_gcp/emails_source_gcp de quem já
    existe (scope novo sempre adota os 2 ligados, ver firestore.sync_from_gcp).
    """
    if mock_active():
        return m.SyncBudgetsResultDTO()

    gcp_budgets = list_gcp_budgets()
    if only_scope:
        gcp_budgets = [b for b in gcp_budgets if b["scope"] == only_scope]

    existing = {row["scope"]: row for row in fsdb.list_budgets()}

    created, updated, skipped, failed = [], [], [], []
    for gb in gcp_budgets:
        scope = gb["scope"]
        try:
            current = existing.get(scope)
            project_name = None if scope == fsdb.ACCOUNT_SCOPE else _project_name(scope)

            if current is None:
                fsdb.sync_from_gcp(scope, project_name, gb["gcp_budget_name"], gb["budget_brl"], gb["emails"])
                created.append(scope)
                continue

            want_budget = bool(current.get("budget_source_gcp"))
            want_emails = bool(current.get("emails_source_gcp"))
            if not want_budget and not want_emails:
                # sem toggle ligado -- só atualiza o bookkeeping, não toca valor
                fsdb.sync_from_gcp(scope, project_name, gb["gcp_budget_name"], None, None)
                skipped.append(scope)
                continue

            fsdb.sync_from_gcp(
                scope, project_name, gb["gcp_budget_name"],
                gb["budget_brl"] if want_budget else None,
                gb["emails"] if want_emails else None,
            )
            updated.append(scope)
        except Exception:
            log.exception("Falha sincronizando budget do GCP pro scope %s", scope)
            failed.append(scope)

    return m.SyncBudgetsResultDTO(
        scopes_created=created, scopes_updated=updated, scopes_skipped=skipped, scopes_failed=failed,
    )
