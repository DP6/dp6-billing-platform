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

## Estado (2026-09-12)

**Código e repositório prontos; nada aplicado no GCP ainda.**

Já feito:

- Estrutura de diretórios e todos os arquivos copiados e renomeados (datasets, SAs, secrets,
  nome do repo Dataform, imagem/serviço Cloud Run, tag `billing_platform`).
- Origem do dado repontada para a tabela bruta
  `dp6-billing-voucher.billing_export.gcp_billing_export_resource_v1_008012_F93445_DFD798`
  (declaration `definitions/sources/billing_export_resource.sqlx`).
- `docs/adr/ADR-003-acesso-direto-tabela-bruta.md` reescrita documentando a divergência do
  padrão de authorized view do repo-irmão.
- **Grão com projeto**: `project_id`/`project_name` no fato, no rollup mensal, na view de
  anomalia (z-score por projeto × serviço), na assertion de reconciliação e em 6 das 13 views
  de `reporting/`. As outras 7 ficaram de fora **de propósito** — são cards/gauges de 1 linha
  ou catálogo global de SKU; o motivo está na `description` de cada `.sqlx`.
- **Verificado**: `dataform compile` → 23 ações, sem erro. `terraform fmt -check -recursive`
  limpo e `terraform validate` OK em `bootstrap`, `environments/dev` e `environments/prod`.
- **GitHub**: repo criado (público), branches `develop` (default) e `main`, Environments
  `dev-deploy` (branch `develop`) e `prod-deploy` (branch `main`) com reviewers obrigatórios e
  `can_admins_bypass=false`. PR #1 aberta com todo o conteúdo, mirando `develop`.

Pendente:

- **Bootstrap no GCP** — `terraform apply` em `terraform/bootstrap/` nunca rodou. Enquanto não
  rodar, não existem as SAs nem o WIF, e os checks `plan (dev)`/`plan (prod)` da PR falham no
  passo de auth (é esperado, não é bug de código). Depois do apply: rodar o
  `github_secrets_cmd` para setar os 4 secrets de WIF no repo.
- **Acesso à origem** — grant da TI no dataset `billing_export` para
  `sa-billing-platform-dataform@dp6-ci-polaris` (texto pronto em
  `terraform/bootstrap/outputs.tf` → `external_access_request`). A SA precisa existir (ou seja,
  bootstrap aplicado) para o grant valer.
- **Fase 1 — validação**: `validation/*.sql` ainda não foram rodadas contra a tabela nova.
  Os parâmetros de negócio em `includes/constants.js` (orçamento, limiares de anomalia,
  `DEPLOY_COUNT_PER_MONTH`) estão marcados como herdados do repo-irmão e **não valem** na
  escala da conta inteira — ver ADR-005.
- **Fase 4 — apps**: `api`/`web` ainda têm textos e fixtures do `polaris-cost-model` e não
  expõem filtro por projeto na UI, apesar das views já terem a dimensão.
- **Fluxo `develop → main`** ainda não exercitado ponta a ponta.
- Rulesets/branch protection: não configurados (o `polaris-cost-model` também não tem).

## Dataform — rodar local

```bash
cd ~/ci-polaris/dp6-billing-platform
npx -y @dataform/cli@3.0.0 compile          # 23 ações, verificado em 2026-09-11
```

## Estrutura

Ver `CLAUDE.md` para a árvore completa e convenções do repo.
