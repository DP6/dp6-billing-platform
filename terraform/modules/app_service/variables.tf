variable "project_id" { type = string }
variable "project_number" { type = string }
variable "region" {
  type    = string
  default = "us-central1"
}
variable "env" { type = string } # dev | prod

variable "name" { type = string } # "billing-platform-api" | "billing-web"
variable "image" {
  type = string # us-central1-docker.pkg.dev/dp6-ci-polaris/apps/<name>:<tag>
}
variable "env_vars" {
  type    = map(string)
  default = {}
}

# quem pode abrir a pagina (via IAP). Ex: ["group:algum-grupo@dp6.com.br", "user:fulano@dp6.com.br"]
# Atencao: membro inexistente nao gera erro no apply — a policy do IAP so fica vazia e ninguem entra.
variable "allowed_members" {
  type = list(string)
}

# papeis de PROJETO para a SA de runtime (ex: ["roles/bigquery.jobUser"] para a api)
variable "runtime_project_roles" {
  type    = list(string)
  default = []
}

variable "min_instances" {
  type    = number
  default = 0
}
variable "max_instances" {
  type    = number
  default = 2
}
