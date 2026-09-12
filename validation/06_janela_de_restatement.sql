-- 06 — Janela de restatement
-- DECIDE: o valor de vars.lookback_days — por quantos dias após o consumo o billing export
--         ainda reescreve linhas. O reprocessamento incremental (updatePartitionFilter) tem
--         que cobrir essa janela + folga.
-- OLHAR: days_from_usage_to_last_export por usage_date. O maior valor recorrente (fora do
--        dia corrente) + ~10 dias de folga = lookback_days. GCP costuma mexer até ~30d,
--        e ajustes de fatura podem aparecer no fechamento (~dia 10-12 do mês seguinte).
-- NOTA:  usa MIN(DATE(usage_start_time)) no DATE_DIFF (dentro do grupo é sempre a mesma data
--        e é agregado) — referenciar usage_start_time cru fora do GROUP BY quebra no BQ.

SELECT
  DATE(usage_start_time)                                                     AS usage_date,
  MIN(export_time)                                                           AS first_export,
  MAX(export_time)                                                           AS last_export,
  DATE_DIFF(DATE(MAX(export_time)), MIN(DATE(usage_start_time)), DAY)         AS days_from_usage_to_last_export,
  TIMESTAMP_DIFF(MAX(export_time), MIN(export_time), HOUR)                    AS export_spread_hours,
  COUNT(DISTINCT export_time)                                                AS distinct_export_times,
  COUNT(*)                                                                   AS line_count
FROM `dp6-billing-voucher.billing_export.gcp_billing_export_resource_v1_008012_F93445_DFD798`
WHERE DATE(usage_start_time) >= DATE_SUB(CURRENT_DATE(), INTERVAL 60 DAY)
GROUP BY usage_date
ORDER BY usage_date DESC;
