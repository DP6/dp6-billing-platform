# release_config: compila o repo no git_commitish, schema_suffix por ambiente
# (billing_platform_stg -> billing_platform_stg_${env}, etc. — os .sqlx nao mudam).
resource "google_dataform_repository_release_config" "this" {
  provider      = google-beta
  project       = var.project_id
  region        = var.region
  repository    = var.dataform_repository
  name          = var.env
  git_commitish = var.git_commitish
  cron_schedule = var.compile_cron
  time_zone     = var.time_zone

  code_compilation_config {
    default_database = var.project_id
    default_location = var.location
    schema_suffix    = var.env
  }
}

# execucao diaria — so a tag billing_platform, com dependencias transitivas
resource "google_dataform_repository_workflow_config" "daily" {
  provider       = google-beta
  project        = var.project_id
  region         = var.region
  repository     = var.dataform_repository
  name           = "${var.env}-daily"
  release_config = google_dataform_repository_release_config.this.id
  cron_schedule  = var.run_cron
  time_zone      = var.time_zone

  invocation_config {
    included_tags                            = ["billing_platform"]
    transitive_dependencies_included         = true
    fully_refresh_incremental_tables_enabled = false
    service_account                          = var.dataform_sa_email
  }
}

# fechamento mensal — full refresh (consolida o mes de fatura recem-fechado)
resource "google_dataform_repository_workflow_config" "closeout" {
  provider       = google-beta
  project        = var.project_id
  region         = var.region
  repository     = var.dataform_repository
  name           = "${var.env}-monthly-closeout"
  release_config = google_dataform_repository_release_config.this.id
  cron_schedule  = var.closeout_cron
  time_zone      = var.time_zone

  invocation_config {
    included_tags                            = ["billing_platform"]
    transitive_dependencies_included         = true
    fully_refresh_incremental_tables_enabled = true
    service_account                          = var.dataform_sa_email
  }
}

