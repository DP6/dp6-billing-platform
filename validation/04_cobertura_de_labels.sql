-- 04 — Cobertura de labels
-- DECIDE: se o showback por environment / app / managed-by tem base hoje, e se as chaves
--         de vars.label_keys estão certas. O atlas/docs/finops-labels.md diz que a aplicação
--         nos recursos existentes ainda é "execução futura" — então cobertura pode ser baixa.
-- OLHAR: 4a) todas as chaves de resource-label que existem e seu peso;
--        4b) % de linhas e de custo que carregam cada chave-alvo (últimos 30d);
--        4c) mesma coisa para project.labels e system_labels (fallback / diagnóstico).

-- 4a) Todas as chaves de `labels` (resource labels)
-- NOTA: STRING_AGG em vez de ARRAY_AGG — bq não imprime campo repetido em CSV.
SELECT
  l.key                          AS label_key,
  COUNT(*)                       AS line_count,
  COUNT(DISTINCT l.value)        AS distinct_values,
  ROUND(SUM(cost), 2)            AS gross_cost_with_key,
  STRING_AGG(DISTINCT l.value, ' | ') AS sample_values
FROM `dp6-billing-voucher.billing_export.gcp_billing_export_resource_v1_008012_F93445_DFD798`,
     UNNEST(labels) AS l
GROUP BY label_key
ORDER BY line_count DESC;

-- 4b) Cobertura das chaves-alvo nas linhas e no custo (últimos 30 dias)
SELECT
  ROUND(100 * COUNTIF(EXISTS(SELECT 1 FROM UNNEST(labels) l WHERE l.key = 'environment')) / COUNT(*), 1) AS pct_rows_environment,
  ROUND(100 * COUNTIF(EXISTS(SELECT 1 FROM UNNEST(labels) l WHERE l.key = 'app'))         / COUNT(*), 1) AS pct_rows_app,
  ROUND(100 * COUNTIF(EXISTS(SELECT 1 FROM UNNEST(labels) l WHERE l.key = 'managed-by'))  / COUNT(*), 1) AS pct_rows_managed_by,
  ROUND(100 * SUM(IF(EXISTS(SELECT 1 FROM UNNEST(labels) l WHERE l.key = 'app'), cost, 0)) / NULLIF(SUM(cost), 0), 1) AS pct_cost_app,
  ROUND(100 * SUM(IF(EXISTS(SELECT 1 FROM UNNEST(labels) l WHERE l.key = 'environment'), cost, 0)) / NULLIF(SUM(cost), 0), 1) AS pct_cost_environment
FROM `dp6-billing-voucher.billing_export.gcp_billing_export_resource_v1_008012_F93445_DFD798`
WHERE DATE(usage_start_time) >= DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY);

-- 4c) project.labels e system_labels — o que existe por lá
SELECT 'project.labels' AS source, pl.key AS label_key, COUNT(*) AS line_count
FROM `dp6-billing-voucher.billing_export.gcp_billing_export_resource_v1_008012_F93445_DFD798`,
     UNNEST(project.labels) AS pl
GROUP BY label_key
UNION ALL
SELECT 'system_labels' AS source, sl.key AS label_key, COUNT(*) AS line_count
FROM `dp6-billing-voucher.billing_export.gcp_billing_export_resource_v1_008012_F93445_DFD798`,
     UNNEST(system_labels) AS sl
GROUP BY label_key
ORDER BY source, line_count DESC;
