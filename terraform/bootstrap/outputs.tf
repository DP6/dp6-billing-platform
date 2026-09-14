output "state_bucket" {
  value = google_storage_bucket.tfstate.name
}

output "wif_provider_plan" {
  value = google_iam_workload_identity_pool_provider.plan.name
}

output "wif_provider_apply" {
  value = google_iam_workload_identity_pool_provider.apply.name
}

output "sa_plan" {
  value = google_service_account.gh_plan.email
}

output "sa_apply" {
  value = google_service_account.gh_apply.email
}

output "sa_dataform" {
  value = google_service_account.dataform.email
}

output "artifact_registry" {
  value = data.google_artifact_registry_repository.apps.id
}

output "dataform_repository" {
  value = google_dataform_repository.billing.id
}

# cola no terminal para setar os secrets do GitHub (confere com o passo 1 que voce ja rodou)
output "github_secrets_cmd" {
  value = <<-EOT
    gh secret set WIF_PROVIDER_PLAN  --repo ${var.github_repo} --body "${google_iam_workload_identity_pool_provider.plan.name}"
    gh secret set WIF_PROVIDER_APPLY --repo ${var.github_repo} --body "${google_iam_workload_identity_pool_provider.apply.name}"
    gh secret set WIF_SA_PLAN        --repo ${var.github_repo} --body "${google_service_account.gh_plan.email}"
    gh secret set WIF_SA_APPLY       --repo ${var.github_repo} --body "${google_service_account.gh_apply.email}"
  EOT
}

# texto do pedido externo (grant direto na tabela bruta — AINDA NAO confirmado com a TI,
# diferente do polaris-cost-model onde a authorized view ja existia. Ver Fase 6 do plano.)
output "external_access_request" {
  value = <<-EOT
    Conceder roles/bigquery.dataViewer para a service account
      ${google_service_account.dataform.email}
    no dataset  dp6-billing-voucher:billing_export  (ou, se a TI preferir granularidade de
    tabela, so em gcp_billing_export_resource_v1_008012_F93445_DFD798 dentro dele).
    Comando (nivel dataset):
      bq add-iam-policy-binding \
        --member="serviceAccount:${google_service_account.dataform.email}" \
        --role="roles/bigquery.dataViewer" \
        "dp6-billing-voucher:billing_export"
    NOTA: diferente do polaris-cost-model (que le uma authorized view ja filtrada por
    projeto), aqui o acesso e DIRETO na tabela bruta da conta inteira — decisao deliberada
    (menos trabalho de TI, superficie de acesso maior). Pipeline nao-assistido, 1x/dia.
  EOT
}

# texto do pedido pra um Super Admin do Workspace (aba ADM — budget/e-mail + relatorio
# semanal, ver plano "ADM tab"). Os e-mails de SA de runtime abaixo sao previsiveis
# (nome-do-service-account@dp6-ci-polaris.iam.gserviceaccount.com, ver terraform/modules/
# app_service/main.tf) mas so existem de verdade depois do 1o apply de environments/{dev,prod} —
# conferir com `terraform output -raw ...` la antes de mandar, se quiser confirmar o Client ID.
output "workspace_delegation_request" {
  value = <<-EOT
    Domain-wide delegation, concedida por um Super Admin do Workspace
    (provavelmente admin.victoria@dp6.com.br ou TI) — Admin Console >
    Security > API controls > Domain-wide delegation > Add new:

    1) SA de runtime DEV (billing-platform-api-dev-run@${var.project_id}.iam.gserviceaccount.com):
       escopos
         https://www.googleapis.com/auth/admin.directory.group.readonly
         https://www.googleapis.com/auth/admin.directory.group.member.readonly
       Motivo: checar pertencimento a gcp-dp6-gti@dp6.com.br pra liberar a aba ADM.
       Só esses 2 -- dev nunca manda e-mail de verdade (roda em dry-run).

    2) SA de runtime PROD (billing-platform-api-prod-run@${var.project_id}.iam.gserviceaccount.com):
       os MESMOS 2 escopos acima + adicionalmente
         https://www.googleapis.com/auth/gmail.send
       Motivo do gmail.send (SO aqui): disparo do relatorio semanal de custo por
       e-mail, impersonando admin.victoria@dp6.com.br.

    Sem isso: só matheus.fuzati@dp6.com.br (e-mail bootstrap, fail-closed por
    design) consegue acessar a aba ADM; o relatório semanal roda em dry-run
    pra sempre em qualquer ambiente.
  EOT
}
