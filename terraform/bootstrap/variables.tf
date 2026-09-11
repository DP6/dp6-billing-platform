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
  default = "dp6-ci-polaris-tfstate-cost-model"
}

variable "billing_group_email" {
  type    = string
  default = "gcp-billing-platform@dp6.com.br"
  # a SA sa-billing-platform-dataform é adicionada a este grupo (pedido externo — ver README)
}
