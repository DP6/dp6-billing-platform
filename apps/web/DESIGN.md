# Design system — apps/web

Fonte canônica da iniciativa: `~/ci-polaris/DP6-Design-System.md`, resolvida pra este repo via
`~/ci-polaris/MAPA-DE-TOKENS.md` (o que fazer com token sem equivalente dos dois lados,
conflitos já identificados) — ver `docs/adr/ADR-011-fonte-design-system-ci-polaris.md`.
`dp6-billing-platform` é standalone (ADR-001) — **deriva da fonte canônica, não importa código
de outro repo**. Contrato completo: `specs/004-ux-dashboards.md` §3.

## Regra de sincronização

Nenhum token muda de valor em `src/index.css` sem este arquivo ser atualizado no mesmo PR.
`src/index.css` é a fonte de verdade dos *valores* deste repo; mudança futura de token deve
consultar `~/ci-polaris/MAPA-DE-TOKENS.md` antes de decidir valor, não herdar de outro repo em
silêncio.

## Tokens (`src/index.css`)

- **Tema por classe `.dark` em `<html>`.** Dark é o padrão; só persiste `"light"` em
  `localStorage` `pcm:theme`. Script bloqueante no `index.html` aplica `.dark` antes do 1º paint.
  `src/lib/useTheme.ts` sincroniza o React e o toggle. Sem `@media prefers-color-scheme`.
- **Nomes canônicos** = os do Atlas: `--background` `--foreground` `--card` `--muted(-foreground)`
  `--border(-strong)` `--primary` (`#FFB302`, **só preenchimento, nunca texto**) `--primary-2`
  `--ring` `--glow` `--status-{ok,warn,error,info}` + `-foreground` (texto, ≥4.5:1 por tema)
  `--accent-{blue,purple,green,orange}` `--radius` (5px) `--radius-pill` `--ease-dp6`
  `--shadow-elevation-{1,2}` `--text-{label,body,subtitle,title,display}` (12/14/16/20/28).
- **Paleta de gráfico:** `--chart-net` = `--accent-blue`; `--chart-alt` = `--accent-green`;
  `--chart-other` neutro; `--chart-alert` = status error; `--chart-credit` = `--accent-purple`.
  Só o par azul/verde como série categórica (validado `dataviz`). Vermelho só status.
- **Régua amarela em canto (`.dp6-corner`):** um "L" 2px `var(--primary)` no topo-esquerdo
  de **todo** `.card` / `.panel` / `.chart-well` / `MetricTile` (via `::before` no
  `index.css`). Substitui a borda-topo cheia; a prop `accent` do `MetricTile` foi removida.
- **Captions descrevem o widget e o cálculo — nunca afirmam um fato do dado atual.** Nada de
  "Cloud Run concentra a maior parte" ou "só DISCOUNT"; "média móvel 7 dias" / "projeção
  linear" são ok.
- **Aliases legados** (`--bg`, `--ink`, `--c-net`, `--ok`…) — mantidos enquanto os componentes
  antigos não migram (PR B: Tailwind v4 + shadcn). Não usar em código novo.

## Regras (de `atlas/docs/frontend/ui-ux-rules.md`, com deltas de dashboard)

- Um `<h1>` por rota via `PageHeader`, fora dos ramos de loading/erro.
- Seções são `<h3>` reais (`Panel` traz o `<h3>`); nada de `<div>`/`<p>` fazendo de título.
- Peso 700 ou 500 — **nunca 600** (Ubuntu não tem). Corpo ≥ 14px.
- **Estado nunca só por cor** — `StatusBadge` = ícone + texto.
- **≤ 2 acentos por tela.** `--primary` amarelo só preenchimento.
- `box-shadow` pesado proibido (profundidade por borda). Sem gradiente de tela cheia.
- Transições ≤ 300ms; `prefers-reduced-motion` respeitado (reset em `index.css`).
- Tabelas left-align (números right).
- **Delta dashboard:** um respiro a mais que o Atlas (Metabase-denso) — linha de KPI
  proeminente, gráficos com altura real, `gap: 32` entre seções. Mantém card `p: 20`,
  célula de tabela `p: 8/10`.
- **Sem sidebar** — navegação por tab nav (régua 2px amarela no ativo). Delta registrado.

## Componentes (`src/components/ui.tsx`, `src/charts/`)

`PageHeader` · `Panel` · `Card` · `MetricGrid`/`MetricTile` · `StatusBadge` · `Chip` ·
`DataTable` · `LoadingOrError`. Charts: `AreaTrend`, `HBars`. Paleta lê os tokens resolvidos
do `:root`/`.dark` via `chartColor()`.

> PR B porta o catálogo do Atlas 1:1 (`PageHeader`, `MetricTile`, `Panel`, `ComboChart`,
> `ChartTooltip`, estados, `SortableTableHead` + `useTableFilterSort`, `DateField`,
> `ChoiceToggle`, `ThemeToggle`) sobre Tailwind v4 + shadcn + TanStack Query.
