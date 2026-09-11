-- 02 — Custo diário por serviço (shape da fact)
-- DECIDE: se o grão diário × serviço tem cardinalidade e valores razoáveis; é o formato
--         que a fct_billing_cost_daily vai expor (aqui sem sku/location/labels, só o esqueleto).
-- OLHAR: nº de linhas por dia; serviços dominantes; net_cost negativo? (créditos > custo)
--        usage_pricing_units só faz sentido junto de pricing_unit consistente.

SELECT
  DATE(usage_start_time)                                                    AS usage_date,
  service.description                                                       AS service_description,
  ROUND(SUM(cost), 4)                                                       AS gross_cost,
  ROUND(SUM((SELECT IFNULL(SUM(c.amount), 0) FROM UNNEST(credits) c)), 4)   AS credits_total,
  ROUND(SUM(cost)
      + SUM((SELECT IFNULL(SUM(c.amount), 0) FROM UNNEST(credits) c)), 4)   AS net_cost,
  ROUND(SUM(cost_at_list) - SUM(cost), 4)                                   AS list_savings,
  ROUND(SUM(usage.amount_in_pricing_units), 4)                              AS usage_pricing_units,
  COUNT(DISTINCT usage.pricing_unit)                                        AS distinct_pricing_units,
  COUNT(*)                                                                  AS line_count
FROM `dp6-billing-voucher.billing_export.gcp_billing_export_resource_v1_008012_F93445_DFD798`
WHERE DATE(usage_start_time) >= DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY)
GROUP BY usage_date, service_description
ORDER BY usage_date DESC, net_cost DESC;
