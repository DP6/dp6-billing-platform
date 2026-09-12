-- 00 — Sanidade inicial
-- DECIDE: se a view tem dado suficiente para as demais validações e qual o lag típico
--         entre o consumo (usage_start_time) e a última exportação (export_time).
-- OLHAR: total_rows > 0; first_usage_date / last_usage_date cobrindo >= 1 mês;
--        hours_since_last_export baixo (< ~48h) indica export saudável.

SELECT
  COUNT(*)                                                        AS total_rows,
  MIN(DATE(usage_start_time))                                     AS first_usage_date,
  MAX(DATE(usage_start_time))                                     AS last_usage_date,
  COUNT(DISTINCT invoice.month)                                   AS distinct_invoice_months,
  MIN(export_time)                                                AS first_export_time,
  MAX(export_time)                                                AS last_export_time,
  TIMESTAMP_DIFF(CURRENT_TIMESTAMP(), MAX(export_time), HOUR)     AS hours_since_last_export,
  COUNT(DISTINCT service.description)                             AS distinct_services,
  COUNT(DISTINCT sku.description)                                 AS distinct_skus,
  ROUND(SUM(cost), 2)                                             AS gross_cost_all_time,
  ANY_VALUE(currency)                                             AS currency
FROM `dp6-billing-voucher.billing_export.gcp_billing_export_resource_v1_008012_F93445_DFD798`;
