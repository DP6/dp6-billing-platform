"""DTOs — espelham specs/003 §Schemas e docs/data-contract.md."""

from __future__ import annotations

from pydantic import BaseModel


class MetaDTO(BaseModel):
    data_updated_at: str
    source_rows: int
    invoice_months: list[str]
    export_ok: bool


class ProjectDTO(BaseModel):
    project_id: str
    project_name: str


class DimensionsDTO(BaseModel):
    services: list[str]
    environments: list[str]
    apps: list[str]
    projects: list[ProjectDTO]
    invoice_months: list[str]
    data_updated_at: str
    export_ok: bool
    source_rows: int


class ScorecardDTO(BaseModel):
    invoice_month: str
    net_cost_mtd_brl: float
    net_cost_mtd_usd: float
    gross_cost_mtd_brl: float
    credits_mtd_brl: float
    prev_month_net_brl: float
    mom_pct: float
    run_rate_eom_brl: float
    days_elapsed: int
    days_in_month: int
    budget_brl: float | None  # None = sem orçamento cadastrado na aba ADM pra esse escopo
    budget_used_pct: float
    run_rate_vs_budget_pct: float
    effective_savings_pct: float


class DailyPointDTO(BaseModel):
    usage_date: str
    net_cost_brl: float
    net_cost_usd: float
    ma7_brl: float


class CostSeriesPointDTO(BaseModel):
    """Série temporal em formato longo. `period` = usage_date (dia) ou invoice_month (mês);
    `key` = valor do group_by, ou "total" quando group_by=none."""

    period: str
    key: str
    net_cost_brl: float


class ServiceCostDTO(BaseModel):
    service_description: str
    net_cost_brl: float
    pct_of_total: float


class ProjectCostDTO(BaseModel):
    project_id: str
    project_name: str
    net_cost_brl: float
    pct_of_total: float


class MonthlyServicePointDTO(BaseModel):
    invoice_month: str
    service_description: str
    net_cost_brl: float


class ReconRowDTO(BaseModel):
    invoice_month: str
    gross_cost_brl: float
    credits_total_brl: float
    net_cost_brl: float
    matches_invoice: bool


class ThresholdDTO(BaseModel):
    pct: float
    value_brl: float


class BudgetDTO(BaseModel):
    budget_brl: float | None  # None = sem orçamento cadastrado na aba ADM pra esse escopo
    net_cost_mtd_brl: float
    run_rate_eom_brl: float
    budget_used_pct: float
    run_rate_vs_budget_pct: float
    headroom_brl: float | None
    projected_breach_date: str | None
    thresholds: list[ThresholdDTO]


class BurndownPointDTO(BaseModel):
    usage_date: str
    net_cost_cum_brl: float
    budget_brl: float | None
    is_realized: bool


class ForecastMonthDTO(BaseModel):
    invoice_month: str
    is_actual: bool
    value_brl: float
    forecast_lo_brl: float | None
    forecast_hi_brl: float | None


class LabelCoverageDTO(BaseModel):
    invoice_month: str
    pct_app: float
    pct_environment: float
    pct_managed_by: float
    net_cost_total_brl: float


class CoverageWeekDTO(BaseModel):
    week_start: str
    pct_app: float
    pct_environment: float
    pct_managed_by: float


class ComponentLabelCoverageDTO(BaseModel):
    """Cobertura por componente (Cloud Run, Secret Manager, ...) — % de RECURSOS distintos
    com cada label aplicado no export, independente de custo/volume. "(geral)" é a agregação
    de todos os componentes aplicáveis (rpt_label_coverage_by_component)."""
    service_description: str
    resources_total: int
    pct_app: float
    pct_environment: float
    pct_managed_by: float


class UnlabeledResourceDTO(BaseModel):
    """1 linha por recurso com pelo menos 1 label faltando (rpt_unlabeled_resources) —
    detalhamento acionável pro time de plataforma ir aplicar o label na origem."""
    service_description: str
    resource_name: str
    missing_app: bool
    missing_environment: bool
    missing_managed_by: bool
    net_cost_brl: float


class AppRowDTO(BaseModel):
    label_app: str
    net_cost_brl: float


class AppAllocationDTO(BaseModel):
    rows: list[AppRowDTO]
    unallocated_net_cost_brl: float
    unallocated_pct: float
    net_cost_total_brl: float


class EnvCostDTO(BaseModel):
    label_environment: str
    net_cost_brl: float


class EnvAllocationDTO(BaseModel):
    rows: list[EnvCostDTO]
    unallocated_net_cost_brl: float
    unallocated_pct: float
    net_cost_total_brl: float


class CriterionDTO(BaseModel):
    key: str
    label: str
    status: str  # ok | partial | missing


class ChargebackReadinessDTO(BaseModel):
    coverage_pct: float
    ready: bool
    criteria: list[CriterionDTO]


class SkuCostDTO(BaseModel):
    service_description: str
    sku_description: str
    pricing_unit: str
    net_cost_brl: float
    usage_qty: float
    unit_cost_brl: float


class NewSkuDTO(BaseModel):
    service_description: str
    sku_description: str
    first_seen_date: str


class CommitmentCoverageDTO(BaseModel):
    covered_pct: float
    eligible_spend_brl: float
    on_demand_spend_brl: float
    cud_reeval_threshold_brl: float


class RecommendationDTO(BaseModel):
    title: str
    evidence: str
    savings_min_brl: float
    savings_max_brl: float
    effort: str  # baixo | médio | alto
    status: str  # aberta | em andamento | fechada


class RecommendationsDTO(BaseModel):
    items: list[RecommendationDTO]
    potential_savings_min_brl: float
    potential_savings_max_brl: float


class UnitEconomicsDTO(BaseModel):
    cost_per_deploy_brl: float
    deploy_count: int
    cost_per_1k_req_brl: float
    cost_per_gib_log_brl: float
    cost_per_day_avg_30d_brl: float
    cost_per_vcpu_s_brl: float
    cost_per_gib_s_brl: float
    cpu_mem_ratio: str


class UnitSeriesPointDTO(BaseModel):
    usage_date: str
    value_brl: float


class WaterfallStepDTO(BaseModel):
    label: str
    value_brl: float
    kind: str  # start | decrease | end


class MeDTO(BaseModel):
    """Identidade do caller (via IAP) + se pertence ao grupo ADM. So isso decide
    se a aba ADM aparece no front -- a garantia de verdade é o require_admin()
    de cada endpoint /adm/*, nunca esconder a aba sozinho."""
    email: str
    is_admin: bool


class BudgetConfigDTO(BaseModel):
    """1 linha de budgets/{scope} no Firestore. scope = project_id, ou o
    sentinel "_account" pro orcamento da conta inteira. report_enabled
    controla só o disparo AUTOMATICO de segunda -- "enviar agora" (manual)
    ignora essa flag de proposito, é sempre um disparo explícito."""
    scope: str
    project_name: str | None = None
    budget_brl: float
    emails: list[str]
    report_enabled: bool = False
    updated_at: str | None = None
    updated_by: str | None = None


class BudgetConfigUpsertDTO(BaseModel):
    budget_brl: float
    emails: list[str]
    # None = não mexe no toggle atual (o form de orçamento não reenvia isso de
    # propósito -- só a tabela do relatório semanal, via PUT .../report-enabled,
    # muda esse campo). set(merge=True) do Firestore SOBRESCREVE campo listado,
    # então não dá pra mandar sempre False aqui sem resetar o toggle a cada edit.
    report_enabled: bool | None = None


class ReportEnabledUpdateDTO(BaseModel):
    enabled: bool


class WeeklyReportConfigDTO(BaseModel):
    """Bookkeeping GLOBAL do disparo automático (não tem mais toggle aqui --
    o toggle é por budget, ver BudgetConfigDTO.report_enabled)."""
    last_run_at: str | None = None
    last_run_status: str | None = None


class SendNowRequestDTO(BaseModel):
    scope: str | None = None  # None = todos os budgets com e-mail cadastrado


class SendNowResultDTO(BaseModel):
    dry_run: bool
    scopes_sent: list[str]
    scopes_failed: list[str]
    previews: dict[str, str] = {}  # scope -> HTML, sempre preenchido (não só dry-run)


class AnomalyRowDTO(BaseModel):
    usage_date: str
    project_id: str
    project_name: str
    service_description: str
    net_cost_brl: float
    avg_28d_brl: float
    z_score: float
    deviation_abs_brl: float
    deviation_pct: float
