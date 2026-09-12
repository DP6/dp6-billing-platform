terraform {
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 6.0"
    }
    google-beta = {
      source  = "hashicorp/google-beta"
      version = "~> 6.0"
    }
  }
}

locals {
  service_name = "${var.name}-${var.env}" # billing-platform-api-dev, billing-web-prod, ...
}

# SA de runtime — herda o sufixo de ambiente (padrao do Atlas)
resource "google_service_account" "runtime" {
  project      = var.project_id
  account_id   = "${var.name}-${var.env}-run"
  display_name = "Runtime ${local.service_name}"
}

resource "google_project_iam_member" "runtime_roles" {
  for_each = toset(var.runtime_project_roles)
  project  = var.project_id
  role     = each.value
  member   = "serviceAccount:${google_service_account.runtime.email}"
}

# Cloud Run v2 — provider beta por causa de iap_enabled (igual ao modules/cloud-run do Atlas)
resource "google_cloud_run_v2_service" "this" {
  provider = google-beta
  project  = var.project_id
  name     = local.service_name
  location = var.region

  ingress     = "INGRESS_TRAFFIC_ALL"
  iap_enabled = true

  labels = {
    app         = "dp6-billing-platform"
    environment = var.env
    managed-by  = "terraform"
  }

  template {
    service_account = google_service_account.runtime.email
    scaling {
      min_instance_count = var.min_instances
      max_instance_count = var.max_instances
    }
    containers {
      image = var.image
      ports { container_port = 8080 }
      dynamic "env" {
        for_each = var.env_vars
        content {
          name  = env.key
          value = env.value
        }
      }
      resources {
        limits   = { cpu = "1", memory = "512Mi" }
        cpu_idle = true # only-on-request (recomendacao da aba Otimizacao)
      }
    }
  }

  lifecycle {
    ignore_changes = [template[0].containers[0].image] # a imagem e atualizada pelo deploy do CI
  }
}

# IAP: o service agent do IAP precisa poder invocar o Cloud Run
resource "google_cloud_run_v2_service_iam_member" "iap_invoker" {
  project  = var.project_id
  location = var.region
  name     = google_cloud_run_v2_service.this.name
  role     = "roles/run.invoker"
  member   = "serviceAccount:service-${var.project_number}@gcp-sa-iap.iam.gserviceaccount.com"
}

# quem pode passar pelo IAP (allowlist) — no recurso IAP, nao no servico Cloud Run
resource "google_iap_web_cloud_run_service_iam_member" "iap_users" {
  for_each               = toset(var.allowed_members)
  project                = var.project_id
  location               = var.region
  cloud_run_service_name = google_cloud_run_v2_service.this.name
  role                   = "roles/iap.httpsResourceAccessor"
  member                 = each.value
}
