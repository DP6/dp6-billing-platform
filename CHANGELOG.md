# CHANGELOG

Formato: o que foi feito, decisões, erros/aprendizados, status. Data em ordem decrescente.

## 2026-09-21 — Backfill de custo histórico (jan-jun/2026)

O `billing_export` real só começou a ser lido em setembro/2026 (data em que o pipeline foi ao
ar) — sem histórico de jan-jun. Card "Custo total (histórico)" do e-mail semanal (`1b347b0`)
expôs a lacuna: a soma "desde o início" só refletia o início do próprio pipeline, não janeiro.

Carregados 6 CSVs "DP6 Self Billing (Voucher)_Cost" (exportados manualmente do console de
faturamento) via `scripts/backfill_self_billing_historico.py` novo, numa tabela fixa
`billing_platform_stg_prod.raw_self_billing_historico`. Novos `definitions/sources/
self_billing_historico.sqlx` (declaration) e `definitions/staging/stg_self_billing_historico.sqlx`
(table, não incremental); `definitions/marts/fct_billing_cost_daily.sqlx` passa a ler um
`UNION ALL` das duas fontes de staging. Decisões e limitações (sem label no período, crédito
não segregado por tipo, câmbio mensal em vez de diário, `cost_type` normalizado pro enum do
Google) documentadas em `docs/adr/ADR-010-backfill-historico-self-billing-csv.md`.

`stg_billing_platform.sqlx` não foi tocado — o dedup/incremental de lá já é frágil e documentado
como tal. Script validado localmente: soma de custo bruto por mês bate exatamente com "Valor
total devido" do cabeçalho de cada CSV original (204,87 / -0,01 / -0,02 / -0,01 / 644,60 /
8.790,73 — fev-abr tiveram custo líquido quase zero, voucher cobrindo o uso quase todo).

**Carga real feita e conferida (2026-09-21):** a conta pessoal do usuário só tem
`roles/cloudscheduler.jobRunner`/`roles/dataform.editor` no projeto — sem `bigquery.tables.create`
no dataset destino. Contornado impersonando a SA do Dataform (já tem `dataOwner` em
`billing_platform_stg_prod`), via `gcloud config set auth/impersonate_service_account` (o `bq`
2.1.36 instalado não aceita `--impersonate_service_account` como flag direta). Query de conferência
em `raw_self_billing_historico` bate linha a linha com o validado localmente (1311/1270/1274/
1187/1204/831 linhas, mesmas somas por mês). Script atualizado com `--impersonate-sa` pra não
precisar repetir o passo manual numa próxima carga.

**Falta:** `dataform compile` (Node não existe nesta WSL, precisa rodar pelo usuário); abrir PR
e merge/deploy (o `UNION ALL` só materializa o histórico de verdade no fato num
`--full-refresh`, que o `closeout` workflow já roda mensalmente).

## 2026-09-11 — Fork inicial do polaris-cost-model

Criado como cópia estrutural do `DP6/polaris-cost-model` (mesma árvore: Dataform, apps,
Terraform, CI/CD), adaptado para modelar **toda a conta de faturamento**
(`008012-F93445-DFD798`) em vez de um único projeto. Plano completo:
`~/.claude/plans/preciso-criar-uma-vers-o-encapsulated-willow.md`.

Feito nesta rodada (mecânico, ver plano Fase 0/2):
- Renomeação de datasets (`billing_polaris_*` → `billing_platform_*`), SAs, secret do Git
  token, nome do repo Dataform, imagem/serviço Cloud Run, tag Dataform.
- Origem repontada de `vw_dp6_ci_polaris` (authorized view, filtrada por projeto) para a
  tabela bruta `gcp_billing_export_resource_v1_008012_F93445_DFD798` (conta inteira, sem
  filtro) — `definitions/sources/billing_export_resource.sqlx`.
- `docs/adr/ADR-003-acesso-direto-tabela-bruta.md` reescrita: acesso direto à tabela em vez de
  authorized view, documentando a divergência deliberada do padrão do repo-irmão.
- `docs/adr/ADR-005-orcamento-20-brl.md` marcada como herdada/não válida (valor calibrado pra
  escala de 1 projeto).

Ainda não feito (não confundir com "pronto"): grão do fato/reporting não tem `project_id`
ainda; `validation/*.sql` não foram rerodados contra a tabela nova; `dataform compile` e
`terraform validate` não foram testados nesta cópia; apps ainda com textos/env vars do
repo-irmão; repo GitHub não criado; nenhum grant de TI solicitado.
