# ADR-007 — dev + prod por diretório (não workspaces)

Data: 2026-09-09 · Status: aceito

## Contexto

O `dp6-billing-platform` roda no projeto único `dp6-ci-polaris` (sem fronteira de projeto entre
ambientes), como o `atlas`. Precisa de um `dev` e um `prod` isolados.

## Decisão

Padrão do `atlas` (ADR-0003 dele): **`terraform/environments/dev/` e `environments/prod/`**,
cada um um root module com backend GCS por `prefix`, consumindo `terraform/modules/`.
**Não** usar Terraform workspaces.

Isolamento por convenção de nome:
- Datasets: `billing_platform_{stg,mart,reporting,assertions}_{dev|prod}` (o `schema_suffix` no
  `release_config` do Dataform aplica o sufixo — os `.sqlx` não mudam).
- Cloud Run: `billing-{api,web}-{dev|prod}`; SA de runtime herda o sufixo (`<name>-<env>-run`).
- Dataform: um `google_dataform_repository`, dois `release_config` + dois pares de `workflow_config`.
- WIF: um pool, provider `github-apply` travado em `refs/heads/main`.

## Consequências

- `dev` compila a branch `develop`; `prod` compila `main`.
- `dev` pode ser aplicado isolado (só `data_stack`) para validar o pipeline antes dos apps.
- Duplica ~7 arquivos `.tf` por ambiente (diferença real: `local.env`, `backend prefix`,
  `git_commitish`) — aceito pela clareza (ADR-0003 do atlas).

## Atualização (2026-09-24)

Esta convenção foi extraída para o documento canônico
`~/ci-polaris/docs/deploy-environments.md`, já que o mesmo texto estava duplicado
verbatim em `polaris-cost-model/docs/adr/ADR-007-dev-prod-por-diretorio.md` e no `polaris-atlas`.
Este ADR permanece como registro histórico da decisão; mudança futura na convenção deve editar
o documento canônico, não este arquivo.
