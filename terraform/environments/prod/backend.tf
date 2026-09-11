terraform {
  backend "gcs" {
    bucket = "dp6-ci-polaris-tfstate-billing-platform"
    prefix = "environments/prod"
  }
}
