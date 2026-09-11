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
  ]
}

resource "google_project_service" "this" {
  for_each           = toset(local.apis)
  service            = each.value
  disable_on_destroy = false
}
