locals {
  env               = "dev"
  reporting_dataset = "billing_platform_reporting_${local.env}"
  mart_dataset      = "billing_platform_mart_${local.env}"
}

# Firestore named database (nao o "(default)") -- aba ADM (budget/e-mail).
# O mesmo projeto GCP ja tem outro app com Firestore (polaris-atlas, hub-dev/
# hub-prod) -- banco proprio pra nao misturar dado.
resource "google_firestore_database" "billing_platform" {
  project     = var.project_id
  name        = "billing-platform-dev"
  location_id = var.region
  type        = "FIRESTORE_NATIVE"

  delete_protection_state = "DELETE_PROTECTION_DISABLED"
  deletion_policy         = "DELETE"
}

# ---- API (billing-platform-api-dev) ----
module "api" {
  source = "../../modules/app_service"

  project_id     = var.project_id
  project_number = var.project_number
  region         = var.region
  env            = local.env

  name            = "billing-platform-api"
  image           = var.api_image
  allowed_members = var.iap_allowed_members

  # a API le so o dataset reporting -> jobUser no projeto + dataViewer no dataset (via data_stack)
  runtime_project_roles = ["roles/bigquery.jobUser"]

  # aba ADM: Directory API (checar grupo gcp-dp6-gti@) precisa dos dois --
  # Gmail send (gmail.send) so na SA de PROD, ver prod/main.tf.
  enable_self_impersonation = true
  enable_firestore          = true

  env_vars = {
    BILLING_API_GCP_PROJECT        = var.project_id
    BILLING_API_REPORTING_DATASET  = local.reporting_dataset
    BILLING_API_MART_DATASET       = local.mart_dataset
    BILLING_API_BQ_LOCATION        = var.location
    BILLING_API_MONTHLY_BUDGET_BRL = "20"
    BILLING_API_MOCK               = "false"

    # aba ADM (docs/adr/, plano "ADM tab")
    BILLING_API_ENVIRONMENT                 = local.env
    BILLING_API_FIRESTORE_DATABASE          = google_firestore_database.billing_platform.name
    BILLING_API_WORKSPACE_IMPERSONATE_EMAIL = "admin.victoria@dp6.com.br"
    BILLING_API_ADMIN_GROUP_EMAIL           = "gcp-dp6-gti@dp6.com.br"
    BILLING_API_REPORT_SENDER_EMAIL         = "admin.victoria@dp6.com.br"
    # Confirmado empiricamente (2026-09-15, log de diagnostico em auth.py com
    # o JWT real do IAP): /projects/{numero}/locations/{regiao}/services/{nome}
    # -- formato do IAP nativo do Cloud Run v2 (sem Load Balancer), nao
    # documentado com clareza. Construido sem depender de module.api.service_name
    # (nao da pra usar output do proprio modulo como input dele mesmo) -- o
    # nome eh literal, "${var.name}-${var.env}" do modulo app_service.
    BILLING_API_IAP_AUDIENCE = "/projects/${var.project_number}/locations/${var.region}/services/billing-platform-api-${local.env}"
  }
}

# A partir de 2026-09-10: servico unico. A imagem da API embute o build do SPA
# (apps/web) e o FastAPI serve o front + /api. Uma so porta de IAP -- o desenho
# de 2 servicos (web + api) atras de IAP nao funcionava (proxy server-side do
# nginx nao carrega a identidade do IAP -> 401). ADR-008.

# ---- Camada de dados (datasets + Dataform configs + alerta) ----
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
