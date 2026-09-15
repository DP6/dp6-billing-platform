"""Aba ADM: identidade (/me), CRUD de budget/e-mail (Firestore) e disparo do
relatório semanal por e-mail. Todo endpoint de escrita/leitura administrativa
é gated por require_admin (auth.py) -- a única exceção é /me (qualquer caller
autenticado pelo IAP pode perguntar "sou admin?") e o endpoint interno do
scheduler (require_scheduler, dependency separada -- ver auth.py)."""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException

from . import email_report
from . import firestore as fsdb
from . import models as m
from .auth import get_caller_email, is_admin_email, require_admin, require_scheduler
from .bq import mock_active

log = logging.getLogger("billing_api.adm_routes")

router = APIRouter(prefix="/api")


def _fs_or_503(fn, *args, **kwargs):
    """CRUD do ADM é fail-loud (ver firestore.py) -- converte qualquer erro
    do Firestore num 503 honesto, mesmo padrão do data_not_ready de bq.py."""
    try:
        return fn(*args, **kwargs)
    except ValueError as exc:
        raise HTTPException(400, {"code": "invalid_request", "message": str(exc)}) from exc
    except Exception as exc:
        log.exception("Firestore indisponível")
        raise HTTPException(
            503, {"code": "firestore_unavailable", "message": "Configuração indisponível no momento."}
        ) from exc


@router.get("/me", response_model=m.MeDTO)
def me(email: str | None = Depends(get_caller_email)) -> m.MeDTO:
    return m.MeDTO(email=email or "", is_admin=is_admin_email(email))


@router.get("/adm/budgets", response_model=list[m.BudgetConfigDTO])
def list_budgets(_: str = Depends(require_admin)) -> list[m.BudgetConfigDTO]:
    if mock_active():
        return [m.BudgetConfigDTO(scope=fsdb.ACCOUNT_SCOPE, budget_brl=20.0, emails=[])]
    return [m.BudgetConfigDTO(**row) for row in _fs_or_503(fsdb.list_budgets)]


@router.put("/adm/budgets/{scope}", response_model=m.BudgetConfigDTO)
def upsert_budget(
    scope: str, body: m.BudgetConfigUpsertDTO, actor: str = Depends(require_admin)
) -> m.BudgetConfigDTO:
    emails = [e.strip() for e in body.emails if e.strip() and "@" in e]
    if mock_active():
        return m.BudgetConfigDTO(scope=scope, budget_brl=body.budget_brl, emails=emails, report_enabled=body.report_enabled or False)
    row = _fs_or_503(fsdb.upsert_budget, scope, body.budget_brl, emails, actor, body.report_enabled)
    return m.BudgetConfigDTO(**row)


@router.put("/adm/budgets/{scope}/report-enabled", response_model=m.BudgetConfigDTO)
def set_report_enabled(
    scope: str, body: m.ReportEnabledUpdateDTO, actor: str = Depends(require_admin)
) -> m.BudgetConfigDTO:
    """Toggle rapido (tabela do relatorio semanal) -- nao mexe em budget_brl/emails."""
    if mock_active():
        return m.BudgetConfigDTO(scope=scope, budget_brl=20.0, emails=[], report_enabled=body.enabled)
    row = _fs_or_503(fsdb.set_report_enabled, scope, body.enabled, actor)
    return m.BudgetConfigDTO(**row)


@router.delete("/adm/budgets/{scope}", status_code=204)
def delete_budget(scope: str, _: str = Depends(require_admin)) -> None:
    if mock_active():
        return None
    _fs_or_503(fsdb.delete_budget, scope)


@router.get("/adm/weekly-report/config", response_model=m.WeeklyReportConfigDTO)
def weekly_report_config(_: str = Depends(require_admin)) -> m.WeeklyReportConfigDTO:
    """Só bookkeeping do disparo automático (last_run_*) -- o toggle em si é
    por budget (PUT /adm/budgets/{scope}/report-enabled)."""
    if mock_active():
        return m.WeeklyReportConfigDTO()
    return m.WeeklyReportConfigDTO(**_fs_or_503(fsdb.get_weekly_report_config))


@router.post("/adm/weekly-report/send-now", response_model=m.SendNowResultDTO)
def send_now(body: m.SendNowRequestDTO | None = None, _: str = Depends(require_admin)) -> m.SendNowResultDTO:
    """Manual (1 linha, via body.scope, ou "enviar pra todos" sem body) --
    ignora o toggle report_enabled de propósito, é um disparo explícito."""
    scope = body.scope if body else None
    return email_report.run_weekly_report(only_scope=scope, respect_toggle=False)


@router.post("/internal/weekly-report/scheduled-run", response_model=m.SendNowResultDTO)
def scheduled_run(_: str = Depends(require_scheduler)) -> m.SendNowResultDTO:
    """Chamado só pelo Cloud Scheduler (segunda 08:00, prod) -- manda só pros
    budgets com report_enabled=true."""
    return email_report.run_weekly_report(respect_toggle=True)
