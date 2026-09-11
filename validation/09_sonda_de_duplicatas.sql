-- 09 — Sonda de duplicatas
-- DECIDE: a estratégia de dedup no staging. O billing export não tem chave natural única e
--         pode ter 2+ linhas legítimas com as mesmas dimensões (o Google quebra a cobrança).
--         Precisamos saber se as "duplicatas" diferem por export_time (restatement -> pegar a
--         mais recente) ou se são partições legítimas da mesma cobrança (somar, não deduplicar).
-- OLHAR: 9a) grupos com n > 1: distinct_export_times > 1 sugere restatement (dedup por
--            ROW_NUMBER() ... ORDER BY export_time DESC). distinct_export_times = 1 com
--            custos iguais sugere duplicata real; custos diferentes sugerem split legítimo.
--        9b) magnitude: quantos grupos e qual % das linhas caem em n > 1.

-- 9a) Amostra de grupos duplicados (últimos 30 dias)
WITH grp AS (
  SELECT
    billing_account_id,
    service.id            AS service_id,
    sku.id               AS sku_id,
    usage_start_time,
    usage_end_time,
    project.id           AS project_id,
    location.location    AS location_location,
    resource.global_name AS resource_global_name,
    cost_type,
    COUNT(*)                      AS n,
    COUNT(DISTINCT export_time)   AS distinct_export_times,
    COUNT(DISTINCT cost)          AS distinct_costs,
    ROUND(SUM(cost), 6)          AS sum_cost,
    ROUND(MIN(cost), 6)          AS min_cost,
    ROUND(MAX(cost), 6)          AS max_cost
  FROM `dp6-billing-voucher.billing_export.gcp_billing_export_resource_v1_008012_F93445_DFD798`
  WHERE DATE(usage_start_time) >= DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY)
  GROUP BY billing_account_id, service_id, sku_id, usage_start_time, usage_end_time,
           project_id, location_location, resource_global_name, cost_type
)
SELECT *
FROM grp
WHERE n > 1
ORDER BY n DESC, sum_cost DESC
LIMIT 200;

-- 9b) Magnitude do fenômeno
WITH grp AS (
  SELECT
    billing_account_id, service.id AS service_id, sku.id AS sku_id,
    usage_start_time, usage_end_time, project.id AS project_id,
    location.location AS location_location, resource.global_name AS resource_global_name,
    cost_type,
    COUNT(*) AS n
  FROM `dp6-billing-voucher.billing_export.gcp_billing_export_resource_v1_008012_F93445_DFD798`
  WHERE DATE(usage_start_time) >= DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY)
  GROUP BY billing_account_id, service_id, sku_id, usage_start_time, usage_end_time,
           project_id, location_location, resource_global_name, cost_type
)
SELECT
  COUNT(*)                                              AS total_groups,
  COUNTIF(n > 1)                                        AS groups_with_dupes,
  ROUND(100 * COUNTIF(n > 1) / COUNT(*), 2)             AS pct_groups_with_dupes,
  SUM(n)                                                AS total_rows,
  SUM(IF(n > 1, n, 0))                                  AS rows_in_dupe_groups
FROM grp;
