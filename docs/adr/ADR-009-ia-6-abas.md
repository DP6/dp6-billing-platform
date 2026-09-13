# ADR-009 — IA de 8 para 6 abas

Data: 2026-09-12 · Status: aceito

## Contexto

`specs/002-camada-de-consumo-e-entrega.md` fixou a IA em 8 abas ("canvas aprovado
com 8 abas"), herdada junto com o fork do `polaris-cost-model`: Visão geral,
Orçamento, Tendência, Alocação, Serviços & SKUs, Otimização, Unit economics,
Anomalias — 7 delas como `Stub` (só JSON cru dos endpoints já ligados).
`specs/005-telas.md` (rascunho de 2026-09-10) revisou essa IA para **6 abas**,
fundindo Orçamento dentro de Visão Geral e Otimização + Unit economics numa aba
nova "Eficiência & economia", mas essa revisão nunca chegou a ser aplicada no
código — o `App.tsx` seguiu com as 8 rotas antigas.

Na prática o conteúdo de Orçamento (burn-down, previsão, tiles de orçamento) já
tinha sido implementado dentro de `VisaoGeral.tsx` antes desta rodada — a aba
`/orcamento` sobrevivia só como rota redundante, sem conteúdo próprio.

Esta rodada aplicou a mesma consolidação no `polaris-cost-model` (ver
`polaris-cost-model/docs/adr/ADR-010-ia-6-abas.md`), que além disso decidiu **não**
adicionar o filtro de seletor de projeto que este repo já tem (`?project`, commit
`32b5b2c`) — aquele repo é escopado a 1 projeto só. Aqui a decisão não se aplica: o
filtro de projeto já existe e continua como está.

## Decisão

Aplicar a IA de 6 abas de `specs/005-telas.md` §0: remover a rota `/orcamento`
(conteúdo já vive em `VisaoGeral.tsx`, sem perda) e fundir `/otimizacao` +
`/unit-economics` numa única `/eficiencia` ("Eficiência & economia"), por ora como
`Stub` combinado dos endpoints que as duas telas antigas já ligavam — a tela
visual completa da spec 005 §5 (Waterfall, Gauge) fica para depois.

## Alternativas consideradas

- **Manter as 8 abas** — mais simples, mas perpetua uma rota morta (`/orcamento`)
  e a spec 005 já documentada como a IA revisada nunca vira código.

## Consequências

- `Orcamento.tsx`, `Otimizacao.tsx`, `UnitEconomics.tsx` apagados; `Eficiencia.tsx`
  novo substitui os 2 últimos.
- `polaris-cost-model` e `dp6-billing-platform` voltam a ter a mesma IA de rotas.
