# ---- SAs de CI ----
resource "google_service_account" "gh_plan" {
  account_id   = "gh-plan-billing-platform"
  display_name = "GitHub Actions - terraform plan (read-only)"
}

resource "google_service_account" "gh_apply" {
  account_id   = "gh-apply-billing-platform"
  display_name = "GitHub Actions - terraform apply (main only)"
}

# ---- SA dedicada do Dataform ----
# Le DIRETO a tabela bruta dp6-billing-voucher.billing_export.gcp_billing_export_resource_v1_008012_F93445_DFD798
# (conta inteira, todos os projetos) — SEM indirecao de authorized view (divergencia deliberada
# do padrao do polaris-cost-model/ADR-003, ver docs/adr/ nesta repo). O acesso vem de FORA
# (a TI concede roles/bigquery.dataViewer no dataset/tabela de origem). Ver README, "Depois do apply".
# Se a SA ja foi criada a mao para desbloquear a TI: `terraform import` antes do apply (README).
resource "google_service_account" "dataform" {
  account_id   = "sa-billing-platform-dataform"
  display_name = "Dataform - le o billing export da conta inteira (todos os projetos)"
}

# ---- quem pode impersonar via WIF ----
resource "google_service_account_iam_member" "plan_wif" {
  service_account_id = google_service_account.gh_plan.name
  role               = "roles/iam.workloadIdentityUser"
  member             = "principalSet://iam.googleapis.com/${google_iam_workload_identity_pool.gh.name}/attribute.repository/${var.github_repo}"
}

resource "google_service_account_iam_member" "apply_wif" {
  service_account_id = google_service_account.gh_apply.name
  role               = "roles/iam.workloadIdentityUser"
  member             = "principalSet://iam.googleapis.com/${google_iam_workload_identity_pool.gh.name}/attribute.repository/${var.github_repo}"
}

# ---- Dataform service agent impersona a SA dedicada ----
# (o Dataform executa os jobs BigQuery como sa-billing-platform-dataform quando o repository/workflow_config
#  define service_account = essa SA — ver terraform/modules e environments/)
# usa google_project_service_identity.dataform (dataform_repo.tf) — o agent e criado sob demanda.
resource "google_service_account_iam_member" "dataform_agent_impersonate" {
  service_account_id = google_service_account.dataform.name
  role               = "roles/iam.serviceAccountTokenCreator"
  member             = "serviceAccount:${google_project_service_identity.dataform.email}"

  # roda depois do binding do Secret (que ja confirmou que o agent propagou) — evita corrida
  depends_on = [google_secret_manager_secret_iam_member.dataform_agent_reads_token]
}

# serviceAccountTokenCreator (acima) NAO cobre o disparo do CRON: pra iniciar a execucao
# agendada de um workflow_config com service_account = essa SA, o agent precisa poder
# "act as" ela (permissao actAs, papel iam.serviceAccountUser — role diferente do de cima).
# Sem isso as execucoes de dev-daily/prod-daily falham ANTES de comecar, todo dia, com
# "The caller does not have permission to act as service account" (achado em 2026-09-15,
# 3 dias seguidos falhando desde a criacao do workflow_config em 2026-09-12).
resource "google_service_account_iam_member" "dataform_agent_act_as" {
  service_account_id = google_service_account.dataform.name
  role               = "roles/iam.serviceAccountUser"
  member             = "serviceAccount:${google_project_service_identity.dataform.email}"

  depends_on = [google_secret_manager_secret_iam_member.dataform_agent_reads_token]
}
