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
  default = "us-central1"
}
variable "location" {
  type    = string
  default = "US"
}

variable "dataform_repository" {
  type    = string
  default = "dp6-billing-platform"
}
variable "dataform_sa_email" {
  type    = string
  default = "sa-billing-platform-dataform@dp6-ci-polaris.iam.gserviceaccount.com"
}

variable "git_commitish" {
  type    = string
  default = "main"
}

variable "api_image" {
  type    = string
  default = "us-docker.pkg.dev/cloudrun/container/hello"
}

# Grupo dedicado criado pela TI em 2026-09-14 (billing@dp6.com.br) — mesma mudanca do dev
# (ver comentario em environments/dev/variables.tf).
variable "iap_allowed_members" {
  type    = list(string)
  default = ["group:billing@dp6.com.br", "user:matheus.fuzati@dp6.com.br"]
}

variable "alert_email" {
  type    = string
  default = "matheus.fuzati@dp6.com.br"
}
