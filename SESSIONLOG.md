# SESSIONLOG

Ler ao iniciar qualquer sessão neste repo. Objetivo: retomar sem perder contexto.

## 2026-09-11

Repo criado por cópia mecânica do `polaris-cost-model` (ver `CHANGELOG.md`). Só existe local em
`~/ci-polaris/dp6-billing-platform` — **sem `git remote`, sem repo GitHub, sem push, sem commit
ainda** (aguardando decisão do usuário sobre visibilidade/criação do `DP6/dp6-billing-platform`).

**Próximos passos exatos (na ordem do plano):**
1. Commitar o estado atual localmente (branch a definir — repo ainda nem tem primeiro commit).
2. Decidir com o usuário: criar `DP6/dp6-billing-platform` agora (visibilidade — o
   `polaris-cost-model` é `PUBLIC`) ou só depois do conteúdo estar mais maduro.
3. Fase 1 do plano — adaptar e rodar `validation/*.sql` contra
   `dp6-billing-voucher.billing_export.gcp_billing_export_resource_v1_008012_F93445_DFD798`
   (hoje esses arquivos ainda fazem as mesmas perguntas do repo-irmão, mas precisam confirmar
   cardinalidade real de `project.id`/`project.name` antes de fechar o grão).
4. Fase 2 — propagar `project_id`/`project_name` pro fato (`fct_billing_cost_daily.sqlx`),
   `agg_billing_cost_monthly.sqlx` e as 13 views `reporting/rpt_*` (hoje só o staging lê
   `project.id`; nada abaixo disso propaga ainda).
5. Fase 6 — enviar o `external_access_request` (`terraform output -raw external_access_request`
   depois do primeiro apply do bootstrap) pro dono do `dp6-billing-voucher` — ainda não enviado.
6. Fase 4/7 — apps e docs (`README`/`CLAUDE.md` já atualizados nesta rodada; specs e ADRs
   001/002/004/006/007/008 ainda não revisados linha a linha, herdados como estão).

**Convenção deste repo** (herdada de `~/ci-polaris/CLAUDE.md`): nunca `git push`/merge/aprovar
PR sem confirmação explícita a cada vez.
