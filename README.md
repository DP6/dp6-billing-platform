# dp6-billing-platform

Modelagem analítica de custo de **toda a conta de faturamento** (`008012-F93445-DFD798`,
"DP6 Self Billing (Voucher)", BRL — todos os projetos, não só um) a partir do billing export do
GCP. Roda no mesmo projeto GCP do `polaris-cost-model` (`dp6-ci-polaris`), como repo irmão
independente (bootstrap/CI/CD próprios).

Fork estrutural do `DP6/polaris-cost-model` — mesma arquitetura (Dataform, marts, reporting,
app FastAPI+React, Terraform, CI/CD develop→main), mudando a origem do dado (tabela bruta do
billing export em vez da view de um único projeto) e o grão (ganha `project_id`/`project_name`
como dimensão, já que agora há múltiplos projetos nos dados). Ver o plano completo:
`~/.claude/plans/preciso-criar-uma-vers-o-encapsulated-willow.md`.

## Estado (2026-09-24)

**Em produção, com pipeline e apps rodando de verdade** — o skeleton dos primeiros dias já foi
superado; ver `CHANGELOG.md` para a lista completa de fases entregues desde então.

Já feito (além do que já estava descrito na cópia inicial):

- **Bootstrap aplicado** no GCP — SAs, WIF, bucket de state e repo Dataform existem; fluxo
  `develop → main` exercitado dezenas de vezes (72 PRs mergeadas até aqui), com promoção
  automática `develop→main` mantendo os dois em sincronia.
- **Acesso à origem concedido** — o pipeline lê a tabela bruta de faturamento normalmente
  (backfill histórico e cargas incrementais rodando); fix posterior de `dataOwner` na SA do
  Dataform (`6c794d9`) resolvido.
- **Fase 4 — apps**: filtro por projeto implementado na UI (`ProjectFilter`/`project_id` em
  `VisaoGeral.tsx`, `App.tsx`, `Adm.tsx`), textos e fixtures adaptados, filtros persistentes
  entre telas + drill-down por clique em gráfico, forecast com banda de confiança real,
  importação de orçamentos nativos do GCP Billing Budgets.
- **Login OAuth estilo `polaris-atlas`** implementado por cima do IAP (gate de sessão
  desacoplado da autorização, que continua vindo da identidade do IAP) + acesso por projeto
  com 3 vias de cadastro (projeto/pessoa/grupo) e admin autogerenciável.
- **Backfill de custo histórico** jan–jun/2026 carregado via CSV do self billing voucher
  (`docs/adr/ADR-010-backfill-historico-self-billing-csv.md`), unido ao fato via `UNION ALL`.
- Relatório semanal por e-mail com custo histórico total e ritmo do mês, visual com
  cards/gráficos.

Pendente de verdade (o resto da lista antiga já foi resolvido):

- **Fase 1 — validação em escala de conta inteira**: `validation/RESULTADOS.md` ainda reflete
  a rodada de 2026-09-09 **filtrada por um único projeto** (`dp6-ci-polaris`), herdada do
  `polaris-cost-model` — nunca foi refeita contra a tabela bruta sem filtro. Por isso os
  parâmetros de negócio em `includes/constants.js` (`ANOMALY_Z`, `MONTHLY_BUDGET_BRL`,
  `CUD_REEVAL_THRESHOLD_BRL`, `DEPLOY_COUNT_PER_MONTH`) continuam marcados com TODO/herdados e
  **não calibrados** para a escala da conta inteira — ver ADR-005 (ainda com status "NÃO
  válido aqui").
- Rulesets/branch protection: não configurados (o `polaris-cost-model` também não tem).

## Dataform — rodar local

```bash
cd ~/ci-polaris/dp6-billing-platform
npx -y @dataform/cli@3.0.0 compile          # 23 ações, verificado em 2026-09-11
```

## Estrutura

Ver `CLAUDE.md` para a árvore completa e convenções do repo.
