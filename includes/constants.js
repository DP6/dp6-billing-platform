// Constantes e helpers compartilhados. Ver specs/001 (deltas da Fase 2) e docs/data-contract.md.

const V = dataform.projectConfig.vars;

// --- parâmetros travados (validation/RESULTADOS.md) ---
const LOOKBACK_DAYS = Number(V.lookback_days || 45);
const FRESHNESS_HOURS = Number(V.freshness_threshold_hours || 36);
const TIMEZONE = V.timezone || "America/Sao_Paulo";
const LABEL_KEYS = (V.label_keys || "environment,app,managed-by").split(",").map((s) => s.trim());

// --- constantes de negócio ---
// TODO(dp6-billing-platform): valores abaixo foram herdados do polaris-cost-model
// (escala de 1 projeto/voucher) e quase certamente não fazem sentido pra conta inteira.
// Refazer a validação (Fase 1 do plano) antes de travar estes números.
const ANOMALY_Z = 3;              // z-score mínimo para sinalizar
const ANOMALY_MIN_BRL = 1.0;      // piso absoluto (senão vira ruído a R$ 26/mês) — reavaliar na escala da conta
const MONTHLY_BUDGET_BRL = 20;    // era o budget do voucher CI Polaris — TBD: budget da conta inteira
const BUDGET_THRESHOLDS = [0.5, 0.8, 1.0, 1.2];
const CUD_REEVAL_THRESHOLD_BRL = 30;   // abaixo disso, CUD/SUD não compensa — reavaliar na escala da conta
const DEPLOY_COUNT_PER_MONTH = 540;    // placeholder do CI Polaris — não se aplica à conta inteira (métrica é por app/projeto)

// datasets
const STG = V.staging_dataset || "billing_platform_stg";
const MART = V.mart_dataset || "billing_platform_mart";
const RPT = V.reporting_dataset || "billing_platform_reporting";

// FQN da tabela de origem (acesso direto, sem view intermediaria), com crase para SQL
function sourceRef() {
  return "`" + V.source_project + "." + V.source_dataset + "." + V.source_table + "`";
}

// nome de coluna de label achatada (managed-by -> label_managed_by)
function labelCol(key) {
  return "label_" + key.replace(/-/g, "_");
}

// gera a lista de colunas "(SELECT value FROM UNNEST(<alias>.labels) WHERE key = '<k>') AS label_<k>"
function labelColumns(alias) {
  const a = alias || "s";
  return LABEL_KEYS.map(
    (k) => "(SELECT value FROM UNNEST(" + a + ".labels) WHERE key = '" + k + "') AS " + labelCol(k)
  ).join(",\n  ");
}

// janela incremental / updatePartitionFilter
function lookbackFilter(dateCol) {
  return dateCol + " >= DATE_SUB(CURRENT_DATE('" + TIMEZONE + "'), INTERVAL " + LOOKBACK_DAYS + " DAY)";
}

module.exports = {
  LOOKBACK_DAYS, FRESHNESS_HOURS, TIMEZONE, LABEL_KEYS,
  ANOMALY_Z, ANOMALY_MIN_BRL, MONTHLY_BUDGET_BRL, BUDGET_THRESHOLDS,
  CUD_REEVAL_THRESHOLD_BRL, DEPLOY_COUNT_PER_MONTH,
  STG, MART, RPT,
  sourceRef, labelCol, labelColumns, lookbackFilter,
};
