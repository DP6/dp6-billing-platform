// Espelho dos DTOs de apps/api/src/billing_api/models.py (specs/003).
// TODO Fase 7: gerar do OpenAPI (`/openapi.json`) em vez de manter a mão.

export interface Meta {
  data_updated_at: string;
  source_rows: number;
  invoice_months: string[];
  export_ok: boolean;
}
export interface Dimensions {
  services: string[];
  environments: string[];
  apps: string[];
  invoice_months: string[];
  data_updated_at: string;
  currency_rate: number;
  export_ok: boolean;
  source_rows: number;
}
export interface Scorecard {
  invoice_month: string;
  net_cost_mtd_brl: number;
  net_cost_mtd_usd: number;
  gross_cost_mtd_brl: number;
  credits_mtd_brl: number;
  prev_month_net_brl: number;
  mom_pct: number;
  run_rate_eom_brl: number;
  days_elapsed: number;
  days_in_month: number;
  budget_brl: number;
  budget_used_pct: number;
  run_rate_vs_budget_pct: number;
  effective_savings_pct: number;
}
export interface DailyPoint {
  usage_date: string;
  net_cost_brl: number;
  net_cost_usd: number;
  ma7_brl: number;
}
export interface CostSeriesPoint {
  period: string; // usage_date (dia) ou invoice_month (mês)
  key: string; // valor do group_by, ou "total"
  net_cost_brl: number;
}
export interface ServiceCost {
  service_description: string;
  net_cost_brl: number;
  pct_of_total: number;
}
export interface MonthlyServicePoint {
  invoice_month: string;
  service_description: string;
  net_cost_brl: number;
}
export interface ReconRow {
  invoice_month: string;
  gross_cost_brl: number;
  credits_total_brl: number;
  net_cost_brl: number;
  matches_invoice: boolean;
}
export interface Threshold {
  pct: number;
  value_brl: number;
}
export interface Budget {
  budget_brl: number;
  net_cost_mtd_brl: number;
  run_rate_eom_brl: number;
  budget_used_pct: number;
  run_rate_vs_budget_pct: number;
  headroom_brl: number;
  projected_breach_date: string | null;
  thresholds: Threshold[];
}
export interface BurndownPoint {
  usage_date: string;
  net_cost_cum_brl: number;
  budget_brl: number;
  is_realized: boolean;
}
export interface ForecastMonth {
  invoice_month: string;
  is_actual: boolean;
  value_brl: number;
  forecast_lo_brl: number | null;
  forecast_hi_brl: number | null;
}
export interface LabelCoverage {
  invoice_month: string;
  pct_app: number;
  pct_environment: number;
  pct_managed_by: number;
  net_cost_total_brl: number;
}
export interface CoverageWeek {
  week_start: string;
  pct_app: number;
  pct_environment: number;
  pct_managed_by: number;
}
export interface AppAllocation {
  rows: { label_app: string; net_cost_brl: number }[];
  unallocated_net_cost_brl: number;
  unallocated_pct: number;
}
export interface EnvCost {
  label_environment: string;
  net_cost_brl: number;
}
export interface EnvAllocation {
  rows: EnvCost[];
  unallocated_net_cost_brl: number;
  unallocated_pct: number;
}
export interface ChargebackReadiness {
  coverage_pct: number;
  ready: boolean;
  criteria: { key: string; label: string; status: "ok" | "partial" | "missing" }[];
}
export interface SkuCost {
  service_description: string;
  sku_description: string;
  pricing_unit: string;
  net_cost_brl: number;
  usage_qty: number;
  unit_cost_brl: number;
}
export interface NewSku {
  service_description: string;
  sku_description: string;
  first_seen_date: string;
}
export interface CommitmentCoverage {
  covered_pct: number;
  eligible_spend_brl: number;
  on_demand_spend_brl: number;
  cud_reeval_threshold_brl: number;
}
export interface Recommendation {
  title: string;
  evidence: string;
  savings_min_brl: number;
  savings_max_brl: number;
  effort: string;
  status: string;
}
export interface Recommendations {
  items: Recommendation[];
  potential_savings_min_brl: number;
  potential_savings_max_brl: number;
}
export interface UnitEconomics {
  cost_per_deploy_brl: number;
  deploy_count: number;
  cost_per_1k_req_brl: number;
  cost_per_gib_log_brl: number;
  cost_per_day_avg_30d_brl: number;
  cost_per_vcpu_s_brl: number;
  cost_per_gib_s_brl: number;
  cpu_mem_ratio: string;
}
export interface UnitSeriesPoint {
  usage_date: string;
  value_brl: number;
}
export interface WaterfallStep {
  label: string;
  value_brl: number;
  kind: "start" | "decrease" | "end";
}
export interface AnomalyRow {
  usage_date: string;
  service_description: string;
  net_cost_brl: number;
  avg_28d_brl: number;
  z_score: number;
  deviation_abs_brl: number;
  deviation_pct: number;
}
