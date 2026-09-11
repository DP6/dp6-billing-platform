# Spec 003 — App standalone (painel FinOps)

Status: 🟡 rascunho para revisão · Data: 2026-09-09
Depende de: `specs/002` (IA de 8 abas), `docs/data-contract.md` (§3, §6, §7), `specs/001` (marts + `rpt_*`)
Referência visual: `mock/canvas/*.dc.html` (canvas de design aprovado) e `mock/index.html`

## Objetivo

App web próprio no repo `dp6-billing-platform` que serve o painel FinOps do CI Polaris a partir
das views `rpt_*` no BigQuery. Controle total do DP6 Design System, isolado do Atlas. Dois
usos: operacional diário (time CI/dev) e revisão executiva mensal.

## Escopo

- **`apps/api/`** — backend fino (FastAPI, `uv`), só leitura das views `rpt_*` em
  `billing_platform_mart` (+ 1 arquivo de config `recommendations.yaml`). Sem lógica de negócio
  (está no SQL). Cloud Run `billing-platform-api-prod`.
- **`apps/web/`** — SPA React + Vite + TypeScript + Recharts + Tailwind. Tokens do DP6 Design
  System aplicados direto (`tokens/*.css` de `polaris-heap/DP6-Design-System.md`). Build
  estático servido por Cloud Run `billing-web-prod`.
- **8 telas** (`specs/002` "Revisão pós-canvas"): Visão geral · Orçamento & previsão ·
  Tendência · Alocação · Serviços & SKUs · Otimização & waste · Unit economics · Anomalias.
- **Auth:** IAP na frente dos dois serviços Cloud Run; allowlist de e-mails DP6. Sem sessão/JWT
  próprios.
- **Filtros globais:** período / `invoice_month` · serviço · `environment` · `app` · moeda
  (BRL/USD). Estado do filtro na URL (querystring) para links compartilháveis.
- **Cache:** a API cacheia respostas por ~30 min (Dataform roda 1×/dia; TTL curto cobre o
  `workflow_config` diário + o close-out mensal). Header `X-Data-Updated-At` (de `rpt_meta`).

## Fora de escopo (MVP)

- **Escrita.** "Dar baixa" em anomalia é só visual no MVP (ou um `localStorage`); persistência
  vira uma coleção Firestore numa iteração depois.
- **Automação das recomendações de otimização** — MVP lê `recommendations.yaml` curado à mão.
  Integração com Cloud Asset Inventory / Atlas fica para depois.
- **`deploy_count` automático** (denominador de custo-por-deploy) — valor em config no MVP.
- **Chargeback de verdade** — só a *prontidão* (checklist + % de cobertura).
- **Multi-projeto / multi-billing-account** — projeto único `dp6-ci-polaris`.
- **dev do próprio app** — só `prod` (sufixo `_dev` reservado, como no `polaris-cost-control`).
- **Tema:** o canvas de referência é claro; o app entrega claro + escuro (o `mock/index.html`
  já mostra os dois).

## Arquitetura

```
dp6-billing-platform/
├── (projeto Dataform na raiz — specs/001, 002)
├── apps/
│   ├── api/                     # FastAPI, uv
│   │   ├── src/billing_api/
│   │   │   ├── main.py          # app + CORS + IAP header trust
│   │   │   ├── routes/          # 1 router por grupo (cost, budget, allocation, optimization, unit_economics, anomalies, meta)
│   │   │   ├── bq.py            # cliente BigQuery + cache (TTL 30 min)
│   │   │   ├── models.py        # DTOs Pydantic (= schemas abaixo)
│   │   │   └── config.py        # project, dataset, budget, thresholds, deploy_count
│   │   ├── recommendations.yaml # lista curada (aba Otimização)
│   │   ├── tests/
│   │   ├── pyproject.toml · uv.lock · Dockerfile
│   └── web/                     # React + Vite + TS
│       ├── src/
│       │   ├── app/             # rotas, providers, layout (topbar preto + tabs + filtros)
│       │   ├── screens/         # 1 por aba (VisaoGeral, Orcamento, Tendencia, Alocacao, Servicos, Otimizacao, UnitEconomics, Anomalias)
│       │   ├── charts/          # componentes Recharts na paleta DP6 (Area, HBar, StackedBar, Waterfall, Donut, Sparkline, Gauge)
│       │   ├── components/      # MetricTile, MetricGrid, Card, DataTable, Chip, PageHeader, FilterBar, ThemeToggle
│       │   ├── lib/             # cliente HTTP, format (formatBrl, formatUsd, formatPct, formatMonth), useFilters (URL state)
│       │   └── types/           # DTOs (gerados do OpenAPI da API)
│       ├── package.json · pnpm-lock.yaml · vite.config.ts · Dockerfile
├── terraform/  (Fase 4 — + 2 Cloud Run, IAP, Artifact Registry, IAM)
└── .github/workflows/  (Fase 5 — + build/deploy apps/api e apps/web)
```

- **Fluxo de dados:** browser → (IAP) → `apps/web` (estático) → `apps/api` → BigQuery `rpt_*`.
  A API nunca escreve. Sem back-end de sessão.
- **SA de runtime da API:** `bigquery.dataViewer` em `billing_platform_mart`, `bigquery.jobUser`
  no `dp6-ci-polaris`. Nada de acesso à origem (`dp6-billing-voucher`) — isso é só do Dataform.

## Endpoints

Todos `GET`, JSON, prefixo `/api`. Erros: `{ "error": {"code": "...", "message": "..."} }`
com HTTP 4xx/5xx. Todos aceitam `currency=BRL|USD` (default BRL); os de série aceitam
`from`/`to` (`YYYY-MM-DD`).

| Endpoint | Query | DTO | Aba |
|---|---|---|---|
| `/api/meta` | — | `MetaDTO` | todas (rodapé de frescor) |
| `/api/scorecard` | `currency` | `ScorecardDTO` | 1 |
| `/api/cost/daily` | `from,to,service,environment,app,currency` | `DailyPointDTO[]` | 1, 3, 8 |
| `/api/cost/by-service` | `from,to,environment,app,currency` | `ServiceCostDTO[]` | 1 |
| `/api/cost/monthly` | `from,to,environment,app,currency` | `MonthlyServicePointDTO[]` | 3 |
| `/api/reconciliation` | `currency` | `ReconRowDTO[]` | 1 |
| `/api/budget` | `currency` | `BudgetDTO` | 2 |
| `/api/budget/burndown` | `month,currency` | `BurndownPointDTO[]` | 2 |
| `/api/forecast` | `horizon=3,currency` | `ForecastMonthDTO[]` | 2 |
| `/api/allocation/coverage` | `months` | `LabelCoverageDTO[]` | 4 |
| `/api/allocation/coverage/weekly` | `from,to` | `CoverageWeekDTO[]` | 4 |
| `/api/allocation/by-app` | `from,to,currency` | `AppAllocationDTO` | 4 |
| `/api/allocation/by-env` | `from,to,currency` | `EnvCostDTO[]` | 4 |
| `/api/allocation/chargeback-readiness` | — | `ChargebackReadinessDTO` | 4 |
| `/api/cost/by-sku` | `from,to,service,environment,app,currency` | `SkuCostDTO[]` | 5, 8 |
| `/api/sku/new` | — | `NewSkuDTO[]` | 5 |
| `/api/optimization/commitment-coverage` | `currency` | `CommitmentCoverageDTO` | 6 |
| `/api/optimization/recommendations` | — | `RecommendationsDTO` | 6 |
| `/api/unit-economics` | `currency` | `UnitEconomicsDTO` | 7 |
| `/api/unit-economics/series` | `metric,from,to,currency` | `UnitSeriesPointDTO[]` | 7 |
| `/api/efficiency/waterfall` | `period,currency` | `WaterfallStepDTO[]` | 7 |
| `/api/anomalies` | `from,to,currency` | `AnomalyRowDTO[]` | 8 |

### Schemas (Pydantic / TS)

```ts
MetaDTO            { data_updated_at: string; source_rows: number; invoice_months: string[]; export_ok: boolean }
ScorecardDTO       { invoice_month: string; net_cost_mtd_brl: number; net_cost_mtd_usd: number;
                     gross_cost_mtd_brl: number; credits_mtd_brl: number; prev_month_net_brl: number;
                     mom_pct: number; run_rate_eom_brl: number; days_elapsed: number; days_in_month: number;
                     budget_brl: number; budget_used_pct: number; run_rate_vs_budget_pct: number;
                     effective_savings_pct: number }
DailyPointDTO      { usage_date: string; net_cost_brl: number; net_cost_usd: number; ma7_brl: number }
ServiceCostDTO     { service_description: string; net_cost_brl: number; pct_of_total: number }
MonthlyServicePointDTO { invoice_month: string; service_description: string; net_cost_brl: number }
ReconRowDTO        { invoice_month: string; gross_cost_brl: number; credits_total_brl: number;
                     net_cost_brl: number; matches_invoice: boolean }
BudgetDTO          { budget_brl: number; net_cost_mtd_brl: number; run_rate_eom_brl: number;
                     budget_used_pct: number; run_rate_vs_budget_pct: number; headroom_brl: number;
                     projected_breach_date: string | null; thresholds: {pct:number; value_brl:number}[] }
BurndownPointDTO   { usage_date: string; net_cost_cum_brl: number; budget_brl: number }
ForecastMonthDTO   { invoice_month: string; is_actual: boolean; value_brl: number;
                     forecast_lo_brl: number | null; forecast_hi_brl: number | null }
LabelCoverageDTO   { invoice_month: string; pct_app: number; pct_environment: number; pct_managed_by: number;
                     net_cost_total_brl: number }
CoverageWeekDTO    { week_start: string; pct_app: number; pct_environment: number; pct_managed_by: number }
AppAllocationDTO   { rows: {label_app: string; net_cost_brl: number}[];
                     unallocated_net_cost_brl: number; unallocated_pct: number }
EnvCostDTO         { label_environment: string; net_cost_brl: number }
ChargebackReadinessDTO { coverage_pct: number; ready: boolean;
                     criteria: {key: string; label: string; status: "ok"|"partial"|"missing"}[] }
SkuCostDTO         { service_description: string; sku_description: string; pricing_unit: string;
                     net_cost_brl: number; usage_qty: number; unit_cost_brl: number }
NewSkuDTO          { service_description: string; sku_description: string; first_seen_date: string }
CommitmentCoverageDTO { covered_pct: number; eligible_spend_brl: number; on_demand_spend_brl: number;
                     cud_reeval_threshold_brl: number }
RecommendationDTO  { title: string; evidence: string; savings_min_brl: number; savings_max_brl: number;
                     effort: "baixo"|"médio"|"alto"; status: "aberta"|"em andamento"|"fechada" }
RecommendationsDTO { items: RecommendationDTO[]; potential_savings_min_brl: number; potential_savings_max_brl: number }
UnitEconomicsDTO   { cost_per_deploy_brl: number; deploy_count: number; cost_per_1k_req_brl: number;
                     cost_per_gib_log_brl: number; cost_per_day_avg_30d_brl: number;
                     cost_per_vcpu_s_brl: number; cost_per_gib_s_brl: number; cpu_mem_ratio: string }
UnitSeriesPointDTO { usage_date: string; value_brl: number }
WaterfallStepDTO   { label: string; value_brl: number; kind: "start"|"decrease"|"end" }
AnomalyRowDTO      { usage_date: string; service_description: string; net_cost_brl: number;
                     avg_28d_brl: number; z_score: number; deviation_abs_brl: number; deviation_pct: number }
```

## Design (herda o DP6 Design System)

- Ubuntu / Ubuntu Mono (figuras); cards flat 1px + raio 8px sem sombra; régua amarela 2px só
  no tile de orçamento; header preto fixo; amarelo ≤ 8%; formatação PT-BR (`R$ 1.284,93`).
- Paleta de gráficos: azul `#1A365D` neutro/net, verde `#059669` positivo, cinza `#8A8F96`
  "Outros", vermelho `#D64500` **só** anomalia/negativo (com rótulo), roxo `#6B46C1` só
  isolado (crédito). Tema claro + escuro por tokens.
- Componentes de gráfico em `apps/web/src/charts/` sobre Recharts — Area, HBar, StackedBar,
  Waterfall, Donut, Gauge, Sparkline. Legenda sempre p/ ≥ 2 séries + rótulo direto + tabela.

## CI/CD (Fase 5)

- `apps/api`: lint (`ruff`) + `pytest` + build imagem + deploy Cloud Run via WIF (`gh-apply-billing-platform`).
- `apps/web`: `biome check` + `tsc` + `vite build` + build imagem + deploy.
- Gera OpenAPI da API no CI e checa que `apps/web/src/types` está em dia.

## Critério de verificação (fim a fim)

1. `apps/api` sobe local (`uv run`), `/api/meta` responde com `data_updated_at` da view.
2. Cada um dos 21 endpoints responde 200 com o schema acima contra as `rpt_*` reais.
3. `apps/web` (`pnpm dev`) renderiza as 8 telas; filtros na URL; tema claro/escuro.
4. Reconciliação: `/api/reconciliation` bate (tolerância R$ 0,01) com `SUM(cost)` por
   `invoice.month` na view de origem.
5. `/api/budget` usa `monthly_budget_brl` da config; thresholds 50/80/100/120%.
6. Após deploy: IAP barra e-mail fora da allowlist; dentro da allowlist abre o painel.
7. `X-Data-Updated-At` presente; cache de 30 min observável (2ª chamada não roda job BQ).

## Decisões em aberto

1. **Orçamento R$ 20 × R$ 50** — alinhar com `polaris-cost-control` (plano, item 15).
2. **Fonte das recomendações (aba 6)** — `recommendations.yaml` curado vs. job de Asset
   Inventory vs. endpoint do Atlas.
3. **`deploy_count`** — config fixa vs. job que conta revisões do Cloud Run no Cloud Logging.
4. **"Dar baixa" em anomalia** — só UI no MVP, ou já uma coleção Firestore?
5. **IAP** — o `dp6-ci-polaris` já tem OAuth brand configurado (o Atlas usa); confirmar reuso.
6. **Nome dos serviços Cloud Run** — `billing-platform-api-prod` / `billing-web-prod` (segue o padrão
   sufixado do Atlas).
7. **Dataset das views** — `billing_platform_mart` ou um `billing_platform_reporting` dedicado.
