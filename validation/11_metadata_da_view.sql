-- 11 — Metadata da view
-- DECIDE: o que a billing_export_resource já faz por baixo — se deduplica, filtra projeto, agrega
--         créditos, restringe período — e quais tipos ela expõe (nativos vs STRING).
--         Isso define quanto trabalho o staging ainda precisa fazer.
-- OLHAR: 11a) view_definition — ler o SQL. Procurar DISTINCT / GROUP BY / QUALIFY / WHERE
--             project / WHERE _PARTITIONTIME / UNNEST(credits).
--        11b) tipos das colunas: se cost/usage/timestamps vierem como STRING, o staging
--             precisa de SAFE_CAST; se vierem STRUCT/ARRAY, seguimos como no plano.
--        11c) location do dataset de origem (tem que bater com defaultLocation do Dataform).
-- Também rodar no shell:  bq show --view dp6-billing-voucher.billing_export.gcp_billing_export_resource_v1_008012_F93445_DFD798

-- 11a) Definição da view
SELECT table_name, view_definition
FROM `dp6-billing-voucher.billing_export.INFORMATION_SCHEMA.VIEWS`
WHERE table_name = 'billing_export_resource';

-- 11b) Colunas e tipos expostos
SELECT column_name, data_type, is_nullable
FROM `dp6-billing-voucher.billing_export.INFORMATION_SCHEMA.COLUMNS`
WHERE table_name = 'billing_export_resource'
ORDER BY ordinal_position;

-- 11c) Location e metadados do dataset de origem
SELECT catalog_name, schema_name, location
FROM `dp6-billing-voucher.billing_export.INFORMATION_SCHEMA.SCHEMATA`
WHERE schema_name = 'billing_export';
