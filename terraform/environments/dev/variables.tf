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

# Domain-wide: qualquer conta @dp6.com.br loga (era so billing@/gcp-dp6-gti@/
# matheus.fuzati@ -- ver git blame). Seguro ampliar so DEPOIS do ACL por projeto
# (project_access.py + aba ADM) estar validado em dev e prod: os 3 principals de
# bypass (project_access.is_bypass_principal) sao exatamente o allowlist antigo,
# entao ninguem que ja tinha acesso perde nada, e quem entra novo cai direto na
# tela de "sem projetos liberados" (fail-closed) ate ser cadastrado no ADM.
# NAO aplicar este apply antes do passo 5 do rollout combinado (ver o plano).
variable "iap_allowed_members" {
  type    = list(string)
  default = ["domain:dp6.com.br"]
}

variable "alert_email" {
  type    = string
  default = "matheus.fuzati@dp6.com.br" # idem: trocar pelo grupo dedicado quando existir
}
