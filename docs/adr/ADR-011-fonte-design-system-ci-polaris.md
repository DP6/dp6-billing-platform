# ADR-011 — Fonte do design system é `ci-polaris`, não `atlas`

Data: 2026-09-24 · Status: aceito

## Contexto

`apps/web/DESIGN.md` declarava espelhar `atlas/apps/frontend/src/index.css` — herança direta
da cópia mecânica do `polaris-cost-model` (fork estrutural, ver ADR-001). O `polaris-cost-model`
já havia corrigido essa mesma dependência textual entre dois repos standalone na sua própria
`ADR-009-fonte-design-system-ci-polaris.md` (2026-09-12), mas este repo, por ter forkado antes
dessa correção (ou sem herdá-la no fork), ficou com o texto antigo — drift real entre dois repos
irmãos que deveriam seguir a mesma fonte.

## Decisão

Mesma decisão da ADR-009 do `polaris-cost-model`, aplicada aqui: `~/ci-polaris/DP6-Design-System.md`
passa a ser a fonte canônica do padrão visual deste repo, com `~/ci-polaris/MAPA-DE-TOKENS.md`
resolvendo a correspondência entre os tokens canônicos e os nomes/valores usados em
`apps/web/src/index.css`. `apps/web/DESIGN.md` atualizado pra apontar pra lá em vez de
`atlas/apps/frontend/src/index.css`.

## Alternativas consideradas

- **Manter o Atlas como fonte** — descartada pelo mesmo motivo já registrado na ADR-009 do
  cost-model: perpetua a dependência textual entre repos standalone.
- **Continuar como está, já que o repo funciona** — descartada porque o objetivo desta rodada é
  justamente parar de deixar repos-irmãos divergirem silenciosamente da mesma convenção (ver
  `~/ci-polaris/CLAUDE.md`, "Convenções cross-repo").

## Consequências

- Nenhuma ruptura de nome ou valor nos tokens já existentes em `apps/web/src/index.css` — só a
  referência de fonte no `DESIGN.md` muda.
- Mudança futura de token deste repo deve consultar `~/ci-polaris/MAPA-DE-TOKENS.md` antes de
  decidir valor, mesma regra já valendo para `polaris-cost-model` e `polaris-atlas`.
