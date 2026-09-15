# Disparo do relatorio semanal de custo por e-mail + sincronizacao diaria de
# budget do GCP (aba ADM) -- so em PROD, dev nunca envia e-mail de verdade
# (email_report.py roda em dry-run la, e o botao/endpoint de sync do GCP
# tambem so faz sentido com dado real).
#
# ACHADO tentando o job pela 1a vez (nunca tinha rodado de verdade antes):
# o IAP deste projeto usa um OAuth client GERENCIADO PELO GOOGLE (nao um
# customizado) -- esse tipo de client bloqueia por padrao qualquer token
# OIDC padrao vindo de service account, que e exatamente como o
# `oidc_token` do Cloud Scheduler autentica. Testado com 2 formatos de
# audience diferentes contra a URL do modulo "api" (a do Cloud Run e o
# formato /projects/.../services/... que o proprio app usa pra verificar o
# header do IAP) -- os dois deram 401 "Invalid JWT audience" ANTES de
# chegar no Cloud Run (confirmado: nenhum log nosso, `x-goog-iap-generated-
# response: true` na resposta). So funcionou com um JWT auto-assinado pela
# propria SA (gcloud iam service-accounts sign-jwt) -- fluxo que o
# `oidc_token` do Terraform nao sabe gerar.
#
# FIX: 2o deploy do MESMO codigo/imagem, SEM IAP, so pros 2 endpoints
# internos -- protegido por roles/run.invoker puro (que o Cloud Scheduler
# sabe usar nativamente, sem token especial), concedido SO pra SA do
# scheduler. O app confia nesse portao via
# BILLING_API_TRUST_RUN_INVOKER_AS_SCHEDULER=true (ver auth.require_scheduler)
# -- esse deploy nunca tem o header do IAP pra verificar (nunca passa por
# ele), entao a ausencia do header ali nao e sinal de request nao-autenticada.

resource "google_service_account" "weekly_report_scheduler" {
  project      = var.project_id
  account_id   = "billing-platform-weekly-sched"
  display_name = "Cloud Scheduler - relatorio semanal + sync de budget"
}

# Mesma imagem/SA de runtime do deploy principal (module.api) -- herda os
# MESMOS grants (BigQuery, Firestore, self-token-creator pra Gmail/Directory
# via Signer) sem precisar duplicar nenhum IAM. Ingress ALL + run.invoker
# restrito a service_account_iam_member abaixo -- SEM iap_enabled.
resource "google_cloud_run_v2_service" "internal" {
  provider = google-beta
  project  = var.project_id
  name     = "billing-platform-api-internal-${local.env}"
  location = var.region

  ingress = "INGRESS_TRAFFIC_ALL"

  labels = {
    app         = "dp6-billing-platform"
    environment = local.env
    managed-by  = "terraform"
    purpose     = "internal-scheduler-only"
  }

  template {
    service_account = module.api.runtime_sa_email
    scaling {
      min_instance_count = 0
      max_instance_count = 1
    }
    containers {
      image = var.api_image
      ports { container_port = 8080 }
      dynamic "env" {
        for_each = local.api_env_vars
        content {
          name  = env.key
          value = env.value
        }
      }
      env {
        name  = "BILLING_API_RUNTIME_SA_EMAIL"
        value = module.api.runtime_sa_email
      }
      env {
        name  = "BILLING_API_TRUST_RUN_INVOKER_AS_SCHEDULER"
        value = "true"
      }
      resources {
        limits   = { cpu = "1", memory = "512Mi" }
        cpu_idle = true
      }
    }
  }

  lifecycle {
    ignore_changes = [template[0].containers[0].image]
  }
}

resource "google_cloud_run_v2_service_iam_member" "internal_scheduler_invoker" {
  project  = var.project_id
  location = var.region
  name     = google_cloud_run_v2_service.internal.name
  role     = "roles/run.invoker"
  member   = "serviceAccount:${google_service_account.weekly_report_scheduler.email}"
}

resource "google_cloud_scheduler_job" "weekly_cost_report" {
  project   = var.project_id
  region    = var.region
  name      = "billing-platform-weekly-cost-report"
  schedule  = "0 8 * * 1" # segunda 08:00
  time_zone = "America/Sao_Paulo"

  http_target {
    http_method = "POST"
    uri         = "${google_cloud_run_v2_service.internal.uri}/api/internal/weekly-report/scheduled-run"
    oidc_token {
      service_account_email = google_service_account.weekly_report_scheduler.email
      audience              = google_cloud_run_v2_service.internal.uri
    }
  }
}

# Sincronizacao diaria do budget/e-mail do GCP Billing Budgets pra aba ADM
# (gcp_budgets.py) -- mesma SA/deploy interno do job semanal acima, so
# endpoint diferente. Roda antes do e-mail de segunda (08:00) pra ele sair
# com dado fresco. Bloqueado por roles/billing.viewer na billing account ate
# a TI conceder (pedido externo, ver plano da feature) -- o endpoint ja
# devolve 503 honesto enquanto isso, nao quebra silenciosamente.
resource "google_cloud_scheduler_job" "gcp_budgets_daily_sync" {
  project   = var.project_id
  region    = var.region
  name      = "billing-platform-gcp-budgets-sync"
  schedule  = "0 5 * * *" # todo dia, 05:00
  time_zone = "America/Sao_Paulo"

  http_target {
    http_method = "POST"
    uri         = "${google_cloud_run_v2_service.internal.uri}/api/internal/gcp-budgets/scheduled-run"
    oidc_token {
      service_account_email = google_service_account.weekly_report_scheduler.email
      audience              = google_cloud_run_v2_service.internal.uri
    }
  }
}
