locals {
  # billing_platform_{stg,mart,reporting,assertions}_{env}
  datasets = ["stg", "mart", "reporting", "assertions"]
}

resource "google_bigquery_dataset" "this" {
  for_each                        = toset(local.datasets)
  project                         = var.project_id
  dataset_id                      = "billing_platform_${each.value}_${var.env}"
  location                        = var.location
  description                     = "Painel FinOps CI Polaris - camada ${each.value} (${var.env})"
  delete_contents_on_destroy      = var.env == "dev"
  default_partition_expiration_ms = null

  labels = {
    app         = "dp6-billing-platform"
    environment = var.env
    managed-by  = "terraform"
  }
}

# SA do Dataform: escreve em stg/mart/reporting/assertions
resource "google_bigquery_dataset_iam_member" "dataform_editor" {
  for_each   = google_bigquery_dataset.this
  project    = var.project_id
  dataset_id = each.value.dataset_id
  role       = "roles/bigquery.dataEditor"
  member     = "serviceAccount:${var.dataform_sa_email}"
}

# SA de runtime da API: le reporting (views rpt_*) + mart (o endpoint /meta le
# fct_billing_cost_daily e agg_billing_cost_monthly direto p/ freshness e line_count).
# stg e assertions ficam fora.
resource "google_bigquery_dataset_iam_member" "api_viewer" {
  for_each   = toset(["reporting", "mart"])
  project    = var.project_id
  dataset_id = google_bigquery_dataset.this[each.value].dataset_id
  role       = "roles/bigquery.dataViewer"
  member     = "serviceAccount:${var.api_runtime_sa_email}"
}

moved {
  from = google_bigquery_dataset_iam_member.api_reporting_viewer
  to   = google_bigquery_dataset_iam_member.api_viewer["reporting"]
}

# rpt_label_coverage_by_component/rpt_unlabeled_resources leem stg_billing_platform direto
# (precisam de resource_global_name, que nao sobrevive na mart) -- sem isso, a SA de runtime
# da API (que so tem acesso a reporting/mart, de proposito) toma 403 ao consultar essas 2
# views, mesmo tendo acesso a "reporting". "Authorized view": autoriza so essas views
# especificas a ler stg, sem abrir a stg inteira pra ninguem.
# Gated por var.component_coverage_views_ready (default false): essas views ainda nao existem
# no BigQuery (Dataform nunca rodou aqui -- grant de TI em stg_billing_platform pendente), e o
# provider falha o apply com "View ... not found" se tentar autorizar algo que nao existe
# (Deploy dev #17, 2026-09-14). Sem o toggle, todo apply neste ambiente quebra por causa deste
# recurso, mesmo pra mudancas nao relacionadas.
resource "google_bigquery_dataset_access" "stg_authorizes_component_coverage_views" {
  for_each   = var.component_coverage_views_ready ? toset(["rpt_label_coverage_by_component", "rpt_unlabeled_resources"]) : toset([])
  project    = var.project_id
  dataset_id = google_bigquery_dataset.this["stg"].dataset_id
  view {
    project_id = var.project_id
    dataset_id = google_bigquery_dataset.this["reporting"].dataset_id
    table_id   = each.value
  }
}
