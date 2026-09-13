# Contrato de dados — dashboard → origem (Fase 2.5 A)

Engenharia reversa fechada em 2026-09-09, a partir da IA enxugada (`specs/002` C, 4 abas) e da
Fase 2 (`validation/RESULTADOS.md`). Entrega = **app standalone** (`apps/api` FastAPI +
`apps/web` React); as views `rpt_*` são a fronteira: a API só lê `rpt_*` e devolve DTOs.

Cadeia: **widget** → **endpoint / DTO** → **view `rpt_*`** → **mart** → **`stg_billing_platform`** → **coluna da `billing_export_resource`**.

> **Nota 2026-09-12** (`docs/adr/ADR-009-ia-6-abas.md`): a IA passou de 8 para 6 abas
> (`specs/005-telas.md` §0) — Orçamento fundiu em Visão Geral, Otimização + Unit economics
> fundiram em Eficiência & economia. As seções abaixo continuam como registro histórico das
> fases em que foram escritas; para a lista atual de rotas/params, ver
> `apps/api/src/billing_api/routes.py`.

---

## 1. Filtros globais → WHERE

| Filtro | Coluna | Aplica em | Default |
|---|---|---|---|
| Período | `usage_date` (ou `invoice_month`) | `rpt_cost_daily`, `rpt_anomaly_daily` | mês corrente |
| Serviço | `service_description` | todas | (todos) |
| Ambiente | `label_environment` | `rpt_cost_daily`, `rpt_cost_monthly` | (todos) |
| App | `label_app` | `rpt_cost_daily`, `rpt_cost_monthly` | (todos) |
| Moeda | — (colunas `_brl` / `_usd`) | todas | BRL |
| Tipo de custo | `cost_type` | avançado (100% `regular` hoje) | (todos) |

---

## 2. Catálogo da camada `definitions/reporting/` (6 views, `type: view`)

### `rpt_cost_daily` — série diária, núcleo
- **Fonte:** `fct_billing_cost_daily`
- **Grão:** `usage_date, service_description, sku_description, pricing_unit, cost_type, label_environment, label_app`
- **Colunas:** grão + `invoice_month`, `invoice_month_date`, `gross_cost_brl`, `credits_total_brl`, `net_cost_brl`, `gross_cost_usd`, `net_cost_usd`, `usage_amount_pricing_units`, `line_count`
- **Serve:** VG (tendência diária, top serviços), Tendência (API rola até mês), Serviços & SKUs, Anomalias (sparkline + drill dia→SKU)

### `rpt_cost_monthly` — série mensal + analytics temporal
- **Fonte:** `agg_billing_cost_monthly` + window functions
- **Grão:** `invoice_month, service_description, label_environment, label_app, cost_type`
- **Colunas:** grão + `invoice_month_date`, `gross_cost_brl`, `credits_total_brl`, `net_cost_brl`, `net_cost_usd`, `line_count`, `net_cost_prev_month_brl` (`LAG` sobre `invoice_month` particionado por serviço+labels+cost_type), `mom_abs_brl`, `mom_pct`
- **Serve:** Tendência (área empilhada, barras mensais, pace), VG (faixa de reconciliação)

### `rpt_cost_scorecard` — 1 linha, mês corrente
- **Fonte:** `agg_billing_cost_monthly` + constante de orçamento
- **Grão:** 1 linha
- **Colunas:** `current_invoice_month`, `net_cost_mtd_brl`, `net_cost_mtd_usd`, `gross_cost_mtd_brl`, `credits_mtd_brl`, `prev_month_net_brl` (mês anterior fechado), `mom_pct`, `days_elapsed`, `days_in_month`, `run_rate_eom_brl` (`net_cost_mtd / days_elapsed * days_in_month`), `budget_brl` (= 50), `budget_used_pct` (`net_cost_mtd_brl / 50`), `run_rate_vs_budget_pct` (`run_rate_eom_brl / 50`)
- **Serve:** VG (scorecard). `current_invoice_month = FORMAT_DATE('%Y%m', CURRENT_DATE())`.

### `rpt_service_sku` — dimensão service/sku + recência
- **Fonte:** `dim_service_sku`
- **Grão:** `service_id, service_description, sku_id, sku_description, pricing_unit`
- **Colunas:** grão + `first_seen_date`, `last_seen_date`, `is_new_30d` (`first_seen_date >= CURRENT_DATE() - 30`)
- **Serve:** Serviços & SKUs (callout de SKU novo, metadados da tabela). O **custo unitário** a API calcula de `rpt_cost_daily` na janela filtrada (`net_cost / NULLIF(usage_amount_pricing_units, 0)`).

### `rpt_anomaly_daily` — dias sinalizados
- **Fonte:** `vw_billing_daily_anomaly`
- **Grão:** `usage_date, service_description`
- **Colunas:** grão + `net_cost_day_brl`, `avg_28d_brl`, `stddev_28d_brl`, `z_score`, `deviation_abs_brl` (`net_cost_day - avg_28d`), `deviation_pct`, `is_anomaly`
- **Regra:** `is_anomaly = z_score > ${anomaly_z} AND net_cost_day > ${anomaly_min_brl}` — constantes em `includes/constants.js` (`anomaly_z = 3`, `anomaly_min_brl = 1.0`). O piso absoluto é essencial: a R$ 26/mês o z-score sozinho dispara em centavos.
- **Serve:** Anomalias (tabela). Contexto (sparkline) e drill dia→SKU vêm de `rpt_cost_daily`.

### `rpt_label_coverage` — cobertura de label (Showback placeholder)
- **Fonte:** `fct_billing_cost_daily` (usa `label_managed_by` — por isso o fato mantém as 3 labels)
- **Grão:** `invoice_month`
- **Colunas:** `net_cost_total_brl`, `net_cost_with_environment_brl`, `net_cost_with_app_brl`, `net_cost_with_managed_by_brl`, `pct_environment`, `pct_app`, `pct_managed_by`, `unlabeled_net_cost_brl` (sem `app` **e** sem `environment`)
- **Serve:** Showback (só o gráfico de cobertura + aviso "cobertura ~4–10%, aguardando aplicação das labels").

---

## 3. Matriz de widgets

### Aba 1 — Visão Geral

| Widget | Endpoint (DTO) | View | Colunas usadas |
|---|---|---|---|
| Scorecard (5 cards) | `GET /api/scorecard?currency` → `ScorecardDTO` | `rpt_cost_scorecard` | todas |
| Tendência de custo líquido diário + média móvel 7d | `GET /api/cost/daily?from&to&service&environment&app&currency` → `DailyPointDTO[]` | `rpt_cost_daily` (agg por `usage_date`) | `usage_date`, `net_cost_brl/_usd` (média móvel = no cliente ou na API) |
| Top serviços (Cloud Run vs resto) | `GET /api/cost/by-service?from&to&environment&app&currency` → `ServiceCostDTO[]` | `rpt_cost_daily` (agg por `service_description`) | `service_description`, `net_cost_brl/_usd` |
| Faixa de reconciliação por `invoice_month` | `GET /api/reconciliation` → `ReconRowDTO[]` | `rpt_cost_monthly` (agg por `invoice_month`) | `invoice_month`, `gross_cost_brl`, `credits_total_brl`, `net_cost_brl` |

### Aba 2 — Tendência / Evolução

| Widget | Endpoint (DTO) | View | Colunas usadas |
|---|---|---|---|
| Área empilhada por serviço no tempo | `GET /api/cost/monthly?from&to&environment&app&currency` → `MonthlyServicePointDTO[]` | `rpt_cost_monthly` | `invoice_month`, `service_description`, `net_cost_brl/_usd` |
| Barras mensais + Δ MoM + run-rate no mês aberto | mesmo endpoint (agg por `invoice_month`) + `rpt_cost_scorecard` p/ run-rate | `rpt_cost_monthly` + `rpt_cost_scorecard` | `net_cost_brl`, `mom_abs_brl`, `mom_pct`, `run_rate_eom_brl` |
| Pace acumulado (mês corrente vs anterior) | `GET /api/cost/daily?...` (2 meses) → cálculo cumulativo | `rpt_cost_daily` | `usage_date`, `net_cost_brl` |

### Aba 3 — Serviços & SKUs

| Widget | Endpoint (DTO) | View | Colunas usadas |
|---|---|---|---|
| Composição service → drill SKU | `GET /api/cost/by-sku?from&to&service&environment&app&currency` → `SkuCostDTO[]` | `rpt_cost_daily` (agg por `service_description, sku_description, pricing_unit`) | `service_description`, `sku_description`, `pricing_unit`, `net_cost_brl`, `usage_amount_pricing_units` |
| Tabela de custo unitário por SKU | mesmo endpoint | `rpt_cost_daily` + `rpt_service_sku` | `net_cost_brl / NULLIF(usage_amount_pricing_units,0)`, `pricing_unit` |
| Callout de SKU novo | `GET /api/sku/new` → `NewSkuDTO[]` | `rpt_service_sku` | `service_description`, `sku_description`, `first_seen_date`, `is_new_30d` |

### Aba 4 — Anomalias

| Widget | Endpoint (DTO) | View | Colunas usadas |
|---|---|---|---|
| Tabela de dias sinalizados | `GET /api/anomalies?from&to` → `AnomalyRowDTO[]` | `rpt_anomaly_daily` (`WHERE is_anomaly`) | todas |
| Sparkline por serviço com dia destacado | `GET /api/cost/daily?from&to&service` → `DailyPointDTO[]` | `rpt_cost_daily` (agg por `usage_date`) | `usage_date`, `net_cost_brl` |
| Drill do dia → SKUs | `GET /api/cost/by-sku?from=<dia>&to=<dia>&service=<svc>` | `rpt_cost_daily` | `sku_description`, `net_cost_brl` |

### Showback (placeholder)

| Widget | Endpoint (DTO) | View | Colunas usadas |
|---|---|---|---|
| Cobertura de label (donut + número) | `GET /api/label-coverage?months` → `LabelCoverageDTO[]` | `rpt_label_coverage` | `pct_environment`, `pct_app`, `pct_managed_by`, `unlabeled_net_cost_brl` |

---

## 4. Reconciliação com as marts da `specs/001`

| Mart | Serve? | Mudança necessária |
|---|---|---|
| `stg_billing_platform` | sim | **Dedup:** `QUALIFY ROW_NUMBER() OVER (PARTITION BY TO_JSON_STRING((SELECT AS STRUCT t.* EXCEPT(export_time))) ORDER BY export_time DESC) = 1` (mata só reexport 100% idêntico — validação #09). **Remover** colunas latentes de crédito por tipo. `cost_at_list` fica dormante (não vai adiante). Sem `SAFE_CAST` (tipos nativos). |
| `fct_billing_cost_daily` | sim | **Remover `list_savings`** das medidas (sempre 0). Manter `label_environment`, `label_app`, `label_managed_by` (o 3º só alimenta `rpt_label_coverage`). `location_location` fica no grão (padrão, custo nulo) mesmo sem widget. Medidas em `_brl` e `_usd`. |
| `agg_billing_cost_monthly` | sim (trim) | Grão **sem `label_managed_by`** (coverage lê do fato). **Sem** colunas de janela (LAG/MoM) — vão para `rpt_cost_monthly`. |
| `dim_service_sku` | sim | sem mudança |
| `vw_billing_daily_anomaly` | sim (tweak) | `is_anomaly = z_score > ${anomaly_z} AND net_cost_day > ${anomaly_min_brl}` (constantes: `anomaly_z=3`, `anomaly_min_brl=1.0`). Remover o ramo `OR net_cost_day > 2*avg_28d` (superdispara nessa escala). |
| **assertions** | mudam | `assert_stg_grain_unique` → **`assert_stg_no_exact_duplicate`**: após dedup, zero linha 100% idêntica repetida. `assert_fct_reconciliation` (a rede real): `ABS(SUM(fct.net_cost_brl) − SUM(view.cost + credits)) por invoice_month > 0.01` falha. `assert_stg_not_null`, `assert_source_freshness` (`> 36h`) mantidas. |

**Novo em `includes/constants.js`:** `anomaly_z = 3`, `anomaly_min_brl = 1.0`, `monthly_budget_brl = 50`.

---

## 5. Parâmetros travados (de `validation/RESULTADOS.md`)

| Parâmetro | Valor |
|---|---|
| `lookback_days` | 45 |
| `freshness_threshold_hours` | 36 |
| `label_keys` | `environment, app, managed-by` |
| Location | `US` |
| Dedup | `ROW_NUMBER` sobre `t.* EXCEPT(export_time)`, latest `export_time` |
| Créditos | só `credits_total` (+ `_usd`); sem breakdown por tipo |
| `list_savings` / `cost_at_list` | fora do MVP (`cost_at_list` dormante no staging) |
| Moeda | `_brl` nativo + `_usd` via `SAFE_DIVIDE(valor_brl, currency_conversion_rate)` por linha |

---

## 6. Escopo ampliado — 8 telas (canvas aprovado 2026-09-09)

A IA subiu de 4 para 8 abas (`specs/002` "Revisão pós-canvas"). Orçamento = **R$ 20**.

### Views novas / alteradas em `definitions/reporting/`

| View | Grão | Fonte | Alimenta |
|---|---|---|---|
| `rpt_cost_scorecard` *(alterada)* | 1 linha | `agg_billing_cost_monthly` | + `economia_efetiva_pct` (`1 − net/cost_at_list`), `budget_brl = 20`, `budget_used_pct`, `run_rate_vs_budget_pct` |
| `rpt_budget_daily` *(nova)* | `usage_date` (mês corrente) | `fct_billing_cost_daily` | burn-down: `net_cost_cum_brl`, `budget_brl`, thresholds 50/80/100/120% como constantes |
| `rpt_forecast_monthly` *(nova)* | `invoice_month` + 3 meses futuros | `agg_billing_cost_monthly` | `net_cost_brl` histórico + `forecast_linear`, `forecast_trend`, `forecast_lo`/`forecast_hi` (faixa). Histórico de 3 meses → faixa larga, documentar |
| `rpt_label_coverage` *(mantida)* | `invoice_month` | `fct_billing_cost_daily` | cobertura por chave |
| `rpt_label_coverage_weekly` *(nova)* | `DATE_TRUNC(usage_date, WEEK)` | `fct_billing_cost_daily` | progressão da cobertura (labels aplicadas em 26/08 → curva sobe) |
| `rpt_showback_monthly` *(nova)* | `invoice_month × label_app × label_environment` | `fct_billing_cost_daily` | custo por app, por ambiente, `unallocated_net_cost_brl` (sem `app` **e** sem `environment`) |
| `rpt_service_sku` *(alterada)* | `service × sku × pricing_unit` | `dim_service_sku` + `fct` | + `unit_cost_brl` (`net_cost / NULLIF(usage_amount_pricing_units,0)`), `net_cost_prev_month_brl`, `delta_brl` (top movers) |
| `rpt_savings_waterfall` *(VOLTA)* | `invoice_month` (acumulado) | `agg_billing_cost_monthly` | degraus `cost_at_list` → `−negotiated_discount` (= `cost_at_list − cost`) → `−credits_total` → `net_cost`. Hoje `negotiated_discount = 0` — o waterfall prova que não há desconto |
| `rpt_unit_economics` *(nova)* | 1 linha + série diária | `fct` / `rpt_cost_by_sku` | `cost_per_1k_req_brl` (SKU Requests: `net_cost / usage_amount_pricing_units`), `cost_per_gib_log_brl`, `cost_per_vcpu_s_brl`, `cost_per_gib_s_brl`, `cost_per_day_avg_30d_brl` |
| `rpt_commitment_coverage` *(nova)* | 1 linha | `fct` (`UNNEST(credits)`) | `%` do gasto elegível coberto por `COMMITTED_USAGE_DISCOUNT` — **0** nesta conta (validação #03) |

### O que NÃO vem do billing export (a API lê de outra fonte — definir em `specs/003`)

| Widget | Fonte necessária | MVP |
|---|---|---|
| Recomendações de otimização (min-instances, modo de CPU, imagens antigas, retenção de log) | Cloud Asset Inventory + config APIs (Cloud Run, Artifact Registry, Logging) — terreno do Atlas | **lista curada estática** revisada periodicamente, ou integração com o Atlas |
| Economia potencial estimada | derivada das recomendações acima | idem |
| Custo por deploy (denominador = nº de deploys) | Cloud Build history / GitHub Actions runs / eventos de criação de revisão no Cloud Logging | contagem manual/config no MVP; automatizar depois |
| Prontidão de chargeback (checklist labels em Terraform, dono por app) | config + processo | checklist manual, só a % de cobertura é dado |
| Custo por 1k requests | **parcial no billing export** — `usage.amount` do SKU "Requests" é a contagem faturada de requests | usar o SKU Requests (suficiente para o MVP) |

### Marts (`specs/001`) — segundo passe

- `fct_billing_cost_daily`: **`cost_at_list` volta a ser medida** (`cost_at_list_brl`), não mais dormante.
- `agg_billing_cost_monthly`: idem; e `rpt_forecast_monthly`/`rpt_savings_waterfall` consomem daqui.
- Constantes em `includes/constants.js`: **`monthly_budget_brl = 20`** (era 50), `budget_thresholds = [0.5, 0.8, 1.0, 1.2]`.
- Sem mudança de grão nas marts — as telas novas são agregações/janelas sobre o que já existe.

---

## 7. Matriz de widgets — 4 telas novas (§3 cobre as 4 originais)

### Aba 2 — Orçamento & previsão

| Widget | Endpoint (DTO) | View | Colunas usadas |
|---|---|---|---|
| Tiles: consumido MTD, projeção EOM, folga, data de estouro | `GET /api/budget?currency` → `BudgetDTO` | `rpt_cost_scorecard` + `rpt_budget_daily` | `net_cost_mtd_brl`, `run_rate_eom_brl`, `budget_brl`, `budget_used_pct`, `projected_breach_date` (null = sem estouro) |
| Burn-down (acumulado vs orçamento + thresholds) | `GET /api/budget/burndown?month` → `BurndownPointDTO[]` | `rpt_budget_daily` | `usage_date`, `net_cost_cum_brl`, `budget_brl`, `threshold_50_brl`/`_80`/`_100`/`_120` |
| Escada de thresholds | (em `/api/budget`) | `rpt_cost_scorecard` | `budget_thresholds`, `run_rate_vs_budget_pct` |
| Previsão 3 meses (barra + faixa) | `GET /api/forecast?horizon=3&currency` → `ForecastMonthDTO[]` | `rpt_forecast_monthly` | `invoice_month`, `is_actual`, `forecast_trend_brl`, `forecast_lo_brl`, `forecast_hi_brl` |

### Aba 4 — Alocação · showback

| Widget | Endpoint (DTO) | View | Colunas usadas |
|---|---|---|---|
| Cobertura por chave (3 donuts) | `GET /api/allocation/coverage?months` → `LabelCoverageDTO[]` | `rpt_label_coverage` | `pct_environment`, `pct_app`, `pct_managed_by`, `net_cost_with_*_brl` |
| Progressão semanal | `GET /api/allocation/coverage/weekly?from&to` → `CoverageWeekDTO[]` | `rpt_label_coverage_weekly` | `week_start`, `pct_app`, `pct_environment`, `pct_managed_by` |
| Custo por app + não-alocado | `GET /api/allocation/by-app?from&to&currency` → `AppCostDTO[]` | `rpt_showback_monthly` | `label_app`, `net_cost_brl`, `unallocated_net_cost_brl`, `unallocated_pct` |
| Custo por ambiente | `GET /api/allocation/by-env?from&to&currency` → `EnvCostDTO[]` | `rpt_showback_monthly` | `label_environment`, `net_cost_brl` |
| Prontidão de chargeback | `GET /api/allocation/chargeback-readiness` → `ChargebackReadinessDTO` | `rpt_label_coverage` + **config estática** | `coverage_pct` (dado) + `criteria[]` (`labels_in_terraform`, `coverage_ge_95`, `owner_per_app` — config) |

### Aba 6 — Otimização & waste

| Widget | Endpoint (DTO) | View / fonte | Colunas usadas |
|---|---|---|---|
| Cobertura de compromissos (gauge) | `GET /api/optimization/commitment-coverage` → `CommitmentCoverageDTO` | `rpt_commitment_coverage` | `covered_pct` (=0), `eligible_spend_brl`, `on_demand_spend_brl`, `cud_reeval_threshold_brl` |
| Economia potencial (tile) | (em `/recommendations`) | soma | `potential_savings_min_brl`, `potential_savings_max_brl` |
| Recomendações (tabela) | `GET /api/optimization/recommendations` → `RecommendationDTO[]` | **`recommendations.yaml` no repo** (MVP) / Asset Inventory via job (depois) | `title`, `evidence`, `savings_min_brl`, `savings_max_brl`, `effort`, `status` |

### Aba 7 — Unit economics & eficiência

| Widget | Endpoint (DTO) | View / fonte | Colunas usadas |
|---|---|---|---|
| Tiles: custo por deploy / 1k req / GB log / dia | `GET /api/unit-economics?currency` → `UnitEconomicsDTO` | `rpt_unit_economics` (+ `deploy_count` externo) | `cost_per_1k_req_brl`, `cost_per_gib_log_brl`, `cost_per_day_avg_30d_brl`, `cost_per_deploy_brl` |
| Waterfall preço-tabela → líquido | `GET /api/efficiency/waterfall?period&currency` → `WaterfallStepDTO[]` | `rpt_savings_waterfall` | `cost_at_list_brl`, `negotiated_discount_brl`, `credits_total_brl`, `net_cost_brl`, `effective_savings_pct`, `cost_avoided_brl` |
| Eficiência Cloud Run | (em `/api/unit-economics`) | `rpt_unit_economics` | `cost_per_vcpu_s_brl`, `cost_per_gib_s_brl`, `cpu_mem_ratio` |
| Tendência custo por request | `GET /api/unit-economics/series?metric=cost_per_1k_req&from&to` → `UnitSeriesPointDTO[]` | `rpt_cost_daily` (SKU Requests) | `usage_date`, `value_brl` |

> **`deploy_count`** (denominador de "custo por deploy") não está no billing export. MVP: valor
> em config / contagem manual. Depois: job que conta revisões do Cloud Run no Cloud Logging.
