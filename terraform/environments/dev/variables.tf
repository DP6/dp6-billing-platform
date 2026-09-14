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

# Grupo dedicado criado pela TI em 2026-09-14 (billing@dp6.com.br) — resolve o provisorio
# anterior, onde so o usuario tinha acesso porque o grupo gcp-billing-platform@dp6.com.br
# (inventado pela renomeacao mecanica do fork) nunca existiu de verdade e a politica do IAP
# ficava vazia. NAO reaproveitar o gcp-ci-polaris@ do repo-irmao: aquele grupo da acesso a
# 1 projeto so, e este painel mostra o custo de TODOS os projetos da conta de faturamento.
variable "iap_allowed_members" {
  type    = list(string)
  default = ["group:billing@dp6.com.br", "user:matheus.fuzati@dp6.com.br"]
}

variable "alert_email" {
  type    = string
  default = "matheus.fuzati@dp6.com.br" # idem: trocar pelo grupo dedicado quando existir
}
