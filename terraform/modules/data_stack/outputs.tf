output "dataset_ids" {
  value = { for k, ds in google_bigquery_dataset.this : k => ds.dataset_id }
}

output "reporting_dataset" {
  value = google_bigquery_dataset.this["reporting"].dataset_id
}

output "release_config" {
  value = google_dataform_repository_release_config.this.id
}

output "workflow_configs" {
  value = [
    google_dataform_repository_workflow_config.daily.id,
    google_dataform_repository_workflow_config.closeout.id,
  ]
}

output "notification_channel" {
  value = google_monitoring_notification_channel.email.id
}
