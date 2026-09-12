# Spec 004 — UX dos dashboards (modelo transversal + Visão Geral)

Status: 🟡 rascunho para revisão · Data: 2026-09-10
Depende de: `specs/002` (IA de 8 abas), `specs/003` (app, endpoints), `docs/data-contract.md`
Referência de DS: `atlas/docs/frontend/{design-system,patterns,behaviors,ui-ux-rules}.md`
Referência visual: `mock/canvas/*.dc.html` (canvas aprovado) e `mock/index.html`

## Objetivo

O painel está no ar (`billing-platform-api-dev`, Cloud Run + IAP). A Visão Geral renderiza com dado
real; as outras 7 abas têm API conectada mas UI stub. Antes de construir as 7, travar o
**modelo transversal** — semântica de período, comportamento dos filtros, fundação de design
system — e aplicá-lo por inteiro à **Visão Geral** como *template* a replicar.

## Escopo

- **Modelo de período** (§1) e **comportamento dos filtros** (§2) — regras válidas para as 8 abas.
- **Fundação de design system** (§3) — alvo (espelhar o Atlas) + deltas de dashboard.
- **Visão Geral detalhada** (§4) — layout item a item, o template.
- **Checklist de replicação** (§5) — o que fazer em cada uma das 7 abas restantes.

## Fora de escopo

- Construir as 7 abas restantes (rodadas seguintes, seguindo §5).
- Escrita / "dar baixa" em anomalia, automação de recomendações, `deploy_count` automático
  (seguem fora, `specs/003`).

---

## 1. Modelo de período

### Seletor global "Período"

Um único controle global. Presets:

| Preset | Janela resolvida (`from`/`to`) |
|---|---|
| **Mês corrente** *(default)* | dia 1 do mês corrente → hoje |
| Últimos 30 dias | hoje−29 → hoje |
| Últimos 90 dias | hoje−89 → hoje |
| Este ano | 1º/jan do ano corrente → hoje |
| Personalizado | 2 datas escolhidas pelo usuário |

Estado na URL: `period=<preset>` **ou** `from=YYYY-MM-DD&to=YYYY-MM-DD` (personalizado).
Helper no front: `resolveWindow(filters) → {from, to}`.

### Widgets *janela* × widgets *mês-âncora*

| Tipo | Reage ao Período? | Reage a Serviço/Ambiente/App? | Widgets |
|---|---|---|---|
| **Janela** (`usage_date`) | **sim** | sim | tendência diária, custo por serviço, custo por SKU, série de unit economics, sparkline/drill de anomalia, cobertura semanal |
| **Mês-âncora** (`invoice_month`) | **não** — janela fixa própria + caption | **sim** | scorecard, orçamento + burn-down, previsão, reconciliação, cobertura mensal, showback mensal, waterfall, cobertura de compromissos |

Motivo: scorecard/orçamento/reconciliação são "a conta do mês" e batem com a fatura
(`invoice_month`); mudam o recorte (serviço/app) mas não a régua temporal. Cada um exibe sua
janela na caption ("Mês corrente · MTD 10 dias", "Últimos 3 meses de fatura").

`invoice_month` (chave de reconciliação, pode divergir do mês de `usage_start_time`) × `usage_date`
(séries analíticas) — documentado; a reconciliação **só** usa `invoice_month`.

---

## 2. Comportamento dos filtros

### Filtros globais (na URL, `useSearchParams`)

`period` / `from` / `to` · `service` · `environment` · `app` · `currency` (`BRL|USD`).

- **Todos aplicam a todos os widgets**, inclusive os executivos ("tudo parametrizado").
- `currency` é **só display** (troca colunas `_brl`/`_usd`), nunca `WHERE`.
- Vazio / "Todos" = sem filtro. Recorte que zera linhas → `EmptyState` no widget, **não** erro.
- Valores das listas vêm de **`GET /api/dimensions`** (§5 API), não hardcoded.
- `localStorage` `pcm:filters` guarda o último `period` + `currency`; só pré-preenche quando a
  URL não traz nada (links compartilhados sempre vencem). Convenção de chave `pcm:` (espelha
  `atlas:` do Atlas).

### `FilterBar` (componente único)

Sticky, logo abaixo da topbar, em **toda rota**. Ordem: Período · Serviço · Ambiente · App ·
Moeda · (à direita) "Limpar filtros" quando algo setado. "Personalizado" no Período revela 2
campos de data num popover.

---

## 3. Fundação de design system

### Alvo: espelhar o `atlas/apps/frontend`

`dp6-billing-platform` continua **standalone** (ADR-001) — **espelha, não importa**. Alvo final:

- **Tailwind v4** (`@import "tailwindcss"` + `@tailwindcss/vite`, sem `tailwind.config`) +
  **shadcn** (`base-nova`, `baseColor: neutral`, `cssVariables: true`, ícones **lucide**).
- **Tokens** — bloco do `atlas/apps/frontend/src/index.css`: `@theme inline` (escala
  `--text-label/body/subtitle/title/display` com line-height; `--radius` = `0.3125rem`/5px,
  escala derivada achatada; `--shadow-elevation-1/2`; `--font-sans` Ubuntu), `:root` (claro) /
  `.dark` (escuro), `@custom-variant dark (&:is(.dark *))`. `--primary #FFB302` (**só
  preenchimento, nunca texto**), `--primary-2`, `--glow`, `--ease-dp6`. `--accent-blue #1a365d`
  / `--accent-purple #6b46c1` / `--accent-green #059669` / `--accent-orange #f97316`.
  `--status-{ok,warn,error,info}` (fill) + `-foreground` (texto, por tema, ≥4.5:1).
- **Tema: dark por padrão.** `light` persistido em `localStorage` `pcm:theme`; **script
  bloqueante** no `index.html` aplica `.dark` antes do 1º paint. `ThemeToggle` só na topbar.
- **Dados: TanStack Query.** `lib/http.ts` (→ `ApiError` com `.status`/`.body`), `lib/api/*.ts`
  (tipado), `features/*/hooks.ts` (`useQuery`). `staleTime` 30s (a API já cacheia 30 min).
- **Componentes** (portados/enxugados do Atlas, sem dependência): `PageHeader`,
  `SectionHeading`, `MetricGrid`/`MetricTile`, `Panel`, `LoadingState`, `ApiErrorNotice`
  (adaptado ao shape `{error:{code,message}}`), `EmptyState`/`EmptyStateRow`, `WarningCallout`,
  `StatusBadge`, `ThemeToggle`, `RefreshButton`, `ChoiceToggle`, `DateField`,
  `SortableTableHead`, `PaginationBar`, `CacheStalenessBadge`, `ChartTooltip`.
  Hooks: `useTheme`, `useTableFilterSort`, `usePagination`, `useChartTooltip`.
- **Charts** (`src/charts/`, Recharts, paleta por token, dark+claro, `ChartTooltip`):
  `AreaTrend`, `HBarList`, `ComboChart` (barra+linha), depois `StackedBar/Donut/Sparkline/
  Waterfall/Gauge` com suas telas.
- **`lib/format.ts`** — convenções do Atlas: `formatBrl`/`formatUsd` (6 casas se `<0,01`),
  `formatPct` (com sinal + plana), `formatNumber`, `formatDate`, `formatRelativeToNow`,
  `monthLabel`, `dayLabel`. Idioma pt-BR.
- **Layout** — topbar preto sticky (logo, `CacheStalenessBadge`, `ThemeToggle`), `FilterBar`
  sticky, tab nav (régua 2px amarela), `<main class="max-w-[1400px] mx-auto ...">`, footer.
  Sem sidebar (o Atlas tem; aqui é tab nav — delta registrado).

### Deltas de dashboard (vs. o Atlas, que é Metabase-denso)

Um dashboard FinOps executivo ganha **um respiro a mais**: linha de KPI proeminente,
gráficos com altura real, `gap-8` entre seções. Mantém do Atlas: card `p-4`–`p-5`, célula
`p-2`, **≤2 acentos por tela**, **estado nunca só por cor** (ícone + texto), sem gradiente de
tela cheia, `box-shadow` pesado proibido (profundidade por borda), transições ≤300ms,
`prefers-reduced-motion` respeitado, um `<h1>` por rota via `PageHeader`, tabelas left-align
(números right), ordenação via `SortableTableHead` + `useTableFilterSort`.

### `apps/web/DESIGN.md`

Versão curta e operacional deste §3 dentro do repo. Regra de sincronização: token muda →
`index.css` + `DESIGN.md` no mesmo PR.

### Faseamento (decidido 2026-09-10)

- **PR A**: re-base de **tokens/visual** do `index.css` espelhando o Atlas (valores, escala,
  radius, spacing, dark-default + script), mantido o stack leve atual (inline + cliente
  `useApi`); `FilterBar` + `useFilters` + `/api/dimensions` + endpoints parametrizados +
  Visão Geral reconstruída com componentes locais no formato do Atlas.
- **PR B**: swap de framework — Tailwind v4 + shadcn + TanStack + portar o catálogo 1:1, com
  esta spec como contrato.

---

## 4. Visão Geral — detalhamento (o template)

Segue `mock/canvas/Main.dc.html`. Endpoints e colunas: `docs/data-contract.md` §3.

1. **`PageHeader`** — eyebrow `"<Mês> <Ano> · mês corrente (MTD, N dias)"` · `<h1>` "Visão
   geral" · descrição ("Custo faturado do projeto `dp6-ci-polaris` a partir do billing
   export. Fatura em BRL; USD pela taxa da linha."). Sem "Voltar" (é a home).
2. **Tira de saúde dos dados** — `Panel`/callout full-width: bolinha `--status-ok`/`--status-warn`
   + `"Export íntegro · última carga há Xh · <N> linhas · <M> meses · sem lacunas"`. De
   `/api/dimensions` (+ `/api/meta`). Âmbar se `data_updated_at` > `freshness_threshold_hours`.
3. **Scorecard** — `MetricGrid` de **6** `MetricTile` (recalcula com Serviço/Ambiente/App):
   | Tile | Valor | Sub |
   |---|---|---|
   | Custo líquido · MTD | `net_cost_mtd_brl` | `net_cost_mtd_usd` (mono) |
   | Run-rate fim de mês | `run_rate_eom_brl` | "projeção linear · N de M dias" |
   | Δ vs. mês anterior | `mom_pct` (tom ok/bad pelo sinal) | "run-rate vs. R$ X (mês)" |
   | Créditos no mês | `credits_mtd_brl` | "só DISCOUNT (Cloud Run)" |
   | **Custo vs. orçamento** (`accent` = régua amarela 2px) | `budget_used_pct` | "de R$ 20 · run-rate Y%" + `StatusBadge` "✓ dentro do orçamento" / "▲ acima no ritmo atual" |
   | Economia efetiva | `effective_savings_pct` | "só créditos · sem desconto negociado" |
4. **Linha** `grid grid-cols-[1.55fr_1fr] gap-4` (colapsa a 1 coluna `< lg`):
   - `Panel` "Custo líquido diário" — `AreaTrend` (área `net` + linha tracejada MA7),
     `ChartTooltip` crosshair, caption "Área = custo do dia · linha tracejada = média móvel 7
     dias · <janela do período>".
   - `Panel` "Custo por serviço" — `HBarList` (`net` por serviço desc + `pct_of_total`;
     Cloud Run domina), legenda Cloud Run / BigQuery / Outros.
5. **`Panel` "Reconciliação com a fatura"** — tabela dos 3 últimos `invoice_month`: Mês ·
   Custo bruto · Créditos · Líquido (bold) · Confere (`StatusBadge` ✓/✗). Linha do mês
   corrente marcada "(parcial)".

Estados: `PageHeader` + tira de saúde sempre renderizam; cada `Panel` mostra
`LoadingState` / `ApiErrorNotice` / `EmptyState` no corpo.

---

## 5. API — mudanças

| Endpoint | Mudança |
|---|---|
| `GET /api/dimensions` *(novo)* | `{ services[], environments[], apps[], invoice_months[], data_updated_at, currency_rate, export_ok, source_rows }` — `SELECT DISTINCT` em `rpt_cost_daily` + `agg_billing_cost_monthly`. DTO `DimensionsDTO`. |
| `GET /api/scorecard` | + `service`/`environment`/`app`. Com filtro: computar de `rpt_cost_monthly` (mês corrente + anterior) + `rpt_cost_daily` (MTD) com `WHERE`. Sem filtro: caminho rápido pela view `rpt_cost_scorecard` (mantida). |
| `GET /api/reconciliation` | + `service`/`environment`/`app` → só adicionar `WHERE` (já agrupa por `invoice_month`). Marcar mês corrente "(parcial)". |
| `GET /api/budget`, `GET /api/forecast` | + os 3 filtros, cálculo filtrado. |
| `GET /api/cost/daily`, `/api/cost/by-service` | já aceitam filtros; o front passa `from`/`to` já resolvidos. |
| `fixtures.py` | aceitar os novos parâmetros sem quebrar (modo mock pode ignorar o recorte). |

---

## 6. Checklist de replicação (7 abas restantes)

Para cada aba, numa rodada própria:
1. Classificar cada widget: **janela** (reage ao Período) ou **mês-âncora** (ignora, caption
   própria) — §1.
2. Passar os filtros globais (Serviço/Ambiente/App/Moeda) por todos os widgets — §2.
3. Montar com `PageHeader` + `Panel` + charts compartilhados + componentes de estado — §3.
4. Adicionar a `src/charts/` o componente de gráfico que faltar (paleta + `ChartTooltip`).
5. Parametrizar no `apps/api` os endpoints que ainda não aceitam o recorte.
6. Atualizar esta spec com a subseção da aba (layout item a item, como §4).

---

## Critério de verificação

1. `apps/web`: `npm run build` + `tsc` verdes; `apps/api`: `pytest` (mock) verde.
2. **Mock**: 8 abas renderizam; `FilterBar` funciona; trocar preset de período muda a janela
   da área diária; **dark por padrão** + toggle persiste; filtros na URL (link compartilhável).
3. **Dev real**: abrir a URL do IAP → Visão Geral com número; mudar **Ambiente** → scorecard
   + área + barras recalculam; `/api/dimensions` retorna a lista real de serviços;
   reconciliação bate (R$ 0,01) com a fatura do console num mês fechado.

## Decisões em aberto

- Nomes finais dos componentes portados na PR B (seguir os do Atlas 1:1).
- Se o scorecard sempre computa (uniforme) ou mantém o caminho rápido pela view sem filtro.
- Heatmap de calendário (aba Tendência) — incluir ou cortar (herdado da `specs/002`).
