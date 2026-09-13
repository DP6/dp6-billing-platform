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

// --- reconciliação de custo não-alocado por nome de recurso (plano "conciliar Cloud Run +
// Secret Manager + BigQuery com label", ver docs/adr). Mesmo mecanismo do polaris-cost-model,
// mas escopado por project_id (conta inteira, N projetos) — hoje só sei preencher com certeza
// os recursos de dp6-ci-polaris; outros projetos entram conforme forem confirmados. Cloud Run
// "Services" CPU/Memory e a maioria dos secrets do Secret Manager quase nunca carregam labels
// no billing export (limitação do GCP) — reconciliamos pelo nome do recurso, que sempre vem
// preenchido em `resource.global_name`.
const CLOUD_RUN_APP_MAP = [
  { project_id: "dp6-ci-polaris", match: "name LIKE 'backend-%'", app: "atlas" },
  { project_id: "dp6-ci-polaris", match: "name LIKE 'frontend-%'", app: "atlas" },
  { project_id: "dp6-ci-polaris", match: "name LIKE 'billing-platform-api-%'", app: "dp6-billing-platform" },
  { project_id: "dp6-ci-polaris", match: "name LIKE 'billing-web-%'", app: "polaris-cost-model" },
  { project_id: "dp6-ci-polaris", match: "name LIKE 'billing-api-%'", app: "polaris-cost-model" },
  { project_id: "dp6-ci-polaris", match: "name = 'polaris'", app: "polaris" },
];
const SECRET_APP_MAP = [
  { project_id: "dp6-ci-polaris", match: "name LIKE 'GOOGLE_OAUTH_CLIENT_SECRET_%'", app: "atlas" },
  { project_id: "dp6-ci-polaris", match: "name LIKE 'GOOGLE_OAUTH_CLIENT_ID_%'", app: "atlas" },
  { project_id: "dp6-ci-polaris", match: "name LIKE 'JWT_SECRET_%'", app: "atlas" },
  { project_id: "dp6-ci-polaris", match: "name = 'OAUTH_ALLOWLIST'", app: "atlas" },
  { project_id: "dp6-ci-polaris", match: "name = 'polaris-cost-model-dataform-git-token'", app: "polaris-cost-model" },
  { project_id: "dp6-ci-polaris", match: "name = 'dp6-billing-platform-dataform-git-token'", app: "dp6-billing-platform" },
  { project_id: "dp6-ci-polaris", match: "name LIKE 'polaris-%'", app: "polaris" },
];

function resourceNameAfter(expr, segment) {
  return "REGEXP_EXTRACT(" + expr + ", r'/" + segment + "/([^/]+)$')";
}
function appCaseFromMap(nameExpr, projectExpr, map) {
  // replacer como funcao, nao string: nameExpr tem REGEXP_EXTRACT(...([^/]+)$') -- o "$'" no
  // fim e um padrao especial de substituicao do String.replace ("texto apos o match") quando
  // a substituicao e uma string; com funcao o retorno e usado ao pe da letra.
  const whens = map
    .map(
      ({ project_id, match, app }) =>
        "WHEN " + projectExpr + " = '" + project_id + "' AND " + match.replace(/\bname\b/g, () => nameExpr) + " THEN '" + app + "'"
    )
    .join("\n    ");
  return "CASE\n    " + whens + "\n    ELSE NULL\n  END";
}
function cloudRunAppCase(expr, projectExpr) {
  return appCaseFromMap(resourceNameAfter(expr, "(?:services|jobs)"), projectExpr, CLOUD_RUN_APP_MAP);
}
function cloudRunEnvCase(expr) {
  const name = resourceNameAfter(expr, "(?:services|jobs)");
  return (
    "CASE\n" +
    "    WHEN " + name + " LIKE '%-dev%' THEN 'dev'\n" +
    "    WHEN " + name + " LIKE '%-prod%' THEN 'prod'\n" +
    "    WHEN " + name + " = 'polaris' THEN 'prod'\n" +
    "    ELSE NULL\n" +
    "  END"
  );
}
function secretAppCase(expr, projectExpr) {
  return appCaseFromMap(resourceNameAfter(expr, "secrets"), projectExpr, SECRET_APP_MAP);
}
function secretEnvCase(expr) {
  const name = resourceNameAfter(expr, "secrets");
  return (
    "CASE\n" +
    "    WHEN " + name + " LIKE '%_DEV' OR " + name + " LIKE '%-dev%' THEN 'dev'\n" +
    "    WHEN " + name + " LIKE '%_PROD' OR " + name + " LIKE '%-prod%' THEN 'prod'\n" +
    "    ELSE NULL\n" +
    "  END"
  );
}
// BigQuery: sem resource.global_name utilizavel alem do Job ID, e sem project_id na regra —
// o padrao de nome de job do Dataform (script_job_<hash>_<n>) vale igual em qualquer projeto.
// Demais jobs (UUID solto) sao majoritariamente o proprio backend deste painel
// (apps/api/src/billing_api/bq.py) rodando queries ao vivo — uma vez que bq.py passar a setar
// label de job (roadmap), essas linhas caem no WHEN de label nativo antes de chegar aqui.
function bigQueryJobId(expr) {
  return "REGEXP_EXTRACT(" + expr + ", r'/jobs/([^/]+)$')";
}
function bigQueryAppCase(expr) {
  const jobId = bigQueryJobId(expr);
  return (
    "CASE\n" +
    "    WHEN REGEXP_CONTAINS(" + jobId + ", r'^script_job_') THEN '(BigQuery · pipeline Dataform)'\n" +
    "    WHEN " + jobId + " IS NOT NULL THEN '(BigQuery · outras queries)'\n" +
    "    ELSE NULL\n" +
    "  END"
  );
}

module.exports = {
  LOOKBACK_DAYS, FRESHNESS_HOURS, TIMEZONE, LABEL_KEYS,
  ANOMALY_Z, ANOMALY_MIN_BRL, MONTHLY_BUDGET_BRL, BUDGET_THRESHOLDS,
  CUD_REEVAL_THRESHOLD_BRL, DEPLOY_COUNT_PER_MONTH,
  STG, MART, RPT,
  sourceRef, labelCol, labelColumns, lookbackFilter,
  CLOUD_RUN_APP_MAP, SECRET_APP_MAP,
  resourceNameAfter, appCaseFromMap, cloudRunAppCase, cloudRunEnvCase,
  secretAppCase, secretEnvCase, bigQueryAppCase,
};
