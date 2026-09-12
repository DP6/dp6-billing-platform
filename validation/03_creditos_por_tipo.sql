-- 03 — Créditos por tipo
-- DECIDE: se o breakdown de crédito por tipo (CUD/SUD/promo/free tier) precisa ir ao
--         headline da fact, ou se basta credits_total + colunas latentes no staging.
-- OLHAR: quais c.type aparecem e o peso de cada um. Se só houver FREE_TIER/DISCOUNT
--        irrelevantes, mantém latente. Se CUD/SUD forem material, promover ao fato.

-- 3a) Distribuição por tipo/nome de crédito
SELECT
  c.type                       AS credit_type,
  c.name                       AS credit_name,
  COUNT(*)                     AS line_count,
  ROUND(SUM(c.amount), 2)      AS credit_amount,
  ROUND(MIN(c.amount), 4)      AS min_amount,
  ROUND(MAX(c.amount), 4)      AS max_amount
FROM `dp6-billing-voucher.billing_export.gcp_billing_export_resource_v1_008012_F93445_DFD798`,
     UNNEST(credits) AS c
GROUP BY credit_type, credit_name
ORDER BY credit_amount;

-- 3b) Quantas linhas têm / não têm créditos
SELECT
  COUNTIF(ARRAY_LENGTH(credits) = 0)  AS rows_without_credits,
  COUNTIF(ARRAY_LENGTH(credits) > 0)  AS rows_with_credits,
  COUNT(*)                            AS total_rows,
  ROUND(100 * COUNTIF(ARRAY_LENGTH(credits) > 0) / COUNT(*), 1) AS pct_rows_with_credits
FROM `dp6-billing-voucher.billing_export.gcp_billing_export_resource_v1_008012_F93445_DFD798`;
