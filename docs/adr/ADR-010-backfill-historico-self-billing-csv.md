# ADR-010 — Backfill de custo histórico (jan-jun/2026) via CSV manual, unido ao fato

Data: 2026-09-21 · Status: aceito (carga em BigQuery ainda não executada — ver `SESSIONLOG.md`)

## Contexto

A tabela que o Dataform lê (`gcp_billing_export_resource_v1_008012_F93445_DFD798`, via
`definitions/sources/billing_export_resource.sqlx`) só passou a ser consultada quando o
pipeline foi ao ar (setembro/2026) — não tem histórico de janeiro a junho/2026. Isso apareceu
como lacuna real no card "Custo total (histórico)" do e-mail semanal (`email_report.py`, branch
`feat/relatorio-email-custo-historico-e-ritmo-mes`), que soma `net_cost_brl` desde
`MIN(usage_date)` do fato — hoje esse mínimo é só a data em que o Dataform começou a rodar.

O usuário exportou manualmente do console de faturamento 6 relatórios mensais ("Tabela DP6
Self Billing (Voucher)_Cost", jan-jun/2026) cobrindo exatamente essa lacuna, sem sobreposição
com o `billing_export` real.

## Decisão

- Os 6 CSVs são limpos e tipados por `scripts/backfill_self_billing_historico.py` (parsing de
  número BR, mapeamento de `Tipo de custo`, descarte da linha de resumo "Total") e carregados
  via `bq load --replace` numa tabela fixa `billing_platform_stg_prod.raw_self_billing_historico`
  — carga manual, única, fora do Terraform e fora do ciclo incremental normal (mesmo princípio
  do ADR-003: IAM/carga da origem fica fora do código de infraestrutura).
- `definitions/sources/self_billing_historico.sqlx` (declaration) aponta pra essa tabela;
  `definitions/staging/stg_self_billing_historico.sqlx` (table, não incremental) projeta os
  mesmos ~21 campos que `stg_billing_platform` expõe pro fato.
- `definitions/marts/fct_billing_cost_daily.sqlx` passa a ler um `UNION ALL` de
  `stg_billing_platform` com `stg_self_billing_historico`, em vez de só a primeira.
- `stg_billing_platform.sqlx` **não muda** — a lógica de dedup/incremental de lá já é frágil e
  documentada como tal (incidente 2026-09-11); zero motivo pra arriscar mexendo nela aqui.

## Limitações assumidas (documentadas, não corrigidas)

- **Sem labels no período histórico**: `label_environment/app/managed_by` e as versões
  `*_reconciled` ficam `NULL` pra jan-jun — o CSV não carrega labels, e a reconciliação por
  nome de recurso (`resource.global_name`) também não existe nesse formato. Qualquer breakdown
  por app/ambiente simplesmente não cobre esse período (mesmo comportamento que ~90-96% das
  linhas já têm hoje por falta de label nativo).
- **Crédito não segregado por tipo**: no CSV, um desconto/promoção aparece como **linha própria**
  (mesmo service/sku/project/date da linha de uso, custo negativo), não como array aninhado
  (`credits`) igual o `billing_export` real. Carregamos o custo bruto de cada linha direto em
  `gross_cost_brl = net_cost_brl` (sem `credits_total_brl` próprio); como o fato agrega pelo
  mesmo grão da linha de uso e da linha de crédito que a desconta, a soma final já líquida
  corretamente — só a informação "quanto foi bruto vs. quanto foi crédito" se perde nesse
  período.
- **Câmbio mensal, não diário**: `gross_cost_usd`/`net_cost_usd` usam a única taxa de câmbio do
  cabeçalho de cada CSV (uma por mês), não uma taxa por dia como o `billing_export` real
  permite (`currency_conversion_rate` por linha).
- **Linhas de imposto/ajuste sem serviço**: `Tipo de custo = Tributo` ou `Erro de
  arredondamento` vêm sem `Descrição do serviço`/SKU no CSV (ajuste no nível da fatura/projeto,
  não de um serviço específico) — mapeadas pra `service_description = 'Impostos e ajustes'`
  pra não ficarem `NULL` em breakdowns por serviço.
- **`cost_type` normalizado pro enum do Google**: `Uso → regular`, `Tributo → tax`, `Erro de
  arredondamento → rounding_error` — necessário porque `rpt_commitment_coverage.sqlx` filtra
  `cost_type = 'regular'` explicitamente, e `docs/data-contract.md` documenta que hoje é
  "100% regular" (a checagem continua correta incluindo o histórico).

## Por que isso não quebra o incremental nem as assertions

`fct_billing_cost_daily`'s `updatePartitionFilter` restringe o MERGE diário aos últimos 45
dias — as partições de jan-jun ficam fora dessa janela e só são (re)escritas num
`--full-refresh` (o `closeout` workflow já roda isso todo mês), de forma idempotente.
`assert_fct_reconciliation` e `assert_source_freshness` comparam contra o `billing_export` real
só dentro do mesmo `lookbackFilter` de 45 dias — nunca enxergam jan-jun, então o histórico não
entra na conta de reconciliação.

## Alternativas consideradas

- **Escrever direto no fato/mart via script**, sem passar pelo Dataform — descartada: perde
  rastreabilidade (`dataform compile` não mostra a origem), e qualquer `--full-refresh` futuro
  apagaria a carga manual sem re-inserir (o fato é gerenciado 100% pelo Dataform).
- **Pedir a TI uma exportação real do `billing_export` cobrindo jan-jun** — mais fiel (teria
  `credits` aninhado, labels reais se existissem, câmbio diário), mas o export nativo do GCP
  não é retroativo: ele só passa a gravar a partir de quando é habilitado, não preenche o
  passado. Não é uma opção disponível.

## Consequências

- Se o `billing_export` real algum dia passar a cobrir parte de jan-jun (reprocessamento
  retroativo pela Google, hipotético), `assert_fct_reconciliation` continuaria não enxergando
  (fora da janela de 45 dias) — mas passaria a existir dupla contagem silenciosa nesses meses.
  Não há salvaguarda automática pra esse cenário hoje; se acontecer, revisar este ADR.
- Qualquer nova coluna adicionada a `stg_billing_platform` que o fato passe a consumir precisa
  de um valor correspondente (mesmo que `NULL`) em `stg_self_billing_historico`, senão o
  `UNION ALL` em `fct_billing_cost_daily.sqlx` quebra a compilação.
