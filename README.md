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

## Estado (2026-09-11)

**Só o esqueleto foi criado — nada rodado, nada aplicado no GCP, nada commitado/pushado.**
O que já foi feito, mecanicamente, a partir do `polaris-cost-model`:

- Estrutura de diretórios e todos os arquivos copiados e renomeados (datasets, SAs, secrets,
  nome do repo Dataform, imagem/serviço Cloud Run, tag `billing_platform`).
- Origem do dado repontada para a tabela bruta
  `dp6-billing-voucher.billing_export.gcp_billing_export_resource_v1_008012_F93445_DFD798`
  (declaration `definitions/sources/billing_export_resource.sqlx`).
- `docs/adr/ADR-003-acesso-direto-tabela-bruta.md` reescrita documentando a divergência do
  padrão de authorized view do repo-irmão.

**Ainda pendente** (ver plano, Fases 1–7):

- Fase 1 — rodar a suíte de `validation/*.sql` contra a tabela bruta (ainda apontam pro
  padrão herdado; parâmetros travados em `includes/constants.js`/ADR-005 são do repo-irmão e
  quase certamente não valem na escala da conta inteira).
- Fase 2 — adicionar `project_id`/`project_name` ao grão do fato e das 13 views `reporting/`
  (staging já lê `project.id`; fato/reporting ainda não propagam).
- Fase 3/5 — Terraform e CI/CD ainda não testados (`dataform compile`, `terraform validate`
  não rodados nesta cópia).
- Fase 4 — apps (`api`/`web`) ainda com textos/env vars do `polaris-cost-model`, sem filtro de
  projeto na UI.
- Fase 6 — acesso: grant da TI **ainda não solicitado** (texto pronto em
  `terraform/bootstrap/outputs.tf` → `external_access_request`).
- Fase 7 — `README.md`/`CLAUDE.md` (este) e specs ainda descrevendo o estado herdado, não uma
  spec própria validada.
- Repo GitHub `DP6/dp6-billing-platform` **ainda não criado** — isto é só uma cópia local.

## Dataform — rodar local

```bash
cd ~/ci-polaris/dp6-billing-platform
npx -y @dataform/cli@3.0.0 compile          # ainda não confirmado nesta cópia
```

## Estrutura

Ver `CLAUDE.md` para a árvore completa e convenções do repo.
