# Spec 001 — Modelagem do billing export do CI Polaris em BigQuery (Dataform)

Status: 🟡 rascunho para revisão · Data: 2026-09-09

## Deltas da Fase 2 (2026-09-09) — sobrepõem o texto abaixo

Validação rodada (`validation/RESULTADOS.md`). A view é `SELECT * FROM
gcp_billing_export_resource_v1_008012_F93445_DFD798 WHERE project.id = 'dp6-ci-polaris'` —
export **detalhado (resource-level)**, sem dedup/agregação, tipos nativos (**sem `SAFE_CAST`**).
R$ 26,41 em ~2 meses, 1 projeto, Cloud Run = 82%.

1. **Créditos:** só `DISCOUNT` spend-based, R$ -0,57 (0,1% das linhas). → manter só
   `credits_total` (+ `_usd`). **Remover** `credits_cud/sud/promo/free_tier/other`.
2. **Economia:** `cost_at_list == cost` sempre, `list_savings = 0`. → **Revisto pós-canvas
   (2026-09-09):** `cost_at_list_brl` volta a ser **medida** no fato/`agg` (não dormante) e
   alimenta o waterfall da aba *Unit economics* — mesmo valendo R$ 0, o waterfall prova que
   não há desconto negociado. `list_savings` = `cost_at_list − cost` (derivado).
3. **Showback:** cobertura de label 4–10% do custo (`managed-by` 10%, `app`/`environment` 4%;
   valores de `app`: `observability-hub|atlas|polaris-cost-control`). → extrair as 3 labels no
   staging, mas aba Showback é **placeholder** (spec 002).
4. **`cost_type`:** 100% `regular`. → manter no grão, sem tratamento especial de `tax` no MVP.
5. **`lookback_days` = 45** (restatement normal 0–2 dias; fechamento de fatura reexporta até 31).
6. **`freshness_threshold_hours` = 36.**
7. **Dedup:** `QUALIFY ROW_NUMBER() OVER (PARTITION BY <todas as colunas menos export_time>
   ORDER BY export_time DESC) = 1` — mata só reexport idêntico. `assert_fct_reconciliation`
   contra `SUM(cost) GROUP BY invoice.month` da view é a rede de segurança.
8. **Location = `US`** (multi-region) — `workflow_settings.yaml defaultLocation: US`, e os
   datasets `billing_platform_*` criados em `US`.

Ajustes vindos da Fase 2.5 A (`docs/data-contract.md` §4):

9. **`fct_billing_cost_daily`:** remover `list_savings` das medidas; medidas em `_brl` e `_usd`;
   manter `label_environment/app/managed_by` (o 3º só p/ `rpt_label_coverage`).
10. **`agg_billing_cost_monthly`:** grão **sem `label_managed_by`**; **sem** colunas de janela
    (LAG/MoM vão para a view `rpt_cost_monthly`).
11. **`vw_billing_daily_anomaly`:** `is_anomaly = z_score > ${anomaly_z} AND net_cost_day >
    ${anomaly_min_brl}` (remover o ramo `OR net_cost_day > 2*avg_28d` — superdispara a R$ 26/mês).
12. **Assertions:** `assert_stg_grain_unique` → **`assert_stg_no_exact_duplicate`** (após dedup,
    zero linha 100% idêntica). `assert_fct_reconciliation` é a rede real. Dedup concreto:
    `PARTITION BY TO_JSON_STRING((SELECT AS STRUCT t.* EXCEPT(export_time)))`.
13. **`includes/constants.js`:** `anomaly_z = 3`, `anomaly_min_brl = 1.0`,
    **`monthly_budget_brl = 20`** (revisto de 50 pós-canvas — reconciliar com
    `polaris-cost-control/specs/001`), `budget_thresholds = [0.5, 0.8, 1.0, 1.2]`.
14. **Camada `definitions/reporting/`** — 6 views na Fase 2.5 A + **7 novas** pós-canvas
    (`rpt_budget_daily`, `rpt_forecast_monthly`, `rpt_label_coverage_weekly`,
    `rpt_showback_monthly`, `rpt_savings_waterfall`, `rpt_unit_economics`,
    `rpt_commitment_coverage`) — ver `docs/data-contract.md` §2 e §6.

## Objetivo

Materializar, por Dataform, uma camada analítica de custo confiável em cima da view de
billing export do CI Polaris (`dp6-billing-voucher.billing_export.gcp_billing_export_resource_v1_008012_F93445_DFD798`),
entregando indicadores de FinOps num grão diário: custo bruto, créditos, **custo líquido**,
custo a preço de tabela, economia negociada, uso por SKU, evolução mês a mês, projeção de
fechamento, flag de anomalia diária e showback por `app`×`environment`. Orquestração pelo
agendamento nativo do Dataform; alerta de falha (job e assertion) por e-mail para
`gcp-billing-platform@dp6.com.br`.

## Escopo

- **Fonte:** a view acima (projeto de billing `dp6-billing-voucher`; leitura cross-project).
- **Destino:** datasets no `dp6-ci-polaris` — `billing_platform_stg`, `billing_platform_mart`,
  `billing_platform_assertions`. Só ambiente **prod** nesta primeira entrega (sufixo `_dev`
  reservado).
- **Camadas:** `sources` (declaration) → `staging` (1:1 limpo, incremental) → `marts` (fato
  diário, rollup mensal, view de anomalia, dimensão service/sku) → `assertions`.
- **Granularidade da fact:** `invoice_month × usage_date × service_description ×
  sku_description × pricing_unit × location_location × cost_type × label_environment ×
  label_app × label_managed_by`.
- **Showback:** chaves de label `environment`, `app`, `managed-by`, conforme
  `atlas/docs/finops-labels.md`.
- **Orquestração:** `google_dataform_repository_release_config` (compila `main` diariamente) +
  `google_dataform_repository_workflow_config` (executa a tag `billing_platform`) + um
  `workflow_config` mensal de fechamento com `--full-refresh`.
- **Alerta:** `google_monitoring_notification_channel` (e-mail) +
  `google_monitoring_alert_policy` log-based sobre `workflowInvocation` com estado `FAILED`
  (ou notification rule nativa do Dataform, se o provider expuser).
- **Moeda:** BRL nativo + USD derivado (`cost / currency_conversion_rate`).

## Fora de escopo (por enquanto)

- Breakdown de crédito por tipo no headline — fica como coluna latente no staging
  (`credits_cud/sud/promo/free_tier/other`); promoção ao fato é decisão pós-validação #03.
- Chaves de label `team` / `cost-center` — proibidas pelo `atlas/docs/finops-labels.md` até a
  taxonomia ser atualizada.
- Ambiente `dev` (datasets/config `_dev`).
- Cobertura/utilização real de CUD — depende de export do CUD recommender, que não existe hoje.
- Canais de alerta além de e-mail (Chat, Slack, PagerDuty, webhook).
- Cloud Workflows / Composer como orquestrador (avaliado — ver ADR-002).
- Dashboards / consumo (o `atlas` ou outra ferramenta consome as marts; não é deste repo).

## Camadas e grão

| Camada | Modelo | Grão | Tipo Dataform | Partição / cluster |
|---|---|---|---|---|
| Source | `billing_export_resource` | linha do billing export | `declaration` | — |
| Staging | `stg_billing_platform` | 1 linha por linha de origem, limpa e deduplicada | `incremental` | part. `usage_date`; cluster `service_description, sku_description` |
| Fato | `fct_billing_cost_daily` | ver "Granularidade da fact" acima | `incremental` | part. `usage_date`; cluster `service_description, label_app` |
| Rollup | `agg_billing_cost_monthly` | `invoice_month × service_description × label_* × cost_type` | `table` | cluster `invoice_month` |
| Anomalia | `vw_billing_daily_anomaly` | `usage_date × service_description` | `view` | — |
| Dimensão | `dim_service_sku` | distinct `service/sku/pricing_unit` | `table` | — |

Reprocessamento incremental: a cada run, MERGE que **substitui as partições dos últimos
`lookback_days` dias** (`updatePartitionFilter`), para absorver o *restatement* do billing
export dentro da janela. `--full-refresh` mensal (dia 12) consolida o mês de fatura fechado.

## Dicionário de indicadores

Medidas SUM, salvo indicação. `netcost = cost + Σcredits`.

### Núcleo de custo + economia (staging, fato, rollup)

| Indicador | Definição |
|---|---|
| `gross_cost` | `SUM(cost)` — custo bruto (BRL), preço efetivo, antes de créditos |
| `credits_total` | `SUM` de `credits[].amount` (negativo); staging: `(SELECT SUM(c.amount) FROM UNNEST(credits) c)` |
| `net_cost` | `gross_cost + credits_total` — **headline** |
| `cost_at_list` | `SUM(cost_at_list)` — custo a preço de tabela |
| `list_savings` | `cost_at_list - cost` — economia por preço negociado (antes de créditos) |
| `gross_cost_usd`, `net_cost_usd` | `SAFE_DIVIDE(<valor>, currency_conversion_rate)` |
| `usage_amount_pricing_units` | `SUM(usage.amount_in_pricing_units)` — só válido junto de `sku` + `pricing_unit` |
| `line_count` | `COUNT(*)` — sanidade |
| `credits_{cud,sud,promo,free_tier,other}` | **staging apenas** — `SUM(c.amount)` filtrando `c.type` |

### Analytics temporal (rollup mensal + view de anomalia)

| Indicador | Definição |
|---|---|
| `net_cost_prev_month` | `LAG(net_cost) OVER (PARTITION BY service_description, label_* ORDER BY invoice_month)` |
| `mom_abs` | `net_cost - net_cost_prev_month` |
| `mom_pct` | `SAFE_DIVIDE(mom_abs, net_cost_prev_month)` |
| `run_rate_eom` | só no `invoice_month` aberto: `net_cost_mtd / days_elapsed * days_in_month` |
| `z_score` (view) | `SAFE_DIVIDE(net_cost_day - avg_28d, NULLIF(stddev_28d, 0))` sobre janela de 28 dias por serviço |
| `is_anomaly` (view) | `z_score > 3` OU `net_cost_day > 2 * avg_28d` (limiares em `includes/constants.js`) |

### Showback (dimensão em todas as camadas)

`label_environment`, `label_app`, `label_managed_by` — extraídos no staging via
`(SELECT value FROM UNNEST(labels) WHERE key = '<chave>')`. Chaves em
`vars.label_keys = "environment,app,managed-by"`.

## Regras de negócio

- `cost_type` ∈ {`regular`, `tax`, `adjustment`, `rounding_error`} — todos mantidos.
  `net_cost` soma todos; consumo pode separar `tax`.
- `invoice_month` = `invoice.month` (`YYYYMM`), mantido como STRING + `invoice_month_date`
  (`PARSE_DATE('%Y%m', invoice.month)`). É a chave de reconciliação com a fatura; pode
  divergir do mês de `usage_start_time` (ajustes tardios).
- `usage_date = DATE(usage_start_time)`; `usage_hour = TIMESTAMP_TRUNC(usage_start_time, HOUR)`.
- Créditos ausentes → `credits_total = 0` (não NULL).
- Dedup no staging conforme validação #09 (default:
  `QUALIFY ROW_NUMBER() OVER (PARTITION BY <dimensões de negócio + usage_start_time> ORDER BY export_time DESC) = 1`).
- Se a validação #11 mostrar que a `billing_export_resource` já deduplica / filtra projeto / agrega
  créditos, o staging simplifica na medida.

## Arquivos e interfaces

- `workflow_settings.yaml` — `defaultProject`, datasets, `defaultLocation`, `vars`
  (`source_*`, `lookback_days`, `freshness_threshold_hours`, `label_keys`).
- `includes/constants.js` — ref da fonte, parsing de `label_keys`, limiares de anomalia,
  helpers de expressão SQL (net cost, USD, extração de label).
- `definitions/sources/billing_export_resource.sqlx` — `declaration`.
- `definitions/staging/stg_billing_platform.sqlx` — incremental, `updatePartitionFilter`.
- `definitions/marts/*.sqlx` — fato, rollup, view de anomalia, dimensão.
- `definitions/assertions/*.sqlx` — `assert_stg_grain_unique`, `assert_stg_not_null`,
  `assert_fct_reconciliation`, `assert_source_freshness` (todas `tags: ["billing_platform"]`).
- `terraform/` — datasets, Dataform repo + release/workflow configs, monitoring, IAM.
- `terraform/bootstrap/` — WIF pool `dp6-billing-platform`, SAs, bucket de state, APIs.

## Critério de verificação fim-a-fim

1. `validation/*.sql` rodadas; reconciliação #01 bate (tolerância R$ 0,01) com o relatório
   de faturamento do console GCP; `lookback_days` (#06), cobertura de label (#04) e location
   (#11) travados em `validation/RESULTADOS.md`.
2. `dataform compile` sem erro; `dataform run --dry-run` limpo.
3. `dataform run --tags billing_platform --full-refresh` cria as tabelas; contagem do fato
   consistente com `stg` e com a view; as 4 assertions verdes.
4. `SELECT invoice_month, SUM(net_cost) FROM fct_billing_cost_daily GROUP BY 1` igual
   (tolerância 0,01) ao mesmo SUM direto na view.
5. Segunda run **sem** `--full-refresh` reescreve só as partições da janela; totais estáveis.
6. Assertion quebrada de propósito → e-mail chega em `gcp-billing-platform@dp6.com.br`; revertido.
7. Após `terraform apply`, `workflow_config` disparado manual no console do Dataform chega a
   `SUCCEEDED`.

## Decisões em aberto / assumidas

- **Nome do repo:** `dp6-billing-platform` (GitHub `DP6/dp6-billing-platform`). Criação do repo
  vazio + secrets/variables de WIF: passo manual do usuário (mesmo checklist do
  `polaris-cost-control/SESSIONLOG.md`).
- **Grant cross-project:** `bigquery.dataViewer` para a SA do Dataform no
  `dp6-billing-voucher.billing_export` — depende de quem administra o projeto de
  billing (possível dependência de TI, análoga ao ADR-002 do `polaris-cost-control`).
- **Location** do dataset de origem — assumido `US` (multi-region); confirmar na validação
  #11. A location do Dataform e dos datasets alvo precisa bater.
- **Escopo de projeto** — assumido projeto único `dp6-ci-polaris`; validação #07 confirma se
  a view traz mais de um projeto. Se trouxer, `project_id` volta ao grão das marts.
- **Breakdown de crédito por tipo** — latente no staging; promoção ao fato decidida após #03.
- **Notification rule nativa do Dataform vs. alert policy log-based** — decidir na Fase 4
  conforme suporte do provider `google` 6.50; ambos terminam no mesmo canal de e-mail.
- **`dataformCoreVersion`** — assumido `3.0.0`; fixar a versão exata na Fase 3.
