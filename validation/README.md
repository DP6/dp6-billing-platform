# Fase 2 — Consultas de validação

Rodadas direto contra a view de billing export, **antes** de escrever o Dataform. Cada
consulta responde a uma decisão de modelagem. Anotar as conclusões em `RESULTADOS.md`
(criar ao rodar) — elas travam a versão final da `specs/001-*` e os `vars` do
`workflow_settings.yaml`.

Fonte (em todos os arquivos):
`dp6-billing-voucher.billing_export.gcp_billing_export_resource_v1_008012_F93445_DFD798`

## Como rodar

```bash
gcloud auth application-default login   # identity com bigquery.dataViewer no dataset de origem

for f in validation/[0-9]*.sql; do
  echo; echo "=================== $f ==================="
  bq query --use_legacy_sql=false --format=pretty --max_rows=500 < "$f"
done
```

> Os arquivos assumem os tipos nativos do billing export (TIMESTAMP, FLOAT64, NUMERIC,
> ARRAY<STRUCT>). Se a `INFORMATION_SCHEMA` (consulta 11) mostrar colunas expostas como
> STRING, adicionar `SAFE_CAST` antes de seguir.

## Índice

| Arquivo | Decide |
|---|---|
| `00_smoke.sql` | range de datas, volume, lag de export — sanidade inicial |
| `01_reconciliacao_mensal.sql` | se `gross / credits / net` batem com a fatura do console |
| `02_custo_diario_por_servico.sql` | shape final da fact (grão diário × serviço) |
| `03_creditos_por_tipo.sql` | se o breakdown de crédito por tipo é necessário no headline |
| `04_cobertura_de_labels.sql` | cobertura real de `environment` / `app` / `managed-by` |
| `05_distribuicao_cost_type.sql` | peso de `tax` / `adjustment` / `rounding_error` |
| `06_janela_de_restatement.sql` | quantos dias o `export_time` ainda se move → `lookback_days` |
| `07_escopo_de_projetos.sql` | se a view traz só `dp6-ci-polaris` ou mais projetos |
| `08_list_savings_por_servico.sql` | sanidade de `cost_at_list - cost` |
| `09_sonda_de_duplicatas.sql` | existência/natureza de linhas duplicadas → estratégia de dedup |
| `10_conversao_cambial.sql` | estabilidade de `currency_conversion_rate` (derivação USD) |
| `11_metadata_da_view.sql` | o que a `billing_export_resource` já faz (dedup? filtro? agregação?) + tipos |
