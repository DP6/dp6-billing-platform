# dp6-billing-platform

Fork estrutural do `DP6/polaris-cost-model` (ver contexto geral em `~/ci-polaris/CLAUDE.md`),
cobrindo **toda a conta de faturamento** em vez de um único projeto. Roda no mesmo projeto GCP
(`dp6-ci-polaris`) como repo independente. Billing account `008012-F93445-DFD798` (BRL),
**todos os projetos** (não só `dp6-ci-polaris`).

**Estado atual: esqueleto recém-copiado, nada validado/aplicado ainda.** Ver `README.md` §Estado
e o plano `~/.claude/plans/preciso-criar-uma-vers-o-encapsulated-willow.md` antes de assumir que
qualquer fase abaixo está "pronta" — a árvore/convenções foram herdadas do repo-irmão, mas o
conteúdo (validação, grão com `project_id`, docs, apps) ainda precisa da adaptação descrita lá.

## Propósito

Camada analítica de custo da conta inteira a partir do billing export
(`dp6-billing-voucher.billing_export.gcp_billing_export_resource_v1_008012_F93445_DFD798`,
tabela bruta, sem filtro de projeto) + painel FinOps standalone. Custo líquido, economia,
evolução, showback por `app`×`environment`**×`project`**, anomalia — grão diário. (A dimensão
`project` é uma adição em relação ao `polaris-cost-model`, que não precisava dela.)

## Estrutura

```
.
├── workflow_settings.yaml · includes/ · definitions/   # projeto Dataform (na raiz — o Dataform linka a raiz do repo)
│   ├── sources/           # declaration da tabela bruta (sem view intermediária, ADR-003)
│   ├── staging/           # stg_billing_platform (incremental, dedup)
│   ├── marts/             # fct diário · agg mensal · dim_service_sku · vw_billing_daily_anomaly
│   ├── reporting/         # 13 views rpt_* — a fronteira que a API lê
│   └── assertions/        # 4
├── validation/            # SQL da Fase 2 + RESULTADOS.md (referência, não roda no pipeline)
├── apps/
│   ├── api/               # FastAPI fino — lê só rpt_* (Cloud Run billing-platform-api-{dev,prod})
│   └── web/               # React+Vite+Recharts, DP6 Design System (Cloud Run billing-web-{dev,prod})
├── terraform/
│   ├── bootstrap/         # state LOCAL, apply manual 1x — WIF, SAs, state bucket, Dataform repo
│   ├── modules/           # data_stack · app_service
│   └── environments/{dev,prod}/   # state remoto GCS, aplicado pelo CI
├── mock/                  # mock/index.html (interativo) + mock/canvas/ (canvas de design, 8 telas)
├── specs/                 # spec-driven — uma por mudança relevante
├── docs/adr/ · docs/data-contract.md
└── .github/workflows/     # terraform-plan/apply · dataform-ci · apps-ci · apps-deploy
```

## Stack

- **Dataform** Core 3.0 (BigQuery, location US). `schema_suffix` por ambiente — os `.sqlx` não mudam.
- **API**: Python 3.12 + FastAPI, `uv`. Modo mock (`BILLING_API_MOCK=1`) serve fixtures da validação.
- **Web**: React 19 + Vite + Recharts + Tailwind, `pnpm`/`npm`.
- **IaC**: Terraform `google ~> 6.0` (Cloud Run usa `google-beta` por `iap_enabled`). Diretório por
  ambiente, **não** workspaces (ADR-007).
- **CI/CD**: GitHub Actions + WIF (sem chave de SA).

## Ambientes

| | Projeto | Dataform | Cloud Run | Branch |
|---|---|---|---|---|
| dev | `dp6-ci-polaris` | `release_config` dev, datasets `*_dev` | `billing-{api,web}-dev` | `develop` |
| prod | `dp6-ci-polaris` | `release_config` prod, datasets `*_prod` | `billing-{api,web}-prod` | `main` |

## Acesso à origem (ADR-003 — diverge do polaris-cost-model)

O Dataform lê **direto a tabela bruta** `gcp_billing_export_resource_v1_008012_F93445_DFD798`
(dataset `billing_export`, sem authorized view intermediária), como
`sa-billing-platform-dataform@dp6-ci-polaris`. A TI concede `dataViewer` no dataset/tabela de
origem — **ainda não solicitado** (texto pronto em `terraform/bootstrap/outputs.tf`).
IAM da origem fica **fora do Terraform**. Ver `docs/adr/ADR-003-acesso-direto-tabela-bruta.md`
para o porquê da divergência do padrão authorized-view do repo-irmão.

## Convenções

- Toda mudança relevante começa por uma **spec** em `specs/` (`NNN-nome.md`), revisada antes de virar código.
- Decisão de arquitetura → **ADR** novo em `docs/adr/` (contexto → decisão → alternativas →
  consequências). Nunca apagar um ADR.
- Fim de fase / mudança relevante → atualizar `CHANGELOG.md`. Contexto de sessão alto ou antes de
  encerrar → atualizar `SESSIONLOG.md` (ler ao iniciar qualquer sessão).
- Commits: `<escopo>: <descrição>` (ex.: `dataform: adiciona rpt_budget_daily`).
- Nunca commitar `*.tfstate*`, `*.tfvars` reais (só `.example`), `.df-credentials.json`, `node_modules/`.
- Antes de `terraform apply`: `fmt` + `validate` + `plan` revisado no PR.

## Regras de Git (obrigatórias — de `~/ci-polaris/CLAUDE.md`)

- **Nunca `git push`** sem confirmação explícita minha logo antes do comando.
- **Sempre trabalhar em branch separada**, nunca commitar direto em `main`/`develop`. Criar a
  branch antes de qualquer alteração — sem exceção pro seed inicial (isso era um combinado
  específico do `polaris-cost-model`, não vale aqui automaticamente).
- **Nunca aprovar ou mergear PR** sem eu dizer explicitamente naquele momento.
- Confirmação anterior não vale para as próximas.

## Comandos úteis

```bash
npx -y @dataform/cli@3.0.0 compile        # Dataform, offline
cd apps/api && BILLING_API_MOCK=1 uv run uvicorn billing_api.main:app --port 8080
cd apps/web && npm run dev                # proxy /api -> :8080
cd terraform && terraform fmt -recursive .
```
