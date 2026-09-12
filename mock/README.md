# mock/ — referência visual do dashboard

`index.html` — arquivo único, sem build, abre em qualquer navegador. É **playground e
referência visual** para `apps/web/` (a implementação real em React + Vite + Recharts).
Não é o app; não tem back-end.

## O que ele cobre

As 4 abas + Showback placeholder da `specs/002` C, com os widgets da matriz de
`docs/data-contract.md`:

| Aba | Widgets |
|---|---|
| Visão geral | scorecard (5 tiles) · área custo diário + média 7d · barras custo por serviço · faixa de reconciliação |
| Tendência | empilhado mensal por serviço · Δ mês a mês (com run-rate fantasma) · ritmo acumulado |
| Serviços & SKUs | barras serviço→SKU · tabela de custo unitário · callout de SKU novo |
| Anomalias | tabela de ocorrências + sparkline por linha (piso z>3 **e** > R$ 1/dia) |
| Showback | placeholder + donuts de cobertura de label |

## Dados

Números reais da validação de 2026-09-09 (`validation/RESULTADOS.md`): R$ 26,41 em ~2 meses,
Cloud Run = 82%, pico de 21–26/ago, créditos −0,57, cobertura de label 4–10%. Series diárias
e de SKU são aproximações a partir da consulta 02. Marcado "amostra" no cabeçalho.

## Decisões de design (para o app herdar)

- **DP6 Design System** (`polaris-heap/DP6-Design-System.md`): Ubuntu / Ubuntu Mono (figuras),
  cards flat 1px + raio 8px sem sombra, régua amarela 2px só no tile de orçamento,
  formatação PT-BR (`R$ 1.284,93`), header preto fixo, amarelo `#FFB302` ≤ 8% da tela.
- **Tema claro + escuro** por tokens (`:root` / `prefers-color-scheme` / `[data-theme]`),
  toggle no header, persistido em `localStorage`.
- **Paleta de gráficos** — validada com o `dataviz/scripts/validate_palette.js`:
  - `azul #1A365D` / `verde #059669` (dark: `#63B3ED` / `#34D399`) — **único par usado como
    série categórica**; passa CVD com folga (ΔE ~29).
  - `roxo`/`rosa` do DP6 **reservados** (colidem entre si e com azul sob daltonismo) — só
    aparecem isolados (ex.: roxo no segmento de crédito da reconciliação).
  - `vermelho #D64500` — **só status/anomalia**, sempre com rótulo (`z 4.1`), nunca série.
  - `amarelo` — só acento de marca, nunca série.
  - Toda série multi-cor: legenda + rótulo direto + "ver tabela".
- **Charts:** SVG inline gerado por JS a partir de arrays de dados no topo do `<script>` — é
  de propósito, serve de mapa "dado → marca" para reimplementar em Recharts.
- **Hover:** crosshair+tooltip na área diária e no ritmo acumulado; tooltip por barra em
  custo por serviço.

## Abrir

```bash
xdg-open mock/index.html    # ou wslview mock/index.html no WSL
```
