locals {
  # plan: so leitura, para rodar `terraform plan` / `dataform compile`
  plan_roles = [
    "roles/browser",
    "roles/bigquery.metadataViewer",
    "roles/dataform.viewer",
    "roles/run.viewer",
    "roles/artifactregistry.reader",
    "roles/monitoring.viewer",
    "roles/iam.roleViewer",
    "roles/iam.serviceAccountViewer", # refresh das SAs de runtime (billing-*-run) no plan
    "roles/iap.admin",                # nao ha "iap viewer"; o plan le iap.webServices.getIamPolicy. Job so roda `terraform plan`.
    "roles/datastore.viewer",         # refresh do google_firestore_database (environments/{dev,prod}/main.tf) no plan
    "roles/cloudscheduler.viewer",    # refresh do google_cloud_scheduler_job (environments/prod/scheduler.tf) no plan
  ]

  # apply: cria toda a infra dos environments (datasets, Dataform configs, Cloud Run, IAP, IAM, alertas)
  apply_roles = [
    "roles/dataform.admin",
    "roles/bigquery.admin",
    "roles/run.admin",
    "roles/iap.admin",
    "roles/artifactregistry.admin",
    "roles/monitoring.editor",
    "roles/logging.configWriter",
    "roles/secretmanager.admin",
    "roles/iam.serviceAccountAdmin",
    "roles/iam.serviceAccountUser",
    "roles/resourcemanager.projectIamAdmin", # amplo — necessario para bindings de IAM nos environments
    "roles/serviceusage.serviceUsageConsumer",
    "roles/datastore.owner",      # cria o google_firestore_database (environments/{dev,prod}/main.tf, aba ADM)
    "roles/cloudscheduler.admin", # cria o google_cloud_scheduler_job (environments/prod/scheduler.tf)
  ]
}

resource "google_project_iam_member" "plan" {
  for_each = toset(local.plan_roles)
  project  = var.project_id
  role     = each.value
  member   = "serviceAccount:${google_service_account.gh_plan.email}"
}

resource "google_project_iam_member" "apply" {
  for_each = toset(local.apply_roles)
  project  = var.project_id
  role     = each.value
  member   = "serviceAccount:${google_service_account.gh_apply.email}"
}

# state bucket — plan precisa de write tambem (arquivo de lock .tflock)
resource "google_storage_bucket_iam_member" "plan_state" {
  bucket = google_storage_bucket.tfstate.name
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${google_service_account.gh_plan.email}"
}

resource "google_storage_bucket_iam_member" "apply_state" {
  bucket = google_storage_bucket.tfstate.name
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${google_service_account.gh_apply.email}"
}

# SA do Dataform: rodar jobs BigQuery no dp6-ci-polaris (o dataEditor nos datasets billing_platform_*
# vem dos environments/, dataset a dataset)
resource "google_project_iam_member" "dataform_job_user" {
  project = var.project_id
  role    = "roles/bigquery.jobUser"
  member  = "serviceAccount:${google_service_account.dataform.email}"
}

# Acesso operacional pra disparar execucoes manuais do Dataform (Console/API) — sem isso, so as
# SAs de CI (gh-apply-*, com dataform.admin) conseguem rodar um workflowInvocation; humano
# nenhum consegue. O repo-irmao (polaris-cost-model) resolve isso com dataform.editor NO
# REPOSITORIO (fora do Terraform, aplicado a mao); aqui vai a nivel de PROJETO porque nem
# matheus.fuzati@ tem dataform.repositories.setIamPolicy pra replicar o binding por repositorio
# (so resourcemanager.projects.setIamPolicy, via gcp-ci-polaris@). Efeito colateral aceito: o
# grupo billing@ tambem passa a poder operar o repo do cost-model (mesmo projeto, mesmo time).
resource "google_project_iam_member" "dataform_editor_ops" {
  project = var.project_id
  role    = "roles/dataform.editor"
  member  = "group:billing@dp6.com.br"
}
