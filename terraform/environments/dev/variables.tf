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

# do bootstrap (valores deterministicos — sobrescreva em dev.auto.tfvars se mudarem)
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
  default = "develop" # dev compila a branch develop; prod compila main
}

# imagem: no 1o apply usa o hello (placeholder); o CI faz o deploy real e o TF ignora `image`
variable "api_image" {
  type    = string
  default = "us-docker.pkg.dev/cloudrun/container/hello"
}

variable "iap_allowed_members" {
  type    = list(string)
  default = ["group:gcp-billing-platform@dp6.com.br"]
}

variable "alert_email" {
  type    = string
  default = "gcp-billing-platform@dp6.com.br"
}
