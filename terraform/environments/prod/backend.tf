terraform {
  backend "gcs" {
    bucket = "dp6-ci-polaris-tfstate-cost-model"
    prefix = "environments/prod"
  }
}
