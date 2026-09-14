variable "project_id" { type = string }
variable "region" {
  type    = string
  default = "us-central1" # regiao do google_dataform_repository (do bootstrap)
}
variable "location" {
  type    = string
  default = "US" # location dos datasets BigQuery
}
variable "env" {
  type = string # "dev" | "prod"
}

variable "dataform_repository" {
  type = string # id do google_dataform_repository (do bootstrap)
}
variable "dataform_sa_email" {
  type = string # sa-billing-platform-dataform@... — le a view e escreve nos datasets
}
variable "api_runtime_sa_email" {
  type = string # SA de runtime do billing-platform-api — le SO o dataset reporting
}

variable "git_commitish" {
  type = string # "main" (prod) | "develop" (dev)
}
variable "compile_cron" {
  type    = string
  default = "0 6 * * *"
}
variable "run_cron" {
  type    = string
  default = "30 6 * * *"
}
variable "closeout_cron" {
  type    = string
  default = "0 8 12 * *" # dia 12, pos-fechamento de fatura
}
variable "time_zone" {
  type    = string
  default = "America/Sao_Paulo"
}

# sem default de proposito: o default herdado apontava para um grupo inexistente e teria
# mandado os alertas para o vazio em silencio. Cada environment passa o seu.
variable "alert_email" {
  type = string
}
variable "freshness_threshold_hours" {
  type    = number
  default = 36
}

# Default false ate o Dataform materializar rpt_label_coverage_by_component/
# rpt_unlabeled_resources pela 1a vez — hoje bloqueado pelo grant de TI ainda pendente em
# stg_billing_platform (le a tabela bruta do billing export; ver docs/adr/ADR-003 e
# terraform/bootstrap/README.md "Depois do apply"). Enquanto essas views nao existirem no
# BigQuery, o `google_bigquery_dataset_access` que as autoriza falha no apply com "View ...
# not found" (ja aconteceu: Deploy dev #17, 2026-09-14). Flipar para true so depois de
# confirmar (via `bq ls`/console) que as 2 views existem em reporting_{env}.
variable "component_coverage_views_ready" {
  type    = bool
  default = false
}
