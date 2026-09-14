locals {
  env               = "prod"
  reporting_dataset = "billing_platform_reporting_${local.env}"
  mart_dataset      = "billing_platform_mart_${local.env}"
}

resource "google_firestore_database" "billing_platform" {
  project     = var.project_id
  name        = "billing-platform-prod"
  location_id = var.region
  type        = "FIRESTORE_NATIVE"

  delete_protection_state = "DELETE_PROTECTION_ENABLED"
  deletion_policy         = "ABANDON"
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

  enable_self_impersonation = true
  enable_firestore          = true

  env_vars = {
    BILLING_API_GCP_PROJECT        = var.project_id
    BILLING_API_REPORTING_DATASET  = local.reporting_dataset
    BILLING_API_MART_DATASET       = local.mart_dataset
    BILLING_API_BQ_LOCATION        = var.location
    BILLING_API_MONTHLY_BUDGET_BRL = "20"
    BILLING_API_MOCK               = "false"

    # aba ADM (docs/adr/, plano "ADM tab") -- só aqui (prod) o sender tem
    # domain-wide delegation com escopo gmail.send (ver bootstrap/outputs.tf,
    # workspace_delegation_request); dev fica sempre em dry-run.
    BILLING_API_ENVIRONMENT                 = local.env
    BILLING_API_FIRESTORE_DATABASE          = google_firestore_database.billing_platform.name
    BILLING_API_WORKSPACE_IMPERSONATE_EMAIL = "admin.victoria@dp6.com.br"
    BILLING_API_ADMIN_GROUP_EMAIL           = "gcp-dp6-gti@dp6.com.br"
    BILLING_API_REPORT_SENDER_EMAIL         = "admin.victoria@dp6.com.br"
    BILLING_API_SCHEDULER_SA_EMAIL          = google_service_account.weekly_report_scheduler.email
    # BILLING_API_IAP_AUDIENCE: TBD, ver dev/main.tf.
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
