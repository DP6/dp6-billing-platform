variable "project_id" {
  type    = string
  default = "dp6-ci-polaris"
}

variable "project_number" {
  type    = string
  default = "209825626529"
}

variable "region" {
  type    = string
  default = "us-central1" # mesmo do Atlas
}

variable "github_repo" {
  type    = string
  default = "DP6/dp6-billing-platform"
}

variable "state_bucket" {
  type    = string
  default = "dp6-ci-polaris-tfstate-billing-platform"
  # NAO reaproveitar o bucket do polaris-cost-model (dp6-ci-polaris-tfstate-cost-model) —
  # states de repos diferentes nunca compartilham bucket/prefix.
}
