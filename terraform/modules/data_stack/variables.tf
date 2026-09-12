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

variable "alert_email" {
  type    = string
  default = "gcp-billing-platform@dp6.com.br"
}
variable "freshness_threshold_hours" {
  type    = number
  default = 36
}
