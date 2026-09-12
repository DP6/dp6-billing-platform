-- 01 — Reconciliação mensal
-- DECIDE: se a modelagem (gross / credits / net / list) bate com a fatura real.
-- OLHAR: comparar net_cost por invoice_month com o Console GCP
--        (Billing > Reports, agrupado por mês, mesma billing account).
--        Diferença esperada: ~0. Se houver gap, investigar cost_type (consulta 05)
--        e créditos (consulta 03) antes de modelar.
-- NOTA:  invoice.month é a chave de fatura (YYYYMM); pode conter usage de meses anteriores.

SELECT
  invoice.month                                                             AS invoice_month,
  currency,
  ROUND(SUM(cost), 2)                                                       AS gross_cost,
  ROUND(SUM((SELECT IFNULL(SUM(c.amount), 0) FROM UNNEST(credits) c)), 2)   AS credits_total,
  ROUND(SUM(cost)
      + SUM((SELECT IFNULL(SUM(c.amount), 0) FROM UNNEST(credits) c)), 2)   AS net_cost,
  ROUND(SUM(cost_at_list), 2)                                               AS cost_at_list,
  ROUND(SUM(cost_at_list) - SUM(cost), 2)                                   AS list_savings,
  ROUND(SAFE_DIVIDE(SUM(cost), ANY_VALUE(currency_conversion_rate)), 2)     AS gross_cost_usd_approx,
  COUNT(*)                                                                  AS line_count
FROM `dp6-billing-voucher.billing_export.gcp_billing_export_resource_v1_008012_F93445_DFD798`
GROUP BY invoice_month, currency
ORDER BY invoice_month;
