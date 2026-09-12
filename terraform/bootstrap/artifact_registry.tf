# O repositorio de imagens `apps` em us-central1 JA EXISTE no dp6-ci-polaris
# (compartilhado com o Atlas — ver atlas/docs/finops-labels.md). Nao criamos nem gerenciamos
# aqui para nao brigar de state com o Atlas. Consumido como data source onde precisa:
data "google_artifact_registry_repository" "apps" {
  location      = var.region
  repository_id = "apps"
}
