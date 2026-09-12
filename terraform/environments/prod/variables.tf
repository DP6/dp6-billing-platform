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

# PROVISORIO — mesma situacao do dev (ver comentario em environments/dev/variables.tf): o
# grupo gcp-billing-platform@dp6.com.br nao existe. Prod ainda nao foi aplicado; quando for,
# revisar isto antes (painel de custo da conta inteira merece grupo proprio, nao usuario solto).
variable "iap_allowed_members" {
  type    = list(string)
  default = ["user:matheus.fuzati@dp6.com.br"]
}

variable "alert_email" {
  type    = string
  default = "matheus.fuzati@dp6.com.br"
}
