-- 07 — Escopo de projetos
-- DECIDE: se a view traz só o projeto dp6-ci-polaris (project_id sai do grão das marts) ou
--         mais de um (project_id volta ao grão).
-- OLHAR: nº de project.id distintos. Também billing_account_id (deveria ser um só) e a
--        hierarquia de ancestrais (folder / org) para entender o recorte da view.
-- NOTA:  agrupa por project.id (expressão real, não alias) e agrega o resto — a v1 quebrava
--        por GROUP BY via alias combinado com acesso ao struct project.name.

SELECT
  project.id                            AS project_id,
  ANY_VALUE(project.name)               AS project_name,
  ANY_VALUE(project.ancestry_numbers)   AS ancestry_numbers,
  COUNT(DISTINCT billing_account_id)    AS distinct_billing_accounts,
  ANY_VALUE(billing_account_id)         AS billing_account_id,
  COUNT(*)                              AS line_count,
  ROUND(SUM(cost), 2)                   AS gross_cost,
  MIN(DATE(usage_start_time))           AS first_usage_date,
  MAX(DATE(usage_start_time))           AS last_usage_date
FROM `dp6-billing-voucher.billing_export.gcp_billing_export_resource_v1_008012_F93445_DFD798`
GROUP BY project.id
ORDER BY gross_cost DESC;
