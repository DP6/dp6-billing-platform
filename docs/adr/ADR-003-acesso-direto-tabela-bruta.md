# ADR-003 — Acesso à origem: tabela bruta direta, sem authorized view

Data: 2026-09-11 · Status: aceito (grant da TI ainda não solicitado — ver `SESSIONLOG.md`)

## Contexto

Este repo é um fork do `polaris-cost-model`, que modela o custo de **um único projeto**
(`dp6-ci-polaris`) e cobre esse escopo lendo uma **authorized view**
(`dp6-billing-voucher.billing_dp6_ci_polaris.vw_dp6_ci_polaris`, filtrada por
`project.id = 'dp6-ci-polaris'`) — decisão do ADR-003 daquele repo (least-privilege: nem a SA
do Dataform, nem ninguém fora da TI, toca a tabela bruta `billing_export`).

O `dp6-billing-platform` precisa dos dados de **toda a conta de faturamento**
(`008012-F93445-DFD798`, todos os projetos) — não existe hoje uma view autorizada equivalente
sem filtro de projeto. Criar uma seria replicar o trabalho de TI do repo-irmão (nova view,
nova authorized-view, novo grant).

## Decisão

- A SA dedicada `sa-billing-platform-dataform@dp6-ci-polaris.iam.gserviceaccount.com` lê
  **diretamente a tabela bruta** `dp6-billing-voucher.billing_export.gcp_billing_export_resource_v1_008012_F93445_DFD798`
  — sem view intermediária.
- A TI concede `roles/bigquery.dataViewer` no **dataset** `billing_export` (ou, se preferir
  granularidade mais fina, só na tabela `gcp_billing_export_resource_v1_...`) diretamente para
  essa SA. Ver `terraform/bootstrap/outputs.tf` (`external_access_request`) para o texto exato
  do pedido.
- O código lê a tabela via a declaration `definitions/sources/billing_export_resource.sqlx`
  (nome de Dataform amigável; o objeto real do BigQuery é a tabela acima).
- IAM da origem fica **fora do Terraform** (mesmo princípio do ADR-003 original).

## Divergência deliberada do padrão do polaris-cost-model

Isto é uma escolha consciente de **menos indireção em troca de superfície de acesso maior**:

| | polaris-cost-model (ADR-003 original) | dp6-billing-platform (este ADR) |
|---|---|---|
| Objeto lido pela SA | authorized view, já filtrada por projeto | tabela bruta, conta inteira |
| Trabalho de TI | criar + manter a view autorizada | só conceder `dataViewer` |
| Superfície de acesso da SA | só as linhas de 1 projeto | todas as linhas da conta (todos os projetos) |
| Least-privilege | mais estrito | mais permissivo |

Aceito porque: (a) esta SA já é dedicada e não-humana, sem outros usos; (b) o próprio propósito
deste repo é agregar a conta inteira, então "ver todos os projetos" não é excesso de escopo
para o que ele precisa fazer; (c) evita duplicar o trabalho de criar/manter uma segunda view
autorizada só para remover um filtro.

## Alternativas consideradas

- **Nova authorized view sem filtro de projeto** (replicar o ADR-003 original) — mesmo nível de
  least-privilege do repo-irmão, mas exige TI criar e manter mais um objeto. Descartada por ora
  (ver tabela acima); pode ser revisitada se o acesso direto à tabela for recusado.
- **SA membro de um grupo com acesso à tabela** — mesmos problemas já descritos no ADR-003 do
  `polaris-cost-model` (alarga o grupo, algumas orgs bloqueiam SA em grupo).

## Consequências

- A SA precisa **existir** antes do grant (`gcloud iam service-accounts create`, depois
  `terraform import` no bootstrap) — mesma ordem do repo-irmão.
- `assert_source_freshness` e `assert_fct_reconciliation` reconciliam contra a tabela bruta
  diretamente (não há uma segunda camada de authorized view para divergir).
- Se a TI preferir não conceder acesso à tabela bruta, este ADR precisa ser revisto e a
  alternativa "nova authorized view" adotada — nesse caso, atualizar
  `definitions/sources/billing_export_resource.sqlx`, `workflow_settings.yaml` (`source_dataset`/
  `source_table`) e este documento.
