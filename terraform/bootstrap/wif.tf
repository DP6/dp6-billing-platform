# Workload Identity Federation para o GitHub Actions do DP6/dp6-billing-platform.
# 1 pool, 2 providers: plan (read-only, qualquer ref) / apply (main + develop -- fluxo de
# promocao branch -> PR develop -> deploy dev -> PR main -> deploy prod, ver
# .github/workflows/deploy-dev.yml e deploy-prod.yml).

resource "google_iam_workload_identity_pool" "gh" {
  workload_identity_pool_id = "dp6-billing-platform"
  display_name              = "dp6-billing-platform GitHub"
  depends_on                = [google_project_service.this]
}

resource "google_iam_workload_identity_pool_provider" "plan" {
  workload_identity_pool_id          = google_iam_workload_identity_pool.gh.workload_identity_pool_id
  workload_identity_pool_provider_id = "github-plan"
  display_name                       = "GitHub Actions - plan"

  attribute_mapping = {
    "google.subject"       = "assertion.sub"
    "attribute.repository" = "assertion.repository"
    "attribute.ref"        = "assertion.ref"
  }
  attribute_condition = "assertion.repository == \"${var.github_repo}\""

  oidc {
    issuer_uri = "https://token.actions.githubusercontent.com"
  }
}

resource "google_iam_workload_identity_pool_provider" "apply" {
  workload_identity_pool_id          = google_iam_workload_identity_pool.gh.workload_identity_pool_id
  workload_identity_pool_provider_id = "github-apply"
  display_name                       = "GH Actions apply (main+dev)"

  attribute_mapping = {
    "google.subject"       = "assertion.sub"
    "attribute.repository" = "assertion.repository"
    "attribute.ref"        = "assertion.ref"
  }
  # gate de branch vive aqui — um token de branch de PR nem consegue emitir por este
  # provider. develop entrou junto com o fluxo de promocao dev->prod (deploy-dev.yml /
  # deploy-prod.yml): dev aplica de verdade em push em develop, prod em push em main.
  attribute_condition = "assertion.repository == \"${var.github_repo}\" && (assertion.ref == \"refs/heads/main\" || assertion.ref == \"refs/heads/develop\")"

  oidc {
    issuer_uri = "https://token.actions.githubusercontent.com"
  }
}
