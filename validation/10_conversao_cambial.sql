-- 10 — Conversão cambial
-- DECIDE: se dá para derivar USD de forma estável com cost / currency_conversion_rate, e se
--         a taxa varia dentro do mês (uma taxa por mês? por dia? por linha?).
-- OLHAR: distinct_rates por mês. Se for 1, a taxa é mensal e a derivação é trivial. Se
--        variar, decidir se USD usa a taxa da linha (correto) ou uma taxa de referência.
--        currency deve ser sempre BRL.

SELECT
  invoice.month                                              AS invoice_month,
  currency,
  COUNT(DISTINCT currency_conversion_rate)                   AS distinct_rates,
  ROUND(MIN(currency_conversion_rate), 6)                    AS min_rate,
  ROUND(APPROX_QUANTILES(currency_conversion_rate, 2)[OFFSET(1)], 6) AS median_rate,
  ROUND(MAX(currency_conversion_rate), 6)                    AS max_rate,
  ROUND(SUM(cost), 2)                                        AS gross_cost_brl,
  ROUND(SUM(SAFE_DIVIDE(cost, currency_conversion_rate)), 2) AS gross_cost_usd
FROM `dp6-billing-voucher.billing_export.gcp_billing_export_resource_v1_008012_F93445_DFD798`
GROUP BY invoice_month, currency
ORDER BY invoice_month;
