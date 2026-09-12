# Resultados da Fase 2 — validação da view

Rodado em 2026-09-09 contra `dp6-billing-voucher.billing_export.gcp_billing_export_resource_v1_008012_F93445_DFD798`.
Dados brutos: `RESULTADOS.raw.txt` + `RESULTADOS2.raw.txt`.

## Resumo executivo

O billing export do CI Polaris é **minúsculo e simples**: R$ 26,41 em ~2 meses, 1 projeto,
sem descontos negociados, créditos irrelevantes, labels com baixa cobertura. Várias
simplificações no modelo e no dashboard caem daqui.

## O que a view é (validação 11)

```sql
SELECT * FROM `dp6-billing-voucher.billing_export.gcp_billing_export_resource_v1_008012_F93445_DFD798`
WHERE project.id = 'dp6-ci-polaris'
```

- **Export detalhado (resource-level)** `gcp_billing_export_resource_v1_*` — o tier mais rico
  (tem `resource.global_name`, `price`, `cost_at_list`, `tags`, `consumption_model`).
- Dataset real da tabela: `dp6-billing-voucher.billing_export`. A view mora em outro dataset
  (`billing_export`), só com essa view dentro.
- **Sem dedup, sem agregação** — passthrough puro com filtro de projeto. Toda a lógica de
  dedup/limpeza é nossa.
- **Tipos nativos** (TIMESTAMP, FLOAT64, NUMERIC, STRUCT, ARRAY) — schema padrão do GCP.
  **Nenhum `SAFE_CAST` necessário** no staging.
- Location do dataset de origem: **`US`** (multi-region) — confirmado 2026-09-09.

## Parâmetros travados

| Parâmetro | Valor | Base |
|---|---|---|
| `source_project` | `dp6-billing-voucher` | 11a |
| `source_dataset` / tabela | `billing_export` / `gcp_billing_export_resource_v1_008012_F93445_DFD798` | 11a |
| **Location** (Dataform + datasets alvo) | **`US`** | 11c |
| Ler direto da tabela ou da view? | **da view** (`billing_export_resource`) — já filtra o projeto; declaração Dataform aponta pra ela | 11a |
| `lookback_days` | **45** | 06 — restatement normal 0–2 dias, mas fechamento de fatura reexporta até **31 dias** depois (usage 01/08 reexportado 01/09) |
| `freshness_threshold_hours` | **36** | 00 (último export 2h atrás) + 06 (dias de baixa atividade só reexportam 1×/dia) |
| Dedup | hash da linha inteira **exceto `export_time`**, `QUALIFY ROW_NUMBER() OVER (PARTITION BY <tudo menos export_time> ORDER BY export_time DESC) = 1` | 09 |
| `label_keys` | `environment, app, managed-by` | 04a — as 3 existem em `labels[]` |
| Moeda | BRL nativo; USD = `SAFE_DIVIDE(valor, currency_conversion_rate)` **por linha** | 10 — 1 taxa/mês (mês aberto varia: 202609 tem 5,8168 e 5,8703) |

## Achados que mudam o escopo

### 1. Créditos: cortar breakdown por tipo (validação 03)
- Só **R$ -0,57 no total**, 47 linhas (0,1%), tipo único **`DISCOUNT`** ("CPU/Memory Allocation
  Time" — spend-based no Cloud Run).
- **Decisão:** manter só `credits_total` (e `credits_total_usd`). **Remover** `credits_cud`,
  `credits_sud`, `credits_promo`, `credits_free_tier`, `credits_other` da spec 001.

### 2. Economia: cortar do MVP (validação 08)
- `cost_at_list == cost` em **todos** os serviços. `list_savings = 0` em tudo. Sem contrato /
  CUD / preço negociado nesta billing account.
- **Decisão:** **remover a aba Economia**, o waterfall, `list_savings` e `cost_at_list` do MVP.
  Manter `cost_at_list` como coluna dormante no staging (custa nada), fora das marts/reporting.

### 3. Showback: aba placeholder (validação 04)
- Cobertura por custo: `managed-by` ~10% (R$ 2,63), `app` ~4% (R$ 1,07), `environment` ~4%
  (R$ 1,10). Valores de `app`: `observability-hub` | `atlas` | `polaris-cost-control`.
- Rollout das labels começou 26/08 (default_labels do Atlas) e está subindo, mas hoje é baixo.
- **Decisão:** extrair as 3 labels no staging (barato), mas a **aba Showback entra como
  placeholder** ("aguardando aplicação das labels — cobertura atual ~4–10%") com só o gráfico
  de cobertura ativo. `goog-*` são injetadas pelo Google, ignorar.

### 4. cost_type: sem tratamento especial no MVP (validação 05)
- 100% `regular` (R$ 26,41), 1 linha `tax` = R$ 0,00.
- **Decisão:** manter `cost_type` no grão, sem lógica de separação de `tax` no MVP.

### 5. Projeto único confirmado (validação 07 + 11a)
- Só `dp6-ci-polaris`, 1 billing account `008012-F93445-DFD798`. `project_id` **fora** do grão
  das marts (fica coluna no staging).

### 6. Dedup: dois fenômenos (validação 09)
- 86.323 grupos (chave = dimensões de negócio + `usage_start_time`/`end`). 2.830 com >1 linha:
  - **528** "restatement puro" (`distinct_costs = 1`) — reexport idêntico, dedupe seguro.
  - **2.302** com custos distintos — mistura de reexport com custo revisado + splits legítimos
    (ex.: Secret Manager, micro-linhas ±1e-6 de arredondamento).
- **Decisão:** dedupe por hash da linha inteira menos `export_time` (mata só reexport idêntico),
  e **`assert_fct_reconciliation`** contra `SUM(cost) GROUP BY invoice.month` da view como rede
  de segurança. Reprocesso mensal com `--full-refresh` fecha o mês. Limitação documentada:
  restatement que muda valor deixa as duas linhas até o full-refresh.

## Reconciliação (validação 01) — conferir no console

| invoice_month | gross | credits | **net** | linhas |
|---|---|---|---|---|
| 202607 | 0,00 | 0,00 | **0,00** | 56 |
| 202608 | 23,65 | 0,00 | **23,65** | 43.788 |
| 202609 (parcial) | 2,75 | -0,57 | **2,19** | 46.382 |

USD aprox: ago R$ 23,65 → US$ 4,07.

## Perfil de custo (validação 02, 08)

| Serviço | Gross all-time (R$) | Linhas | Nota |
|---|---|---|---|
| Cloud Run | 21,81 | 1.517 | **82% do total** |
| BigQuery | 1,75 | 80.544 | muita linha, pouco custo |
| Secret Manager | 1,57 | 5.494 | acessos a secret |
| Artifact Registry | 0,77 | 986 | |
| Cloud Scheduler | 0,50 | 20 | |
| Cloud Storage | 0,01 | 219 | |
| App Engine / Cloud Logging | ~0 | — | |

Implicação de dashboard: "Top serviços" é dominado por 1. Usar "Cloud Run vs resto" ou escala
log. Anomalia por z-score nesses valores (centavos) é ruído — manter estrutura, calibrar
limiar alto, e/ou só sinalizar quando `net_cost_day` passar de um piso absoluto (ex.: R$ 1).

## Impacto na IA dos dashboards (spec 002 C)

- **6 abas → 4**: Visão Geral · Tendência · Serviços & SKUs · Anomalias. **Economia removida.**
  **Showback** vira placeholder.
- Scorecard: tirar "economia (list savings)". Manter net cost MTD, run-rate, Δ MoM, créditos
  no mês, custo vs orçamento R$ 50.
- Anomalia: limiar por z-score **e** piso absoluto (`net_cost_day > R$ 1`), senão vira ruído.

## Pendências

- Nenhuma da Fase 2. Location resolvida (`US`). Entrega decidida: **app standalone** (spec 002).
