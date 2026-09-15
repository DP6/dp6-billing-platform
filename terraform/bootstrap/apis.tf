locals {
  apis = [
    "cloudresourcemanager.googleapis.com",
    "serviceusage.googleapis.com",
    "iam.googleapis.com",
    "iamcredentials.googleapis.com",
    "sts.googleapis.com",
    "cloudidentity.googleapis.com",
    "bigquery.googleapis.com",
    "dataform.googleapis.com",
    "secretmanager.googleapis.com",
    "run.googleapis.com",
    "compute.googleapis.com", # IAP/serverless NEG
    "iap.googleapis.com",
    "artifactregistry.googleapis.com",
    "cloudbuild.googleapis.com",
    "monitoring.googleapis.com",
    "logging.googleapis.com",
    # aba ADM (budget/e-mail + relatorio semanal, ver plano "ADM tab")
    "firestore.googleapis.com",
    "admin.googleapis.com",          # Directory API -- checagem de grupo (workspace_directory.py)
    "gmail.googleapis.com",          # envio do relatorio semanal (email_report.py)
    "cloudscheduler.googleapis.com", # disparo semanal, so prod (environments/prod/scheduler.tf)
    "billingbudgets.googleapis.com", # le os budgets do GCP (gcp_budgets.py) -- monitoring.googleapis.com
    # acima ja cobre a resolucao dos canais de notificacao por e-mail
  ]
}

resource "google_project_service" "this" {
  for_each           = toset(local.apis)
  service            = each.value
  disable_on_destroy = false
}
