# Disparo semanal do relatorio de custo por e-mail (aba ADM) -- so em PROD,
# dev nunca envia e-mail de verdade (email_report.py roda em dry-run lá).
#
# A SA do Scheduler passa pelo MESMO IAP que protege o resto do Cloud Run
# (google_iap_web_cloud_run_service_iam_member.iap_users, no modulo
# app_service, so aceita quem esta em var.allowed_members) -- por isso essa SA
# precisa de roles/iap.httpsResourceAccessor tambem. NAO concede roles/run.invoker
# pra essa SA: quem invoca o Cloud Run de fato e o proprio agente do IAP
# (google_cloud_run_v2_service_iam_member.iap_invoker, ja existente no modulo),
# nao o chamador original -- dar run.invoker direto deixaria o Scheduler pular
# o IAP (sem X-Goog-IAP-JWT-Assertion), quebrando require_scheduler em auth.py.
# Se o job falhar com erro de permissao apontando pro IAM do Cloud Run (nao do
# IAP), so ai adicionar run.invoker.

resource "google_service_account" "weekly_report_scheduler" {
  project      = var.project_id
  account_id   = "billing-platform-weekly-sched"
  display_name = "Cloud Scheduler - relatorio semanal de custo"
}

resource "google_iap_web_cloud_run_service_iam_member" "scheduler_iap_access" {
  project                = var.project_id
  location               = var.region
  cloud_run_service_name = module.api.service_name
  role                   = "roles/iap.httpsResourceAccessor"
  member                 = "serviceAccount:${google_service_account.weekly_report_scheduler.email}"
}

resource "google_cloud_scheduler_job" "weekly_cost_report" {
  project   = var.project_id
  region    = var.region
  name      = "billing-platform-weekly-cost-report"
  schedule  = "0 8 * * 1" # segunda 08:00
  time_zone = "America/Sao_Paulo"

  http_target {
    http_method = "POST"
    uri         = "${module.api.uri}/api/internal/weekly-report/scheduled-run"
    oidc_token {
      service_account_email = google_service_account.weekly_report_scheduler.email
      audience              = module.api.uri
    }
  }
}

# Sincronizacao diaria do budget/e-mail do GCP Billing Budgets pra aba ADM
# (gcp_budgets.py) -- mesma SA/binding IAP do job semanal acima, so endpoint
# diferente. Roda antes do e-mail de segunda (08:00) pra ele sair com dado
# fresco. Bloqueado por roles/billing.viewer na billing account ate a TI
# conceder (pedido externo, ver plano da feature) -- o endpoint ja devolve
# 503 honesto enquanto isso, nao quebra silenciosamente.
resource "google_cloud_scheduler_job" "gcp_budgets_daily_sync" {
  project   = var.project_id
  region    = var.region
  name      = "billing-platform-gcp-budgets-sync"
  schedule  = "0 5 * * *" # todo dia, 05:00
  time_zone = "America/Sao_Paulo"

  http_target {
    http_method = "POST"
    uri         = "${module.api.uri}/api/internal/gcp-budgets/scheduled-run"
    oidc_token {
      service_account_email = google_service_account.weekly_report_scheduler.email
      audience              = module.api.uri
    }
  }
}
