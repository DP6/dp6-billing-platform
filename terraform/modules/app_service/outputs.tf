output "service_name" {
  value = google_cloud_run_v2_service.this.name
}

output "uri" {
  value = google_cloud_run_v2_service.this.uri
}

output "runtime_sa_email" {
  value = google_service_account.runtime.email
}
