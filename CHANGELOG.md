# CHANGELOG

Formato: o que foi feito, decisões, erros/aprendizados, status. Data em ordem decrescente.

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
