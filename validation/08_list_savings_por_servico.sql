-- 08 — List savings por serviço
-- DECIDE: sanidade de list_savings = cost_at_list - cost (economia por preço negociado,
--         antes de créditos). Confirma que cost_at_list nunca é < cost e que o indicador
--         faz sentido por serviço.
-- OLHAR: list_savings >= 0 em todas as linhas agregadas; list_savings_rate plausível
--        (0 quando não há desconto negociado; > 0 em serviços com CUD/preço de contrato).
--        Se aparecer negativo, investigar cost_type = 'adjustment'/'rounding_error'.

SELECT
  service.description                                                       AS service_description,
  ROUND(SUM(cost), 2)                                                       AS effective_cost,
  ROUND(SUM(cost_at_list), 2)                                               AS list_cost,
  ROUND(SUM(cost_at_list) - SUM(cost), 2)                                   AS list_savings,
  ROUND(SAFE_DIVIDE(SUM(cost_at_list) - SUM(cost), NULLIF(SUM(cost_at_list), 0)), 4) AS list_savings_rate,
  COUNTIF(cost_at_list < cost)                                              AS lines_list_below_effective,
  COUNT(*)                                                                  AS line_count
FROM `dp6-billing-voucher.billing_export.gcp_billing_export_resource_v1_008012_F93445_DFD798`
GROUP BY service_description
ORDER BY list_savings DESC;
