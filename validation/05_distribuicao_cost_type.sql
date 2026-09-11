-- 05 — Distribuição por cost_type
-- DECIDE: se tax / adjustment / rounding_error têm peso relevante (mantê-los no grão da fact
--         e tratá-los à parte no consumo) ou se são desprezíveis.
-- OLHAR: pct_of_gross por cost_type. 'regular' domina; se 'tax' > ~5%, dashboards precisam
--        separar. 'adjustment' recorrente indica créditos/ajustes tardios a acompanhar.

SELECT
  cost_type,
  COUNT(*)                                                  AS line_count,
  ROUND(SUM(cost), 2)                                       AS gross_cost,
  ROUND(100 * SUM(cost) / SUM(SUM(cost)) OVER (), 2)        AS pct_of_gross,
  COUNT(DISTINCT invoice.month)                             AS months_present
FROM `dp6-billing-voucher.billing_export.gcp_billing_export_resource_v1_008012_F93445_DFD798`
GROUP BY cost_type
ORDER BY gross_cost DESC;
