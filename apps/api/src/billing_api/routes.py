"""Todos os endpoints. Cada um: se mock_active() -> fixtures; senão -> SQL contra rpt_*.
As SQLs assumem as views de definitions/reporting/ (specs/001, docs/data-contract.md)."""

from __future__ import annotations

from pathlib import Path

import yaml
from fastapi import APIRouter, Query

from . import firestore as fsdb
from . import fixtures as fx
from . import models as m
from .bq import mock_active, query
from .config import get_settings

router = APIRouter(prefix="/api")
S = get_settings()
RPT = f"{S.gcp_project}.{S.reporting_dataset}"
MART = f"{S.gcp_project}.{S.mart_dataset}"

DateStr = str


def _pct_of_total(rows: list[dict], total: float) -> list[dict]:
    return [{**r, "pct_of_total": (r["net_cost_brl"] / total if total else 0.0)} for r in rows]


def _scope(
    service: str | None, environment: str | None, app: str | None, project: str | None = None
) -> tuple[str, dict]:
    """Clausula WHERE de recorte (serviço/ambiente/app/projeto) para as views rpt_*.
    Devolve ("" ou " AND ...", params)."""
    clauses, params = [], {}
    for col, val in (
        ("service_description", service),
        ("label_environment", environment),
        ("label_app", app),
        ("project_id", project),
    ):
        if val:
            clauses.append(f"{col} = @{col}")
            params[col] = val
    return (" AND " + " AND ".join(clauses) if clauses else "", params)


def _has_scope(service: str | None, environment: str | None, app: str | None, project: str | None = None) -> bool:
    return bool(service or environment or app or project)


def _effective_budget_brl(project: str | None) -> float:
    """Budget por escopo (aba ADM, Firestore) com fallback pra constante
    fixa de Settings -- fica ao vivo (sem o lag do cron diário do Dataform),
    e nenhuma view .sqlx precisa mudar pra isso funcionar."""
    if mock_active():
        return S.monthly_budget_brl
    cfg = fsdb.get_budget_or_none(project or fsdb.ACCOUNT_SCOPE)
    return float(cfg["budget_brl"]) if cfg else S.monthly_budget_brl


# ---------------------------------------------------------------- meta / dimensions / scorecard

def _freshness() -> dict:
    """Frescor + tamanho da carga a partir da camada reporting (a API só lê rpt_*/mart).
    `fct_billing_cost_daily` não carrega `export_time` (é agregado) — usamos
    MAX(usage_date) como proxy de "dados até". Um `rpt_meta` com o export_time real
    fica para uma próxima rodada (specs/003)."""
    r = query(f"""
        SELECT
          FORMAT_DATE('%FT00:00:00Z', MAX(usage_date)) AS data_updated_at,
          SUM(line_count) AS source_rows
        FROM `{MART}.fct_billing_cost_daily`
    """)[0]
    months = [x["invoice_month"] for x in query(
        f"SELECT DISTINCT invoice_month FROM `{MART}.agg_billing_cost_monthly` ORDER BY 1"
    )]
    return {
        "data_updated_at": r["data_updated_at"] or "",
        "source_rows": int(r["source_rows"] or 0),
        "invoice_months": months,
    }


@router.get("/meta", response_model=m.MetaDTO)
def meta() -> m.MetaDTO:
    if mock_active():
        return m.MetaDTO(**fx.META)
    fr = _freshness()
    return m.MetaDTO(export_ok=True, **fr)


@router.get("/dimensions", response_model=m.DimensionsDTO)
def dimensions() -> m.DimensionsDTO:
    """Valores das listas de filtro (Serviço/Ambiente/App/Projeto) + frescor."""
    if mock_active():
        return m.DimensionsDTO(**fx.DIMENSIONS)
    services = [r["v"] for r in query(
        f"SELECT DISTINCT service_description v FROM `{RPT}.rpt_cost_daily` "
        f"WHERE service_description IS NOT NULL ORDER BY 1"
    )]
    environments = [r["v"] for r in query(
        f"SELECT DISTINCT label_environment v FROM `{RPT}.rpt_cost_daily` "
        f"WHERE label_environment IS NOT NULL AND label_environment != '' ORDER BY 1"
    )]
    apps = [r["v"] for r in query(
        f"SELECT DISTINCT label_app v FROM `{RPT}.rpt_cost_daily` "
        f"WHERE label_app IS NOT NULL AND label_app != '' ORDER BY 1"
    )]
    project_rows = query(
        f"SELECT project_id, ANY_VALUE(project_name) project_name FROM `{RPT}.rpt_cost_daily` "
        f"WHERE project_id IS NOT NULL GROUP BY project_id ORDER BY project_name"
    )
    fr = _freshness()
    return m.DimensionsDTO(
        services=services,
        environments=environments,
        apps=apps,
        projects=[m.ProjectDTO(**r) for r in project_rows],
        invoice_months=fr["invoice_months"],
        data_updated_at=fr["data_updated_at"],
        export_ok=True,
        source_rows=fr["source_rows"],
    )


@router.get("/scorecard", response_model=m.ScorecardDTO)
def scorecard(
    service: str | None = None,
    environment: str | None = None,
    app: str | None = None,
    project: str | None = None,
    from_: DateStr | None = Query(default=None, alias="from"),
    to: DateStr | None = None,
) -> m.ScorecardDTO:
    """Sem from/to e sem recorte -> caminho rapido pela view (MTD do mes corrente).
    Com from/to -> os campos de custo/creditos/economia passam a ser a soma na janela
    e prev_month_net_brl vira o total da janela anterior de mesmo tamanho. run_rate/budget
    continuam MTD (o front nao os usa no bloco "periodo"; /budget chama sem from/to)."""
    if mock_active():
        return m.ScorecardDTO(**fx.SCORECARD)

    where, params = _scope(service, environment, app, project)

    # sempre precisamos do MTD para run_rate/budget/dias
    mtd = query(f"""
        SELECT
          SUM(net_cost_brl) net, SUM(net_cost_usd) net_usd,
          SUM(gross_cost_brl) gross, SUM(credits_total_brl) credits
        FROM `{RPT}.rpt_cost_daily`
        WHERE FORMAT_DATE('%Y%m', usage_date) = FORMAT_DATE('%Y%m', CURRENT_DATE('America/Sao_Paulo'))
          {where}
    """, params)[0]
    cal = query("""
        SELECT EXTRACT(DAY FROM CURRENT_DATE('America/Sao_Paulo')) days_elapsed,
               EXTRACT(DAY FROM LAST_DAY(CURRENT_DATE('America/Sao_Paulo'))) days_in_month,
               FORMAT_DATE('%Y%m', CURRENT_DATE('America/Sao_Paulo')) invoice_month
    """)[0]
    net_mtd = float(mtd["net"] or 0.0)
    days_elapsed = int(cal["days_elapsed"] or 1) or 1
    days_in_month = int(cal["days_in_month"] or 30)
    run_rate = net_mtd / days_elapsed * days_in_month
    budget = _effective_budget_brl(project)

    if from_ and to:
        win = query(f"""
            SELECT SUM(net_cost_brl) net, SUM(net_cost_usd) net_usd,
                   SUM(gross_cost_brl) gross, SUM(credits_total_brl) credits
            FROM `{RPT}.rpt_cost_daily`
            WHERE usage_date BETWEEN @from AND @to {where}
        """, {**params, "from": from_, "to": to})[0]
        prev = query(f"""
            SELECT SUM(net_cost_brl) net FROM `{RPT}.rpt_cost_daily`
            WHERE usage_date BETWEEN
              DATE_SUB(@from, INTERVAL DATE_DIFF(@to, @from, DAY) + 1 DAY) AND DATE_SUB(@from, INTERVAL 1 DAY)
              {where}
        """, {**params, "from": from_, "to": to})[0]
        net = float(win["net"] or 0.0)
        gross = float(win["gross"] or 0.0)
        credits = float(win["credits"] or 0.0)
        net_usd = float(win["net_usd"] or 0.0)
        net_prev = float(prev["net"] or 0.0)
    elif not _has_scope(service, environment, app, project):
        r = query(f"SELECT * FROM `{RPT}.rpt_cost_scorecard`")[0]
        # rpt_cost_scorecard traz budget_brl/budget_used_pct/run_rate_vs_budget_pct
        # compilados com a constante velha do Dataform (nenhum .sqlx muda pra
        # aba ADM, ver _effective_budget_brl) -- sobrescreve com o valor vivo.
        r["budget_brl"] = budget
        r["budget_used_pct"] = (float(r["net_cost_mtd_brl"]) / budget) if budget else 0.0
        r["run_rate_vs_budget_pct"] = (float(r["run_rate_eom_brl"]) / budget) if budget else 0.0
        return m.ScorecardDTO(**r)
    else:
        prevm = query(f"""
            SELECT SUM(net_cost_brl) net FROM `{RPT}.rpt_cost_monthly`
            WHERE invoice_month = FORMAT_DATE('%Y%m', DATE_SUB(DATE_TRUNC(CURRENT_DATE('America/Sao_Paulo'), MONTH), INTERVAL 1 DAY))
              {where}
        """, params)[0]
        net = net_mtd
        gross = float(mtd["gross"] or 0.0)
        credits = float(mtd["credits"] or 0.0)
        net_usd = float(mtd["net_usd"] or 0.0)
        net_prev = float(prevm["net"] or 0.0)

    return m.ScorecardDTO(
        invoice_month=cal["invoice_month"],
        net_cost_mtd_brl=net,
        net_cost_mtd_usd=net_usd,
        gross_cost_mtd_brl=gross,
        credits_mtd_brl=credits,
        prev_month_net_brl=net_prev,
        mom_pct=((net - net_prev) / net_prev) if net_prev else 0.0,
        run_rate_eom_brl=run_rate,
        days_elapsed=days_elapsed,
        days_in_month=days_in_month,
        budget_brl=budget,
        budget_used_pct=(net_mtd / budget) if budget else 0.0,
        run_rate_vs_budget_pct=(run_rate / budget) if budget else 0.0,
        effective_savings_pct=((-credits / gross) if gross else 0.0),
    )


# ---------------------------------------------------------------- cost

@router.get("/cost/daily", response_model=list[m.DailyPointDTO])
def cost_daily(
    from_: DateStr = Query(alias="from"), to: DateStr = Query(...),
    service: str | None = None, environment: str | None = None, app: str | None = None,
    project: str | None = None,
) -> list[m.DailyPointDTO]:
    if mock_active():
        pts = [p for p in fx.daily_points() if from_ <= p["usage_date"] <= to]
        return [m.DailyPointDTO(**p) for p in pts]
    where = ["usage_date BETWEEN @from AND @to"]
    params: dict = {"from": from_, "to": to}
    for col, val in (
        ("service_description", service), ("label_environment", environment),
        ("label_app", app), ("project_id", project),
    ):
        if val:
            where.append(f"{col} = @{col}")
            params[col] = val
    rows = query(f"""
        WITH d AS (
          SELECT usage_date, SUM(net_cost_brl) net_cost_brl, SUM(net_cost_usd) net_cost_usd
          FROM `{RPT}.rpt_cost_daily` WHERE {" AND ".join(where)} GROUP BY usage_date
        )
        SELECT usage_date, net_cost_brl, net_cost_usd,
          AVG(net_cost_brl) OVER (ORDER BY usage_date ROWS BETWEEN 6 PRECEDING AND CURRENT ROW) AS ma7_brl
        FROM d ORDER BY usage_date
    """, params)
    return [m.DailyPointDTO(usage_date=str(r["usage_date"]), net_cost_brl=r["net_cost_brl"],
                            net_cost_usd=r["net_cost_usd"] or 0.0, ma7_brl=r["ma7_brl"] or 0.0) for r in rows]


@router.get("/cost/series", response_model=list[m.CostSeriesPointDTO])
def cost_series(
    grain: str = "day",  # day | month
    group_by: str = "none",  # none | service | environment | app | project
    from_: DateStr | None = Query(default=None, alias="from"),
    to: DateStr | None = None,
    service: str | None = None,
    environment: str | None = None,
    app: str | None = None,
    project: str | None = None,
) -> list[m.CostSeriesPointDTO]:
    """Serie temporal em formato longo: barras por periodo, opcionalmente empilhadas.
    grain=day -> rpt_cost_daily; grain=month -> rpt_cost_monthly."""
    col = {
        "service": "service_description", "environment": "label_environment",
        "app": "label_app", "project": "project_name",
    }.get(group_by)
    if mock_active():
        pts = [p for p in fx.daily_points() if (not from_ or p["usage_date"] >= from_) and (not to or p["usage_date"] <= to)]
        if grain == "month":
            agg: dict[str, float] = {}
            for p in pts:
                agg[p["usage_date"][:7].replace("-", "")] = agg.get(p["usage_date"][:7].replace("-", ""), 0.0) + p["net_cost_brl"]
            base = [{"period": k, "v": v} for k, v in sorted(agg.items())]
        else:
            base = [{"period": p["usage_date"], "v": p["net_cost_brl"]} for p in pts]
        if not col:
            return [m.CostSeriesPointDTO(period=b["period"], key="total", net_cost_brl=b["v"]) for b in base]
        # mock: reparte cada periodo entre as chaves do fx.DIMENSIONS de forma estavel
        if col == "project_name":
            keys = [p["project_name"] for p in fx.DIMENSIONS["projects"]]
        else:
            keys = fx.DIMENSIONS[{"service_description": "services", "label_environment": "environments", "label_app": "apps"}[col]]
        w = [0.55, 0.30, 0.15] + [0.0] * len(keys)
        out = []
        for b in base:
            for i, k in enumerate(keys[:3]):
                out.append(m.CostSeriesPointDTO(period=b["period"], key=k, net_cost_brl=round(b["v"] * w[i], 4)))
        return out

    where, params = _scope(service, environment, app, project)
    if grain == "month":
        period_sql = "invoice_month"
        src = f"`{RPT}.rpt_cost_monthly`"
        win = ""
        if from_ and to:
            win = " AND invoice_month_date BETWEEN DATE_TRUNC(@from, MONTH) AND @to"
            params = {**params, "from": from_, "to": to}
    else:
        period_sql = "CAST(usage_date AS STRING)"
        src = f"`{RPT}.rpt_cost_daily`"
        win = " AND usage_date BETWEEN @from AND @to"
        params = {**params, "from": from_, "to": to}
    key_sql = f"IFNULL(NULLIF({col}, ''), '(sem label)')" if col else "'total'"
    rows = query(f"""
        SELECT {period_sql} period, {key_sql} key, SUM(net_cost_brl) net_cost_brl
        FROM {src} WHERE TRUE {where} {win}
        GROUP BY period, key ORDER BY period
    """, params)
    return [m.CostSeriesPointDTO(period=str(r["period"]), key=r["key"], net_cost_brl=r["net_cost_brl"]) for r in rows]


@router.get("/cost/by-service", response_model=list[m.ServiceCostDTO])
def cost_by_service(
    from_: DateStr = Query(alias="from"), to: DateStr = Query(...),
    environment: str | None = None, app: str | None = None, project: str | None = None,
) -> list[m.ServiceCostDTO]:
    if mock_active():
        total = sum(v for _, v in fx.SERVICES)
        return [m.ServiceCostDTO(service_description=s, net_cost_brl=v, pct_of_total=v / total)
                for s, v in fx.SERVICES]
    where, params = _scope(None, environment, app, project)
    rows = query(f"""
        SELECT service_description, SUM(net_cost_brl) net_cost_brl
        FROM `{RPT}.rpt_cost_daily` WHERE usage_date BETWEEN @from AND @to {where}
        GROUP BY service_description ORDER BY net_cost_brl DESC
    """, {**params, "from": from_, "to": to})
    total = sum(r["net_cost_brl"] for r in rows) or 1.0
    return [m.ServiceCostDTO(service_description=r["service_description"],
                             net_cost_brl=r["net_cost_brl"], pct_of_total=r["net_cost_brl"] / total)
            for r in rows]


@router.get("/cost/by-project", response_model=list[m.ProjectCostDTO])
def cost_by_project(
    from_: DateStr = Query(alias="from"), to: DateStr = Query(...),
    service: str | None = None, environment: str | None = None, app: str | None = None,
) -> list[m.ProjectCostDTO]:
    if mock_active():
        total = sum(v for _, v in fx.PROJECTS)
        return [m.ProjectCostDTO(project_id=pid, project_name=pid, net_cost_brl=v, pct_of_total=v / total)
                for pid, v in fx.PROJECTS]
    where, params = _scope(service, environment, app)
    rows = query(f"""
        SELECT project_id, ANY_VALUE(project_name) project_name, SUM(net_cost_brl) net_cost_brl
        FROM `{RPT}.rpt_cost_daily` WHERE usage_date BETWEEN @from AND @to {where}
        GROUP BY project_id ORDER BY net_cost_brl DESC
    """, {**params, "from": from_, "to": to})
    total = sum(r["net_cost_brl"] for r in rows) or 1.0
    return [m.ProjectCostDTO(project_id=r["project_id"], project_name=r["project_name"],
                             net_cost_brl=r["net_cost_brl"], pct_of_total=r["net_cost_brl"] / total)
            for r in rows]


@router.get("/cost/monthly", response_model=list[m.MonthlyServicePointDTO])
def cost_monthly(
    from_: DateStr | None = Query(default=None, alias="from"), to: DateStr | None = None,
    environment: str | None = None, app: str | None = None, project: str | None = None,
) -> list[m.MonthlyServicePointDTO]:
    if mock_active():
        out = []
        for ym, cr, bq, ot, *_ in fx.MONTHS:
            out += [m.MonthlyServicePointDTO(invoice_month=ym, service_description=s, net_cost_brl=v)
                    for s, v in (("Cloud Run", cr), ("BigQuery", bq), ("Outros", ot)) if v]
        return out
    where, params = _scope(None, environment, app, project)
    if from_ and to:
        where += " AND invoice_month_date BETWEEN DATE_TRUNC(@from, MONTH) AND @to"
        params = {**params, "from": from_, "to": to}
    rows = query(f"""
        SELECT invoice_month, service_description, SUM(net_cost_brl) net_cost_brl
        FROM `{RPT}.rpt_cost_monthly` WHERE TRUE {where} GROUP BY 1,2 ORDER BY 1,3 DESC
    """, params)
    return [m.MonthlyServicePointDTO(**r) for r in rows]


@router.get("/reconciliation", response_model=list[m.ReconRowDTO])
def reconciliation(
    service: str | None = None,
    environment: str | None = None,
    app: str | None = None,
    project: str | None = None,
) -> list[m.ReconRowDTO]:
    if mock_active():
        return [m.ReconRowDTO(invoice_month=ym, gross_cost_brl=g, credits_total_brl=cr,
                              net_cost_brl=n, matches_invoice=True)
                for ym, _, _, _, g, cr, n in fx.MONTHS]
    where, params = _scope(service, environment, app, project)
    rows = query(f"""
        SELECT invoice_month, SUM(gross_cost_brl) gross_cost_brl,
               SUM(credits_total_brl) credits_total_brl, SUM(net_cost_brl) net_cost_brl
        FROM `{RPT}.rpt_cost_monthly` WHERE TRUE {where} GROUP BY 1 ORDER BY 1
    """, params)
    return [m.ReconRowDTO(**r, matches_invoice=True) for r in rows]


# ---------------------------------------------------------------- budget & forecast

@router.get("/budget", response_model=m.BudgetDTO)
def budget(
    service: str | None = None,
    environment: str | None = None,
    app: str | None = None,
    project: str | None = None,
) -> m.BudgetDTO:
    sc = scorecard(service, environment, app, project)
    bud = _effective_budget_brl(project)
    thresholds = [m.ThresholdDTO(pct=p, value_brl=bud * p) for p in S.budget_thresholds]
    breach: str | None = None
    # rpt_budget_daily não tem project_id (é só conta inteira) -- comparar a
    # curva dela contra o budget de 1 projeto não faz sentido, então pula.
    if mock_active() or project:
        rows = []
    else:
        rows = query(f"SELECT usage_date, net_cost_cum_brl FROM `{RPT}.rpt_budget_daily` ORDER BY usage_date")
        for r in rows:
            if r["net_cost_cum_brl"] and r["net_cost_cum_brl"] >= bud:
                breach = str(r["usage_date"])
                break
    return m.BudgetDTO(
        budget_brl=bud,
        net_cost_mtd_brl=sc.net_cost_mtd_brl,
        run_rate_eom_brl=sc.run_rate_eom_brl,
        budget_used_pct=sc.budget_used_pct,
        run_rate_vs_budget_pct=sc.run_rate_vs_budget_pct,
        headroom_brl=bud - sc.run_rate_eom_brl,
        projected_breach_date=breach,
        thresholds=thresholds,
    )


@router.get("/budget/burndown", response_model=list[m.BurndownPointDTO])
def burndown(month: str | None = None) -> list[m.BurndownPointDTO]:
    if mock_active():
        cum, out = 0.0, []
        for p in fx.daily_points():
            if not p["usage_date"].startswith("2026-09"):
                continue
            cum += p["net_cost_brl"]
            out.append(m.BurndownPointDTO(usage_date=p["usage_date"], net_cost_cum_brl=cum,
                                          budget_brl=20.0, is_realized=True))
        return out
    rows = query(f"""
        SELECT usage_date, net_cost_cum_brl, budget_brl, is_realized
        FROM `{RPT}.rpt_budget_daily` ORDER BY usage_date
    """)
    # sobrescreve com o valor vivo (conta inteira, essa view não tem project_id) --
    # senão /budget e /budget/burndown mostram números diferentes logo depois
    # de uma edição no ADM (a view ainda traz a constante velha do Dataform).
    bud = _effective_budget_brl(None)
    return [m.BurndownPointDTO(usage_date=str(r["usage_date"]), net_cost_cum_brl=r["net_cost_cum_brl"],
                               budget_brl=bud, is_realized=bool(r["is_realized"])) for r in rows]


@router.get("/forecast", response_model=list[m.ForecastMonthDTO])
def forecast(
    horizon: int = 3,
    service: str | None = None,
    environment: str | None = None,
    app: str | None = None,
    project: str | None = None,
) -> list[m.ForecastMonthDTO]:
    # rpt_forecast_monthly nao tem grao de serviço/label/projeto — a previsao fica conta-inteira
    # por ora (os params sao aceitos para uniformidade da FilterBar). Ver specs/004.
    _ = (service, environment, app, project)
    if mock_active():
        return [
            m.ForecastMonthDTO(invoice_month="202608", is_actual=True, value_brl=23.65,
                               forecast_lo_brl=None, forecast_hi_brl=None),
            m.ForecastMonthDTO(invoice_month="202609", is_actual=True, value_brl=2.19,
                               forecast_lo_brl=None, forecast_hi_brl=None),
            m.ForecastMonthDTO(invoice_month="202610", is_actual=False, value_brl=9.0,
                               forecast_lo_brl=5.0, forecast_hi_brl=16.0),
            m.ForecastMonthDTO(invoice_month="202611", is_actual=False, value_brl=10.0,
                               forecast_lo_brl=5.0, forecast_hi_brl=20.0),
            m.ForecastMonthDTO(invoice_month="202612", is_actual=False, value_brl=11.0,
                               forecast_lo_brl=6.0, forecast_hi_brl=22.0),
        ]
    rows = query(f"SELECT invoice_month, is_actual, value_brl, forecast_lo_brl, forecast_hi_brl "
                 f"FROM `{RPT}.rpt_forecast_monthly` ORDER BY month_date")
    return [m.ForecastMonthDTO(**r) for r in rows]


# ---------------------------------------------------------------- allocation

@router.get("/allocation/coverage", response_model=list[m.LabelCoverageDTO])
def alloc_coverage(months: int = 3, project: str | None = None) -> list[m.LabelCoverageDTO]:
    """`rpt_label_coverage` tem grao invoice_month x project_id — sem `project`, agrega
    (soma os numeradores/denominador) de volta pra conta inteira em vez de devolver
    uma linha arbitraria por projeto."""
    if mock_active():
        return [m.LabelCoverageDTO(**c) for c in fx.COVERAGE]
    where, params = ("", {})
    if project:
        where, params = " AND project_id = @project", {"project": project}
    rows = query(f"""
        SELECT invoice_month,
               SAFE_DIVIDE(SUM(net_cost_with_app_brl), SUM(net_cost_total_brl)) pct_app,
               SAFE_DIVIDE(SUM(net_cost_with_environment_brl), SUM(net_cost_total_brl)) pct_environment,
               SAFE_DIVIDE(SUM(net_cost_with_managed_by_brl), SUM(net_cost_total_brl)) pct_managed_by,
               SUM(net_cost_total_brl) net_cost_total_brl
        FROM `{RPT}.rpt_label_coverage` WHERE TRUE {where}
        GROUP BY invoice_month ORDER BY invoice_month DESC LIMIT @months
    """, {**params, "months": months})
    return [m.LabelCoverageDTO(**r) for r in rows]


@router.get("/allocation/coverage/weekly", response_model=list[m.CoverageWeekDTO])
def alloc_coverage_weekly(
    from_: DateStr | None = Query(default=None, alias="from"), to: DateStr | None = None,
    project: str | None = None,
) -> list[m.CoverageWeekDTO]:
    """`rpt_label_coverage_weekly` tem grao week_start x project_id e so expoe as fracoes
    (nao os numeradores) — reconstroi o numerador como pct * net_cost_week_brl (exato, ja
    que foi assim que a view calculou o pct) pra poder agregar entre projetos sem `project`."""
    if mock_active():
        return [m.CoverageWeekDTO(**w) for w in fx.COVERAGE_WEEKLY]
    where, params = ("", {})
    if project:
        where, params = " AND project_id = @project", {"project": project}
    rows = query(f"""
        SELECT CAST(week_start AS STRING) week_start,
               SAFE_DIVIDE(SUM(pct_app * net_cost_week_brl), SUM(net_cost_week_brl)) pct_app,
               SAFE_DIVIDE(SUM(pct_environment * net_cost_week_brl), SUM(net_cost_week_brl)) pct_environment,
               SAFE_DIVIDE(SUM(pct_managed_by * net_cost_week_brl), SUM(net_cost_week_brl)) pct_managed_by
        FROM `{RPT}.rpt_label_coverage_weekly` WHERE TRUE {where}
        GROUP BY week_start ORDER BY week_start
    """, params)
    # SAFE_DIVIDE por SUM(net_cost_week_brl) vira NULL numa semana com custo líquido somando
    # 0 — CoverageWeekDTO exige float, não Optional; 0.0 é a leitura certa (sem custo na
    # semana, cobertura sem sentido, mas não pode quebrar o Pydantic).
    for r in rows:
        for k in ("pct_app", "pct_environment", "pct_managed_by"):
            r[k] = r.get(k) or 0.0
    return [m.CoverageWeekDTO(**r) for r in rows]


@router.get("/allocation/coverage/by-component", response_model=list[m.ComponentLabelCoverageDTO])
def alloc_coverage_by_component() -> list[m.ComponentLabelCoverageDTO]:
    """Cobertura por RECURSO (não por custo) — só componentes onde label é aplicável de
    verdade (Cloud Run, Secret Manager; BigQuery fica de fora — ver includes/constants.js).
    "(geral)" é a agregação, conta inteira. Independe do que rodou/custou cada recurso.
    TODO: aceitar `project` (view hoje agrega a conta inteira)."""
    if mock_active():
        return [m.ComponentLabelCoverageDTO(**c) for c in fx.COVERAGE_BY_COMPONENT]
    rows = query(f"""
        SELECT service_description, resources_total, pct_app, pct_environment, pct_managed_by
        FROM `{RPT}.rpt_label_coverage_by_component`
        ORDER BY service_description = '(geral)' DESC, service_description
    """)
    return [m.ComponentLabelCoverageDTO(**r) for r in rows]


@router.get("/allocation/coverage/unlabeled-resources", response_model=list[m.UnlabeledResourceDTO])
def alloc_unlabeled_resources() -> list[m.UnlabeledResourceDTO]:
    """Detalhamento acionável do endpoint acima: 1 linha por recurso com >=1 label faltando,
    ordenado por custo — pra aplicar o label na origem (Terraform/gcloud), não no billing."""
    if mock_active():
        return [m.UnlabeledResourceDTO(**r) for r in fx.UNLABELED_RESOURCES]
    rows = query(f"""
        SELECT service_description, resource_name, missing_app, missing_environment,
               missing_managed_by, net_cost_brl
        FROM `{RPT}.rpt_unlabeled_resources`
        ORDER BY net_cost_brl DESC
    """)
    return [m.UnlabeledResourceDTO(**r) for r in rows]


@router.get("/allocation/by-app", response_model=m.AppAllocationDTO)
def alloc_by_app(
    from_: DateStr = Query(alias="from"), to: DateStr = Query(...),
    service: str | None = None, environment: str | None = None, project: str | None = None,
) -> m.AppAllocationDTO:
    if mock_active():
        return m.AppAllocationDTO(**fx.ALLOC_BY_APP)
    # Lê direto de fct_billing_cost_daily (grão diário) em vez de rpt_showback_monthly (grão
    # mensal) — só assim dá pra respeitar o Período (from/to) e o recorte (Serviço/Ambiente/
    # Projeto) do FilterBar. Agrupa por label_app_reconciled (label nativo quando existe,
    # senão reconciliado por nome de recurso/job — Cloud Run, Secret Manager, BigQuery; ver
    # includes/constants.js), não pelo label_app cru — senão os recursos recém-reconciliados
    # (que não têm label_environment nativo) sumiriam ao filtrar por Ambiente. Filtro de
    # ambiente aqui usa label_environment_reconciled pelo mesmo motivo; project continua raw
    # (project_id não muda com a reconciliação).
    where = ["usage_date BETWEEN @from AND @to"]
    params: dict = {"from": from_, "to": to}
    if service:
        where.append("service_description = @service_description")
        params["service_description"] = service
    if environment:
        where.append("label_environment_reconciled = @label_environment_reconciled")
        params["label_environment_reconciled"] = environment
    if project:
        where.append("project_id = @project_id")
        params["project_id"] = project
    where_sql = " AND ".join(where)
    rows = query(f"""
        SELECT label_app_reconciled AS label_app, SUM(net_cost_brl) net_cost_brl
        FROM `{MART}.fct_billing_cost_daily`
        WHERE {where_sql}
        GROUP BY label_app_reconciled HAVING label_app_reconciled IS NOT NULL ORDER BY net_cost_brl DESC
    """, params)
    totals = query(f"""
        SELECT
          SUM(IF(label_app_reconciled IS NULL, net_cost_brl, 0)) un,
          SUM(net_cost_brl) tot
        FROM `{MART}.fct_billing_cost_daily`
        WHERE {where_sql}
    """, params)
    un = totals[0]["un"] if totals and totals[0]["un"] is not None else 0.0
    tot = totals[0]["tot"] if totals and totals[0]["tot"] is not None else 0.0
    return m.AppAllocationDTO(
        rows=[m.AppRowDTO(label_app=r["label_app"], net_cost_brl=r["net_cost_brl"]) for r in rows],
        unallocated_net_cost_brl=un, unallocated_pct=(un / tot if tot else 0.0), net_cost_total_brl=tot,
    )


@router.get("/allocation/by-env", response_model=m.EnvAllocationDTO)
def alloc_by_env(
    from_: DateStr = Query(alias="from"), to: DateStr = Query(...),
    service: str | None = None, app: str | None = None, project: str | None = None,
) -> m.EnvAllocationDTO:
    if mock_active():
        rows = [m.EnvCostDTO(**e) for e in fx.ALLOC_BY_ENV]
        un = float(fx.ALLOC_BY_APP["unallocated_net_cost_brl"])
        tot = sum(r.net_cost_brl for r in rows) + un
        return m.EnvAllocationDTO(rows=rows, unallocated_net_cost_brl=un, unallocated_pct=un / tot if tot else 0.0, net_cost_total_brl=tot)
    # ver comentário equivalente em alloc_by_app — mesmo motivo pra ler fct_billing_cost_daily
    # direto em vez de rpt_showback_monthly, e pra agrupar/filtrar pelas colunas reconciliadas.
    where = ["usage_date BETWEEN @from AND @to"]
    params: dict = {"from": from_, "to": to}
    if service:
        where.append("service_description = @service_description")
        params["service_description"] = service
    if app:
        where.append("label_app_reconciled = @label_app_reconciled")
        params["label_app_reconciled"] = app
    if project:
        where.append("project_id = @project_id")
        params["project_id"] = project
    where_sql = " AND ".join(where)
    rows_raw = query(f"""
        SELECT label_environment_reconciled AS label_environment, SUM(net_cost_brl) net_cost_brl
        FROM `{MART}.fct_billing_cost_daily`
        WHERE {where_sql}
        GROUP BY label_environment_reconciled HAVING label_environment_reconciled IS NOT NULL ORDER BY net_cost_brl DESC
    """, params)
    totals = query(f"""
        SELECT
          SUM(IF(label_environment_reconciled IS NULL, net_cost_brl, 0)) un,
          SUM(net_cost_brl) tot
        FROM `{MART}.fct_billing_cost_daily`
        WHERE {where_sql}
    """, params)
    un = totals[0]["un"] if totals and totals[0]["un"] is not None else 0.0
    tot = totals[0]["tot"] if totals and totals[0]["tot"] is not None else 0.0
    return m.EnvAllocationDTO(
        rows=[m.EnvCostDTO(label_environment=r["label_environment"], net_cost_brl=r["net_cost_brl"]) for r in rows_raw],
        unallocated_net_cost_brl=un,
        unallocated_pct=(un / tot if tot else 0.0),
        net_cost_total_brl=tot,
    )


@router.get("/allocation/chargeback-readiness", response_model=m.ChargebackReadinessDTO)
def chargeback_readiness() -> m.ChargebackReadinessDTO:
    if mock_active():
        return m.ChargebackReadinessDTO(**fx.CHARGEBACK)
    # rpt_label_coverage tem grao invoice_month x project_id — agrega de volta pra conta
    # inteira antes de pegar o mes mais recente (senao "LIMIT 1" pegaria so um projeto).
    cov = query(f"""
        SELECT SAFE_DIVIDE(SUM(net_cost_with_app_brl), SUM(net_cost_total_brl)) pct_app
        FROM `{RPT}.rpt_label_coverage`
        WHERE invoice_month = (SELECT MAX(invoice_month) FROM `{RPT}.rpt_label_coverage`)
    """)
    pct = cov[0]["pct_app"] if cov else 0.0
    return m.ChargebackReadinessDTO(
        coverage_pct=pct, ready=pct >= 0.80,
        criteria=[m.CriterionDTO(**c) for c in fx.CHARGEBACK["criteria"]],
    )


# ---------------------------------------------------------------- services & skus

@router.get("/cost/by-sku", response_model=list[m.SkuCostDTO])
def cost_by_sku(
    from_: DateStr = Query(alias="from"), to: DateStr = Query(...),
    service: str | None = None, environment: str | None = None, app: str | None = None,
    project: str | None = None,
) -> list[m.SkuCostDTO]:
    if mock_active():
        return [m.SkuCostDTO(service_description=s, sku_description=k, pricing_unit=u,
                             net_cost_brl=c, usage_qty=q, unit_cost_brl=uc)
                for s, k, u, c, q, uc in fx.SKU_COST
                if not service or s == service]
    scope_where, params = _scope(service, environment, app, project)
    where = ["usage_date BETWEEN @from AND @to"]
    params = {**params, "from": from_, "to": to}
    rows = query(f"""
        SELECT service_description, sku_description, ANY_VALUE(pricing_unit) pricing_unit,
               SUM(net_cost_brl) net_cost_brl, SUM(usage_amount_pricing_units) usage_qty,
               SAFE_DIVIDE(SUM(net_cost_brl), NULLIF(SUM(usage_amount_pricing_units),0)) unit_cost_brl
        FROM `{RPT}.rpt_cost_daily` WHERE {" AND ".join(where)} {scope_where}
        GROUP BY 1,2 ORDER BY net_cost_brl DESC
    """, params)
    # SAFE_DIVIDE por uso somando 0 (SKU com custo mas sem unidade de uso registrada, ex.
    # linha de ajuste/credito) vira NULL — SkuCostDTO exige float, não Optional.
    for r in rows:
        r["unit_cost_brl"] = r.get("unit_cost_brl") or 0.0
    return [m.SkuCostDTO(**r) for r in rows]


@router.get("/sku/new", response_model=list[m.NewSkuDTO])
def sku_new() -> list[m.NewSkuDTO]:
    if mock_active():
        return [m.NewSkuDTO(**s) for s in fx.NEW_SKUS]
    rows = query(f"""
        SELECT service_description, sku_description, CAST(first_seen_date AS STRING) first_seen_date
        FROM `{RPT}.rpt_service_sku` WHERE is_new_30d ORDER BY first_seen_date DESC
    """)
    return [m.NewSkuDTO(**r) for r in rows]


# ---------------------------------------------------------------- optimization

@router.get("/optimization/commitment-coverage", response_model=m.CommitmentCoverageDTO)
def commitment_coverage() -> m.CommitmentCoverageDTO:
    if mock_active():
        return m.CommitmentCoverageDTO(**fx.COMMITMENT)
    r = query(f"SELECT * FROM `{RPT}.rpt_commitment_coverage`")[0]
    return m.CommitmentCoverageDTO(**r)


@router.get("/optimization/recommendations", response_model=m.RecommendationsDTO)
def recommendations() -> m.RecommendationsDTO:
    path = Path(__file__).resolve().parents[2] / "recommendations.yaml"
    items = yaml.safe_load(path.read_text(encoding="utf-8")) if path.exists() else []
    recs = [m.RecommendationDTO(**it) for it in items]
    return m.RecommendationsDTO(
        items=recs,
        potential_savings_min_brl=sum(r.savings_min_brl for r in recs),
        potential_savings_max_brl=sum(r.savings_max_brl for r in recs),
    )


# ---------------------------------------------------------------- unit economics

@router.get("/unit-economics", response_model=m.UnitEconomicsDTO)
def unit_economics() -> m.UnitEconomicsDTO:
    if mock_active():
        return m.UnitEconomicsDTO(**fx.UNIT_ECON)
    r = query(f"SELECT * FROM `{RPT}.rpt_unit_economics`")[0]
    # SAFE_DIVIDE(x, NULLIF(units, 0)) na view vira NULL sem uso de CPU/memória/log/request
    # nos últimos 30 dias — UnitEconomicsDTO exige os 3 campos, não Optional.
    for k in ("cost_per_gib_log_brl", "cost_per_vcpu_s_brl", "cost_per_gib_s_brl"):
        r[k] = r.get(k) or 0.0
    r["cpu_mem_ratio"] = r.get("cpu_mem_ratio") or "—"
    return m.UnitEconomicsDTO(**r)


@router.get("/unit-economics/series", response_model=list[m.UnitSeriesPointDTO])
def unit_economics_series(
    metric: str = "cost_per_1k_req", from_: DateStr = Query(alias="from"), to: DateStr = Query(...),
) -> list[m.UnitSeriesPointDTO]:
    if mock_active():
        return [m.UnitSeriesPointDTO(usage_date=p["usage_date"], value_brl=0.0006)
                for p in fx.daily_points() if from_ <= p["usage_date"] <= to][-10:]
    rows = query(f"""
        SELECT usage_date,
          SAFE_DIVIDE(SUM(IF(sku_description='Requests', net_cost_brl, 0)),
                      NULLIF(SUM(IF(sku_description='Requests', usage_amount_pricing_units, 0)),0)) * 1000 AS value_brl
        FROM `{RPT}.rpt_cost_daily` WHERE usage_date BETWEEN @from AND @to
        GROUP BY usage_date ORDER BY usage_date
    """, {"from": from_, "to": to})
    return [m.UnitSeriesPointDTO(usage_date=str(r["usage_date"]), value_brl=r["value_brl"] or 0.0) for r in rows]


@router.get("/efficiency/waterfall", response_model=list[m.WaterfallStepDTO])
def efficiency_waterfall(period: str | None = None) -> list[m.WaterfallStepDTO]:
    """Devolve os degraus (start/decrease/end) + a linha meta '_cost_avoided_brl' (desconto
    negociado + créditos, já calculada em rpt_savings_waterfall) — só '_effective_savings_pct'
    fica de fora. O front usa '_cost_avoided_brl' pro card "Custo evitado" e descarta o resto
    de kind=meta antes de desenhar o waterfall (ver Waterfall.tsx/shape())."""
    if mock_active():
        return [m.WaterfallStepDTO(**s) for s in fx.WATERFALL]
    rows = query(f"SELECT step label, kind, value_brl FROM `{RPT}.rpt_savings_waterfall` "
                 f"WHERE kind != 'meta' OR step = '_cost_avoided_brl' ORDER BY ord")
    return [m.WaterfallStepDTO(label=r["label"], value_brl=r["value_brl"], kind=r["kind"]) for r in rows]


# ---------------------------------------------------------------- anomalies

@router.get("/anomalies", response_model=list[m.AnomalyRowDTO])
def anomalies(
    from_: DateStr | None = Query(default=None, alias="from"), to: DateStr | None = None,
    project: str | None = None,
) -> list[m.AnomalyRowDTO]:
    if mock_active():
        return [m.AnomalyRowDTO(**a) for a in fx.ANOMALIES]
    where, params = ("", {})
    if project:
        where, params = " AND project_id = @project", {"project": project}
    rows = query(f"""
        SELECT CAST(usage_date AS STRING) usage_date, project_id, project_name, service_description,
               net_cost_day_brl AS net_cost_brl, avg_28d_brl, z_score,
               deviation_abs_brl, deviation_pct
        FROM `{RPT}.rpt_anomaly_daily` WHERE is_anomaly {where}
        ORDER BY usage_date DESC
    """, params)
    return [m.AnomalyRowDTO(**r) for r in rows]
