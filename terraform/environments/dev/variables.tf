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

# PROVISORIO: o grupo gcp-billing-platform@dp6.com.br nunca existiu — foi inventado pela
# renomeacao mecanica do fork (o real, do repo-irmao, e gcp-ci-polaris@dp6.com.br). Resultado:
# a politica do IAP ficou vazia e ninguem acessava o painel.
# Enquanto a TI nao cria um grupo dedicado, fica so o usuario. NAO reaproveitar o
# gcp-ci-polaris@: aquele grupo da acesso ao projeto dp6-ci-polaris, e este painel mostra o
# custo de TODOS os projetos da conta de faturamento.
variable "iap_allowed_members" {
  type    = list(string)
  default = ["user:matheus.fuzati@dp6.com.br"]
}

variable "alert_email" {
  type    = string
  default = "matheus.fuzati@dp6.com.br" # idem: trocar pelo grupo dedicado quando existir
}
