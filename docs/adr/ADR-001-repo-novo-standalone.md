# ADR-001 — Repositório novo standalone

Data: 2026-09-09 · Status: aceito

## Contexto

O acesso ao billing export do CI Polaris foi obtido (view
`dp6-billing-voucher.billing_export.gcp_billing_export_resource_v1_008012_F93445_DFD798`). Precisa virar uma camada
analítica de custo (Dataform + BigQuery) e um painel FinOps. Já existem no ecossistema:
`polaris-cost-control` (alertas de orçamento, Terraform, spec-driven) e `atlas` (observabilidade
de dados, somente leitura, React + FastAPI).

## Decisão

Criar um repositório novo **`DP6/dp6-billing-platform`**, auto-contido: projeto Dataform na raiz +
`apps/` (api + web) + `terraform/` + `specs/` + `docs/`.

## Alternativas consideradas

- **Feature em `polaris-cost-control`** — o `CLAUDE.md` dele diz que custo por serviço/label/SKU e
  detecção de anomalia são "fora de escopo, criar nova spec"; caberia. Mas o repo é só Terraform,
  e isto traz Dataform + um app React — mudaria a natureza dele.
- **Seção no `atlas`** — o `atlas` é "somente leitura, sem pipeline". Um Dataform que **cria
  tabelas** fere isso. O `atlas` pode ser **consumidor** das marts, não o dono.
- **Standalone** — controle total do DP6 Design System no app, isolamento de estado Terraform,
  ciclo de deploy próprio. Custo: duplica o padrão de CI/WIF dos vizinhos.

## Consequências

- Espelha as convenções de `polaris-cost-control` (bootstrap local, WIF, spec-driven) e `atlas`
  (dev/prod por diretório).
- Opera sobre o mesmo projeto GCP `dp6-ci-polaris` que os vizinhos.
- As marts (`billing_platform_reporting_*`) ficam disponíveis para o `atlas` consumir no futuro.
