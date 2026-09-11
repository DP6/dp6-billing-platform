# terraform/bootstrap/

Recursos fundacionais do CI/CD e da ingestão. **State local, apply manual, uma vez.**
Fora dos workflows de CI (que só tocam `terraform/environments/**`).

Cria: APIs · bucket de state remoto · WIF pool + 2 providers (plan / apply-main) ·
SAs `gh-plan-billing-platform` / `gh-apply-billing-platform` / **`sa-billing-platform-dataform`** · Artifact Registry
`apps` · Secret Manager (container do token do Git) · `google_dataform_repository` executando
como `sa-billing-platform-dataform` · IAM de projeto para as SAs.

## Aplicar

```bash
cd terraform/bootstrap
gcloud auth application-default login
terraform init

# 0) se voce ja criou a SA sa-billing-platform-dataform a mao (para desbloquear o grant da TI
#    no dataset/tabela de origem), adote ela no state antes do apply:
terraform import google_service_account.dataform \
  projects/dp6-ci-polaris/serviceAccounts/sa-billing-platform-dataform@dp6-ci-polaris.iam.gserviceaccount.com

# 1) token do Git para o Dataform ler o repo (repo:read em DP6/dp6-billing-platform):
terraform apply -target=google_secret_manager_secret.dataform_git_token   # cria só o container

GH_TOKEN=$(gh auth token)   # ou um PAT fine-grained com Contents:read
printf '%s' "$GH_TOKEN" | gcloud secrets versions add dp6-billing-platform-dataform-git-token --data-file=-

# 2) resto:
terraform apply
```

## Depois do apply

```bash
terraform output -raw github_secrets_cmd          # cola no terminal (confere com o passo 1)
terraform output -raw external_access_request     # texto do pedido para a TI / dono do billing
```

1. **Rodar o `github_secrets_cmd`** — confere/atualiza os 4 secrets de WIF no repo GitHub.
2. **Pedido externo** (ADR-003 — ainda não enviado) — encaminhar o `external_access_request` ao
   dono do `dp6-billing-voucher`: conceder `roles/bigquery.dataViewer` no dataset
   `billing_export` (ou só na tabela `gcp_billing_export_resource_v1_...`) direto para
   `sa-billing-platform-dataform@dp6-ci-polaris.iam.gserviceaccount.com`. Acesso direto à
   tabela bruta — **não** há view intermediária nem grupo envolvido (diverge do
   `polaris-cost-model`, ver ADR-003 deste repo). Sem isso, o Dataform não lê a origem.
3. Seguir para `terraform/environments/` (via CI, depois do primeiro push).

## Não versionar

`terraform.tfstate*` (state local — não perder), `terraform.tfvars`, `.terraform/`.
