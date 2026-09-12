locals {
  env               = "prod"
  reporting_dataset = "billing_platform_reporting_${local.env}"
  mart_dataset      = "billing_platform_mart_${local.env}"
}

module "api" {
  source = "../../modules/app_service"

  project_id     = var.project_id
  project_number = var.project_number
  region         = var.region
  env            = local.env

  name            = "billing-platform-api"
  image           = var.api_image
  allowed_members = var.iap_allowed_members

  runtime_project_roles = ["roles/bigquery.jobUser"]

  env_vars = {
    BILLING_API_GCP_PROJECT        = var.project_id
    BILLING_API_REPORTING_DATASET  = local.reporting_dataset
    BILLING_API_MART_DATASET       = local.mart_dataset
    BILLING_API_BQ_LOCATION        = var.location
    BILLING_API_MONTHLY_BUDGET_BRL = "20"
    BILLING_API_MOCK               = "false"
  }
}

# Servico unico (ver dev/main.tf e ADR-008): a imagem da API embute o SPA.

module "data_stack" {
  source = "../../modules/data_stack"

  project_id = var.project_id
  region     = var.region
  location   = var.location
  env        = local.env

  dataform_repository  = var.dataform_repository
  dataform_sa_email    = var.dataform_sa_email
  api_runtime_sa_email = module.api.runtime_sa_email

  git_commitish = var.git_commitish
  alert_email   = var.alert_email
}
