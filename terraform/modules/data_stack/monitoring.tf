# Alerta de falha do Dataform -> e-mail para gcp-billing-platform@dp6.com.br.
# Politica log-based sobre o log de conclusao de workflowInvocation com estado FAILED.

resource "google_monitoring_notification_channel" "email" {
  project      = var.project_id
  display_name = "billing-polaris ${var.env} - e-mail"
  type         = "email"
  labels = {
    email_address = var.alert_email
  }
}

resource "google_monitoring_alert_policy" "dataform_failed" {
  project      = var.project_id
  display_name = "billing-polaris ${var.env} - Dataform workflow FAILED"
  combiner     = "OR"
  enabled      = true

  # CONFIRMAR o formato exato do log de conclusao do Dataform na versao atual.
  # Base: Cloud Logging emite um entry por workflowInvocation concluida.
  conditions {
    display_name = "workflowInvocation FAILED"
    condition_matched_log {
      filter = <<-EOT
        resource.type = "dataform.googleapis.com/Repository"
        AND resource.labels.repository_id = "dp6-billing-platform"
        AND (severity >= ERROR OR jsonPayload.terminalState = "FAILED")
      EOT
    }
  }

  alert_strategy {
    notification_rate_limit {
      period = "3600s"
    }
    auto_close = "604800s"
  }

  notification_channels = [google_monitoring_notification_channel.email.id]

  documentation {
    content   = "Falha no pipeline de custo do CI Polaris (${var.env}). Ver o workflowInvocation no console do Dataform; conferir a assertion que falhou (assert_fct_reconciliation / assert_source_freshness / assert_stg_*). Runbook: docs/ do repo dp6-billing-platform."
    mime_type = "text/markdown"
  }
}
